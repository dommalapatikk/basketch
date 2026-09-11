// classifyDeals — the bridge between the existing pipeline and the agent.
//
// run.ts still speaks UnifiedDeal; component 3 will replace that with Offer.
// Until then this adapter lets the agent replace categorize.ts without
// rewriting the whole pipeline in one step — a smaller, reversible change.
//
// WHAT THIS REPLACES, and why it matters:
//
//   run.ts:168   .map(deal => categorizeDeal(deal))
//   run.ts:169   .filter(d => d.taxonomyConfidence >= MIN_TAXONOMY_CONFIDENCE)
//
// That filter SILENTLY DELETED every product the keyword matcher was unsure
// about. Nothing was ever visibly uncertain, so nothing was ever reviewed —
// which is how tomato purée sat in fresh vegetables for months. Decision D3
// retires it: an uncertain product keeps its price and loses only its label.

import type { Deal, UnifiedDeal } from '../../../shared/types'
import { isPublishable } from '../../../shared/types'
import { markUncertain, storageFrom } from '../domain/classification'
import { isOk } from '../../collection/domain/result'
import type { CachedClassification, ClassificationCache } from '../domain/classification-cache'
import { CURRENT_VERSIONS, cacheKeyFor, needsEnrichment, normaliseForCache } from '../domain/classification-cache'
import type { ClassificationRequest, Classifier } from '../domain/classifier'
import { FREE_TIER_BUDGET, ZERO_SPEND } from '../domain/guardrails'
import { planRun } from '../domain/run-plan'
import { type GraphDeps, type Outcome, buildClassifyGraph } from './classify-graph'

export type ClassifyDealsDeps = {
  cache: ClassificationCache
  tier1: Classifier
  /**
   * Extracts per-category attributes after classification.
   *
   * Optional: without it products still classify, they just carry no metadata.
   * Enrichment must never be able to cost a product its category.
   */
  enricher?: {
    enrich(items: readonly { request: ClassificationRequest; subCategory: string }[]): Promise<{
      attributes: Map<string, Record<string, unknown>>
      tokens: number
    }>
  } | null
  judge: GraphDeps['judge']
  reflector: GraphDeps['reflector']
  runId: string
  log?: (message: string) => void
}

export type ClassifyDealsResult = {
  /** Every deal that has a category. Uncertain ones are included, flagged (D3). */
  readonly deals: Deal[]
  readonly stats: {
    readonly total: number
    readonly cacheHits: number
    /** Published with a label that can be shown. */
    readonly classified: number
    /** Published with the label withheld — the weekly human review queue. */
    readonly uncertain: number
    readonly rejected: number
    readonly blocked: number
    /**
     * Not published: no classification exists at all. Distinct from `uncertain`,
     * which HAS a category and is on the site. Conflating the two is how a
     * silent drop looks like a review queue.
     */
    readonly heldBack: number
    /**
     * Judge verdicts that never happened.
     *
     * gemini-judge catches every failure — 402 out of credit, 429, a parse
     * error — and returns `unavailable`, which classify-graph then treats as
     * `classified`. So a dead judge is otherwise indistinguishable from one
     * that approved everything, in every log line and every stat.
     *
     * The information was already on each Outcome and was thrown away. Healthy
     * is ~0. A number near the judged count means the escalation trigger is
     * gone and the run shipped unverified.
     *
     * Detection, not enforcement: halting on a transient blip would be worse
     * than shipping unjudged, and there is no baseline yet.
     */
    readonly judgeUnavailable: number
    readonly deferred: number
    readonly isColdStart: boolean
  }
}

/**
 * Confidence recorded for a cached result.
 *
 * The cache stores the confidence the model reported at the time, so this is
 * only a fallback for rows written before confidence was tracked.
 */
const CACHED_CONFIDENCE = 0.9

