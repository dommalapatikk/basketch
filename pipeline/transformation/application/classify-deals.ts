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
import type { ClassificationCache } from '../domain/classification-cache'
import { CURRENT_VERSIONS, cacheKeyFor, normaliseForCache } from '../domain/classification-cache'
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

  const toClassify = misses.slice(0, plan.limit)
  const deferred = misses.length - toClassify.length
  if (deferred > 0) log(`[transform] deferring ${deferred} products to the next run`)

  // ── 3. Agent ──────────────────────────────────────────────────────────────
  const outcomes: Outcome[] = []
  if (toClassify.length > 0) {
    const graph = buildClassifyGraph({
      tier1: deps.tier1,
      judge: deps.judge,
      reflector: deps.reflector,
      budget: FREE_TIER_BUDGET,
    })

    const pending: ClassificationRequest[] = toClassify.map(({ deal }) => ({
      productName: deal.productName,
      // The retailer's own descriptor, where component 1 captured one.
      descriptor: (deal as { sourceDescriptor?: string | null }).sourceDescriptor ?? null,
      retailer: deal.store,
    }))

    const final = (await graph.invoke({
      pending,
      outcomes: [],
      disputed: [],
      budget: ZERO_SPEND,
      halted: null,
    })) as { outcomes: Outcome[]; halted: string | null }

    outcomes.push(...final.outcomes)
    if (final.halted) log(`[transform] HALTED: ${final.halted}`)
  }

  const byName = new Map<string, Outcome>()
  for (const o of outcomes) byName.set(normaliseForCache(o.request.productName), o)

  // ── 3b. Enrich ────────────────────────────────────────────────────────────
  // Runs AFTER classification, because the sub-category decides which attribute
  // schema applies. A failure here costs metadata, never a category.
  const attributesByName = new Map<string, Record<string, unknown>>()
  if (deps.enricher) {
    const toEnrich = outcomes
      .filter((o) => o.status === 'classified' && o.classification !== null)
      .map((o) => ({
        request: o.request,
        // biome-ignore lint/style/noNonNullAssertion: filtered above
        subCategory: o.classification!.subCategory,
      }))

    if (toEnrich.length > 0) {
      const { attributes, tokens } = await deps.enricher.enrich(toEnrich)
      for (const [name, attrs] of attributes) attributesByName.set(name, attrs)
      log(`[transform] enriched ${attributes.size}/${toEnrich.length} products (${tokens} tokens)`)
    }
  }

  // ── 4. Persist the memo ───────────────────────────────────────────────────
  const toCache = outcomes
    .filter((o) => o.classification !== null && o.status === 'classified')
    .map((o) => ({
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

  // ── 5. Map back ───────────────────────────────────────────────────────────
  let hits = 0
  let classified = 0
  let uncertain = 0
  let rejected = 0
  let blocked = 0
  let heldBack = 0
  const out: Deal[] = []

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
          attributes: hit.attributes,
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
      deferred,
      isColdStart: plan.isColdStart,
    },
  }
}