/**
 * Products classified and persisted before the next chunk starts.
 *
 * 100 is four tier-1 batches of 25. Small enough that a killed run loses at
 * most a couple of minutes of quota; large enough that the cache round-trip
 * is not the dominant cost. The whole point is that a run which dies part-way
 * leaves the cold start measurably further along than it found it.
 */
const CHUNK_SIZE = 100

/**
 * Enriches one chunk and writes it to the cache.
 *
 * Enrichment runs here rather than once at the end because the sub-category
 * decides which attribute schema applies, and because the cache entry should
 * carry the attributes with it — otherwise a resumed run re-pays for them.
 *
 * A failure in enrichment costs metadata, never a category: the classification
 * is still cached, just without attributes.
 */
async function persistChunk(
  chunk: readonly Outcome[],
  deps: ClassifyDealsDeps,
  attributesByName: Map<string, Record<string, unknown>>,
  log: (message: string) => void,
  // From the PLAN, never decided here. planRun owns "what can this run
  // afford" — the same reason judgeSampleRate lives there. A condition in the
  // caller is the anti-pattern the DDD rules name.
  enrich: boolean,
): Promise<void> {
  const classified = chunk.filter((o) => o.status === 'classified' && o.classification !== null)

  if (deps.enricher && enrich && classified.length > 0) {
    const toEnrich = classified.map((o) => ({
      request: o.request,
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      subCategory: o.classification!.subCategory,
    }))
    try {
      const { attributes, tokens } = await deps.enricher.enrich(toEnrich)
      for (const [name, attrs] of attributes) attributesByName.set(name, attrs)
      log(`[transform] enriched ${attributes.size}/${toEnrich.length} products (${tokens} tokens)`)
    } catch (e) {
      log(`[transform] enrichment failed for this chunk: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const toCache = classified.map((o) => ({
    cacheKey: cacheKeyFor(o.request.productName, CURRENT_VERSIONS),
    normalisedName: normaliseForCache(o.request.productName),
    // biome-ignore lint/style/noNonNullAssertion: filtered above
    classification: o.classification!,
    attributes: attributesByName.get(o.request.productName) ?? {},
    runId: deps.runId,
  }))

  if (toCache.length > 0) {
    const saved = await deps.cache.save(toCache)
    log(`[transform] cached ${isOk(saved) ? saved.value : 0} classifications`)
  }
}

/**
 * UNBLOCKED 2026-09-11 by component 3.
 *
 * This function used to hold uncertain products back from the write. The reason
 * was real at the time: `deals.category` was NOT NULL, so there was nowhere to
 * record "we are not sure", and filing uncertain fresh meat under long-life
 * would have been worse than the bug being removed.
 *
 * 20260911_offer_fields.sql dropped that NOT NULL and added `is_uncertain`, so
 * the workaround has outlived its cause. D3 applies as written again: an
 * uncertain product keeps its price and loses only its LABEL.
 *
 * Note what "uncertain" does NOT mean here. Every product that reaches this
 * point HAS a category and a sub-category — `createClassification` refuses to
 * build one without both, and validates them against the taxonomy. The flag
 * says the label may be wrong, not that it is missing. Products with no
 * classification at all are a different case and are still held back.
 */
type DealFields = {
  category: string
  subCategory: string | null
  confidence: number
  isUncertain: boolean
  attributes: Record<string, unknown>
}

function toDeal(deal: UnifiedDeal, fields: DealFields): Deal {
  return {
    ...deal,
    discountPercent: deal.discountPercent ?? 0,
    category: fields.category as Deal['category'],
    subCategory: fields.subCategory,
    taxonomyConfidence: fields.confidence,
    isUncertain: fields.isUncertain,
    // Lifted out of the jsonb blob onto its own column: the Frozen browse tile
    // is a facet COUNT over storage, and counting through jsonb is the wrong
    // shape for it (ADR-001).
    storage: storageFrom(fields.attributes),
    attributes: fields.attributes,
  } as Deal
}


export async function classifyDeals(
  deals: readonly UnifiedDeal[],
  deps: ClassifyDealsDeps,
): Promise<ClassifyDealsResult> {
  const log = deps.log ?? (() => {})

  // ── 1. Cache ──────────────────────────────────────────────────────────────
  const keys = deals.map((d) => cacheKeyFor(d.productName, CURRENT_VERSIONS))
  const lookup = await deps.cache.lookup(keys)
  const cached = new Map<
    string,
    {
      category: string
      subCategory: string
      confidence: number
      isUncertain: boolean
      attributes: Record<string, unknown>
      /**
       * The validated Classification exactly as stored.
       *
       * Kept so a backfill can re-save the row with its attributes filled in
       * WITHOUT re-deriving a category. The upsert writes the whole row
       * (supabase-classification-cache.ts), so passing anything other than the
       * stored classification here would overwrite a settled category with a
       * guess.
       */
      classification: CachedClassification['classification']
    }
  >()
  if (isOk(lookup)) {
    for (const entry of lookup.value) {
      cached.set(entry.cacheKey, {
        category: entry.classification.category,
        subCategory: entry.classification.subCategory,
        confidence: entry.classification.confidence.value,
        isUncertain: entry.classification.isUncertain,
        // Enriched once, reused every run. Without this the attributes are
        // recomputed or — as they were until 2026-09-11 — simply dropped.
        attributes: entry.attributes,
        classification: entry.classification,
      })
    }
  }
  log(`[transform] cache: ${cached.size}/${deals.length} hits`)

  // ── 2. Plan ───────────────────────────────────────────────────────────────
  // A cold start is not only the first run: bumping any version changes every
  // cache key, so a one-word prompt edit costs the same as day one.
  const plan = planRun(deals.length, cached.size, FREE_TIER_BUDGET, ZERO_SPEND)
  if (plan.isColdStart) log(`[transform] ${plan.reason}`)

  const misses: { deal: UnifiedDeal; key: string }[] = []
  deals.forEach((deal, i) => {
    const key = keys[i] as string
    if (!cached.has(key)) misses.push({ deal, key })
  })

  // Cache hits a cold start left without attributes. Classification is settled
  // for these — only the metadata is owed — so they must NOT be re-classified.
  // Without this, `RunPlan.enrich = false` is a permanent loss rather than a
  // deferral: the hit path below returns entry.attributes verbatim and never
  // reaches the enricher.
  const owedEnrichment: { deal: UnifiedDeal; key: string; subCategory: string }[] = []
  if (plan.enrich) {
    deals.forEach((deal, i) => {
      const hit = cached.get(keys[i] as string)
      if (hit && needsEnrichment(hit)) {
        owedEnrichment.push({ deal, key: keys[i] as string, subCategory: hit.subCategory })
      }
    })
    if (owedEnrichment.length > 0) {
      log(`[transform] ${owedEnrichment.length} cached products still owe attributes — backfilling`)
    }
  }

  const toClassify = misses.slice(0, plan.limit)
  const deferred = misses.length - toClassify.length
  if (deferred > 0) log(`[transform] deferring ${deferred} products to the next run`)

  // ── 3. Agent ──────────────────────────────────────────────────────────────
  //
  // Run in CHUNKS, and persist after each one.
  //
  // This used to be a single invoke over every product, with one cache write
  // at the very end. pipeline.yml retries this step three times on the stated
  // grounds that "every classification is written to the cache as it
  // completes, so attempt 2 re-reads what attempt 1 already paid for" — which
  // was simply not true of the code. A run killed by the 15-minute step
  // timeout persisted NOTHING.
  //
  // Both live cutover attempts on 2026-09-11 proved it: `cache: 0/1650 hits`
  // on all three tries, three times the free-tier quota spent, no progress
  // made. Chunking is what makes that comment describe reality — and it means
  // even a failed run advances the cold start.
  const outcomes: Outcome[] = []
  const attributesByName = new Map<string, Record<string, unknown>>()

  if (toClassify.length > 0) {
    const graph = buildClassifyGraph({
      tier1: deps.tier1,
      judge: deps.judge,
      reflector: deps.reflector,
      budget: FREE_TIER_BUDGET,
      // The lever existed and was never pulled: judgeSampleRate defaulted to 1,
      // so a cold start made one sequential judge call per product — ~800 of
      // them. planRun decides; a warm run still judges everything.
      judgeSampleRate: plan.judgeSampleRate,
      // A port that throws is contained by the graph, but containment without a
      // log is an undiagnosable run. This is the only way a contract breach
      // becomes visible.
      log: (m) => log(`[transform] ⚠ ${m}`),
    })
    if (plan.judgeSampleRate < 1) {
      log(
        `[transform] judge sampled at 1 in ${Math.round(1 / plan.judgeSampleRate)} for this cold start — warm runs judge every product`,
      )
    }

    // Carried ACROSS chunks: the free-tier budget is a property of the run, not
    // of a chunk. Resetting it per chunk would quietly disable the guardrail.
    let budget = ZERO_SPEND

    for (let start = 0; start < toClassify.length; start += CHUNK_SIZE) {
      const slice = toClassify.slice(start, start + CHUNK_SIZE)

      const pending: ClassificationRequest[] = slice.map(({ deal }) => ({
        productName: deal.productName,
        // The retailer's own descriptor, where component 1 captured one.
        descriptor: (deal as { sourceDescriptor?: string | null }).sourceDescriptor ?? null,
        retailer: deal.store,
      }))

      const final = (await graph.invoke({
        pending,
        outcomes: [],
        disputed: [],
        budget,
        halted: null,
      })) as { outcomes: Outcome[]; halted: string | null; budget?: typeof ZERO_SPEND }

      outcomes.push(...final.outcomes)
      if (final.budget) budget = final.budget

      // Enrich and persist THIS chunk before starting the next one. A crash
      // after this point costs the chunks not yet reached, never the ones
      // already paid for.
      await persistChunk(final.outcomes, deps, attributesByName, log, plan.enrich)

      if (final.halted) {
        log(`[transform] HALTED: ${final.halted}`)
        break
      }
    }
  }

  const byName = new Map<string, Outcome>()
  for (const o of outcomes) byName.set(normaliseForCache(o.request.productName), o)

  // ── 3c. Backfill ──────────────────────────────────────────────────────────
  //
  // Finish the job a cold start deferred. These products already have a settled
  // category — only their attributes are owed — so they must never be
  // re-classified. Without this step `RunPlan.enrich = false` is not a deferral
  // at all: the cache-hit path above returns entry.attributes verbatim and
  // never reaches the enricher, so those products would carry `{}` forever,
  // `storageFrom` would yield nothing, and the Frozen browse tile would
  // undercount by up to COLD_START_LIMIT (ADR-001).
  //
  // The row is re-saved with its STORED classification and the new attributes.
  // The upsert writes the whole row, so passing anything else here would
  // overwrite a settled category with a guess.
  if (deps.enricher && owedEnrichment.length > 0) {
    for (let start = 0; start < owedEnrichment.length; start += CHUNK_SIZE) {
      const slice = owedEnrichment.slice(start, start + CHUNK_SIZE)
      try {
        const { attributes, tokens } = await deps.enricher.enrich(
          slice.map((o) => ({
            request: { productName: o.deal.productName, descriptor: null, retailer: o.deal.store },
            subCategory: o.subCategory,
          })),
        )
        for (const [name, attrs] of attributes) attributesByName.set(name, attrs)
        log(`[transform] backfilled ${attributes.size}/${slice.length} products (${tokens} tokens)`)

        const rows = slice
          .filter((o) => attributesByName.has(o.deal.productName))
          .map((o) => ({
            cacheKey: o.key,
            normalisedName: normaliseForCache(o.deal.productName),
            classification: (cached.get(o.key) as { classification: CachedClassification['classification'] }).classification,
            attributes: attributesByName.get(o.deal.productName) ?? {},
            runId: deps.runId,
          }))
        if (rows.length > 0) await deps.cache.save(rows)
      } catch (e) {
        // A backfill failure costs metadata for one batch and nothing else.
        log(`[transform] backfill failed for a batch: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // ── 5. Map back ───────────────────────────────────────────────────────────
  let hits = 0
  let classified = 0
  let uncertain = 0
  let rejected = 0
  let blocked = 0
  let heldBack = 0
  const out: Deal[] = []
  const judgeUnavailable = outcomes.filter((o) => o.judgeVerdict === 'unavailable').length

  deals.forEach((deal, i) => {
    const key = keys[i] as string
    const hit = cached.get(key)
    if (hit) {
      hits++
      if (!isPublishable(hit.subCategory)) {
        blocked++
        return // tobacco: classified, never served (D10)
      }
      if (hit.isUncertain) uncertain++
      out.push(
        toDeal(deal, {
          category: hit.category,
          subCategory: hit.subCategory,
          confidence: hit.confidence || CACHED_CONFIDENCE,
          isUncertain: hit.isUncertain,
          // Prefer anything the backfill just produced for this product.
          attributes: attributesByName.get(deal.productName) ?? hit.attributes,
        }),
      )
      return
    }

    const outcome = byName.get(normaliseForCache(deal.productName))
    if (!outcome) {
      // Deferred by the cold-start plan: never sent to a model, so there is no
      // category to publish. Returns next run as a cache miss.
      heldBack++
      return
    }

    if (outcome.status === 'rejected') {
      rejected++
      return // failed a guardrail — never published
    }

    // THE D3 PATH. 'classified' and 'uncertain' both carry a real, validated
    // classification (classify-graph.ts:231/239/251 pass d.classification
    // through on dispute). The only difference is whether the label can be
    // trusted, so both are published and only one is flagged.
    //
    // 'skipped-budget' and a null classification are a different thing
    // entirely — no category exists — and are held back below.
    if (outcome.classification && (outcome.status === 'classified' || outcome.status === 'uncertain')) {
      if (!isPublishable(outcome.classification.subCategory)) {
        blocked++
        return
      }

      // A judge dispute overrides self-reported confidence. The classifier's
      // own number said 0.94 on plenty of answers the judge was right to
      // reject; a 0% false-alarm rate is what makes this safe to act on.
      const classification =
        outcome.status === 'uncertain' ? markUncertain(outcome.classification) : outcome.classification

      if (classification.isUncertain) uncertain++
      else classified++

      out.push(
        toDeal(deal, {
          category: classification.category,
          subCategory: classification.subCategory,
          confidence: classification.confidence.value,
          isUncertain: classification.isUncertain,
          attributes: attributesByName.get(outcome.request.productName) ?? {},
        }),
      )
      return
    }

    // No classification at all — the guardrail rejected the name, the budget
    // ran out before the product was reached, or the provider was down. There
    // is nothing to publish, and inventing a category is the failure mode this
    // whole component exists to remove.
    heldBack++
  })

  log(
    `[transform] ${classified} classified · ${hits} cached · ${uncertain} uncertain (published, flagged) · ${rejected} rejected · ${blocked} blocked · ${heldBack} held back`,
  )
  if (judgeUnavailable > 0) {
    // Loud, because the alternative is a quality loss that looks like success.
    log(
      `[transform] ⚠ judge unavailable for ${judgeUnavailable} products — those shipped with NO independent check. If this is near the judged count, the judge is down (check the OpenRouter credit).`,
    )
  }

  return {
    deals: out,
    stats: {
      total: deals.length,
      cacheHits: hits,
      classified,
      uncertain,
      rejected,
      blocked,
      heldBack,
      judgeUnavailable,
      deferred,
      isColdStart: plan.isColdStart,
    },
  }
}
