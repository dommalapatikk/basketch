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
import { isPublishable, topCategoryFor } from '../../../shared/types'
import { markUncertain, storageFrom } from '../domain/classification'
import { isOk } from '../../collection/domain/result'
import type { CachedClassification, ClassificationCache } from '../domain/classification-cache'
import { CURRENT_VERSIONS, cacheKeyFor, needsEnrichment, normaliseForCache } from '../domain/classification-cache'
import type { ClassificationRequest, Classifier } from '../domain/classifier'
import { FREE_TIER_BUDGET, ZERO_SPEND } from '../domain/guardrails'
import { checkChunkDuration, checkDeadline } from '../domain/resilience'
import { orderForColdStart, planRun } from '../domain/run-plan'
import { type GraphDeps, type Outcome, buildClassifyGraph } from './classify-graph'

/**
 * Raised only when the classification cache is genuinely unreadable (most
 * lookup chunks failed) — never for an ordinary miss, which degrades silently
 * by design. A distinct class, not a bare `Error`, so `run-pipeline.ts` can
 * distinguish "Supabase/cache unreadable, worth retrying" (exit 75) from any
 * other bug in this function (exit 1) with `instanceof`, not a message regex.
 */
export class ClassificationCacheUnreadableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClassificationCacheUnreadableError'
  }
}

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
  /**
   * In-process deadline (epoch ms), checked before each classification chunk
   * — WP-P3 / RCA T1. `null` (the default) means no deadline: every existing
   * caller and test that never set this keeps running exactly as before.
   */
  deadlineAtMs?: number | null
  /** Clock, injected for tests. Defaults to `Date.now`. */
  now?: () => number
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
    /**
     * True when the run stopped classifying early because `deadlineAtMs` was
     * reached — distinct from an ordinary budget/cold-start deferral. The
     * caller (`run-pipeline.ts`) uses this, not `deferred`, to decide between
     * exit 75 (retry) and exit 0 (a deliberate partial publish on the final
     * attempt).
     */
    readonly deadlineHit: boolean
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
): Promise<{ enrichMs: number; saveMs: number }> {
  const classified = chunk.filter((o) => o.status === 'classified' && o.classification !== null)
  let enrichMs = 0
  let saveMs = 0

  // F2 (code review round 2, WP-P6a). Enrichment eligibility is gated on the
  // CLASSIFICATION'S OWN `isUncertain`, not on the outcome's workflow status.
  // 'classified' means "no judge dispute happened", not "certain" —
  // `createClassification` already sets `isUncertain` from self-reported
  // confidence alone (classification.ts), with no judge involved at all: no
  // judge configured, sampled out on a cold start, or the escalation budget
  // spent before this product's turn (classify-graph.ts's judge node returns
  // `status: 'classified'` in all three cases, classification unchanged).
  // Gating in-chunk enrichment on status while gating the backfill queue
  // (`owedEnrichment` below) on `isUncertain` meant such a product COULD be
  // enriched in-chunk but, if that attempt missed it, could never be
  // revisited — a permanent loss of the storage facet (ADR-001). One
  // predicate for both call sites: uncertain ⇒ no enrichment, full stop.
  const enrichable = classified.filter((o) => !o.classification?.isUncertain)

  if (deps.enricher && enrich && enrichable.length > 0) {
    const t0 = Date.now()
    const toEnrich = enrichable.map((o) => ({
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
    enrichMs = Date.now() - t0
  }

  // WP-P6a. A judge-disputed outcome still carries a real, validated
  // classification — `createClassification` refuses to build one without a
  // category and sub-category (classification.ts). The only thing unsettled
  // is whether the LABEL can be trusted, and that is exactly what caching it
  // preserves. Without this, RCA item 9 measured the same 5-20% of every
  // chunk re-classified AND re-judged every run, identically, at
  // temperature 0 — the cache schema already carries `is_uncertain` for
  // exactly this purpose (20260910_classification_cache.sql).
  //
  // A PROVIDER-FAILURE 'uncertain' — `classification === null`: a whole batch
  // the tier-1 provider refused (classify-graph.ts:170, `!isOk(res)`) or one
  // item within an otherwise-ok batch the provider gave no answer for
  // (:179, `!o.ok`) — is excluded on purpose. Caching it would memoise an
  // error as if it were an answer, and the next run would serve a permanent
  // non-result instead of trying again. A THIRD null-classification shape,
  // `status: 'skipped-budget'` (:148-151, the classify node's own budget
  // guard), never reaches this filter at all — it is a different `status`
  // value, not 'uncertain'.
  //
  // F1 (code review carry-forward, WP-P6a — closed here by WP-P6). A SECOND
  // shape of "not a content signal" slipped through the FIRST filter above:
  // an outcome CAN carry a real classification (`classification !== null`)
  // and still be resource-limited rather than disputed — the judge said
  // "wrong" but this run's escalation BUDGET ran out before reflection got
  // a turn, or reflection ran and the provider returned nothing usable.
  // Neither says anything about whether the category is actually wrong; both
  // are just THIS RUN having less budget or a flakier provider than the
  // next one. Before this fix both were memoised exactly like "reflection
  // ran and still disagrees with the judge" — a genuine content signal — and
  // so became PERMANENTLY uncertain (HANDOVER.md §5: "no run will ever
  // re-open it"), for a reason that had nothing to do with the product.
  // `Outcome.failure` (classify-graph.ts) is set on exactly these two cases
  // and excludes them here.
  //
  // Deliberately NOT sent to enrichment above (see `enrichable`, F2): an
  // uncertain sub-category is a guess, so its attribute schema is a guess on
  // top of a guess — do not spend enrichment calls on it. Tech Lead ruling,
  // WP-P6a.
  const uncertainWithClassification = chunk.filter(
    (o) => o.status === 'uncertain' && o.classification !== null && o.failure === undefined,
  )

  const toCache = [
    ...classified.map((o) => ({
      cacheKey: cacheKeyFor(o.request.productName, CURRENT_VERSIONS),
      normalisedName: normaliseForCache(o.request.productName),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      classification: o.classification!,
      attributes: attributesByName.get(o.request.productName) ?? {},
      runId: deps.runId,
    })),
    ...uncertainWithClassification.map((o) => ({
      cacheKey: cacheKeyFor(o.request.productName, CURRENT_VERSIONS),
      normalisedName: normaliseForCache(o.request.productName),
      // markUncertain, not the outcome's own classification.isUncertain: the
      // judge dispute is what makes this row uncertain, and the classifier's
      // OWN confidence can still read above the visibility threshold — the
      // cached row must say so, or the next run rehydrates it as certain.
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      classification: markUncertain(o.classification!),
      // Never enriched (see above), so there is nothing to carry here.
      attributes: {},
      runId: deps.runId,
    })),
  ]

  if (toCache.length > 0) {
    const t0 = Date.now()
    const saved = await deps.cache.save(toCache)
    saveMs = Date.now() - t0
    // N of M, not a bare N: after deduping these should be equal, so a gap is
    // a visible signal that a call site has reintroduced duplicate keys.
    log(`[transform] cached ${isOk(saved) ? saved.value : 0} of ${toCache.length} classifications`)
  }

  return { enrichMs, saveMs }
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
    // ⚠️ THE COLUMN NAMES ARE REVERSED. `deals.category` takes the TOP-LEVEL
    // group (fresh | long-life | non-food, enforced by deals_category_check);
    // the classifier's browse category ('dairy') belongs in sub_category.
    //
    // Writing the browse value here is what made three live cutovers classify
    // thousands of products correctly and then write NONE of them:
    //   Upsert batch 1 failed: violates check constraint "deals_category_check"
    //   Upserted 0 of 922 deals
    category: topCategoryFor(fields.category) as Deal['category'],
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
  // NO SILENT `else`. A failed lookup used to fall through here leaving `cached`
  // empty, which planRun reads as zero hits and therefore a COLD START — so the
  // run re-classified everything it had already paid for. Under the free tier's
  // 15 requests/minute that cannot finish inside the step timeout, which is
  // precisely how run 34703713179 died twice and stored nothing.
  //
  // The cache only returns an error when MOST of it is unreadable; a minority
  // of bad chunks still degrades to a miss, and an EMPTY cache is an ok([]).
  // So reaching this branch means the memo is genuinely gone, and pressing on
  // is a guaranteed slow failure that also spends the day's quota.
  if (!isOk(lookup)) {
    throw new ClassificationCacheUnreadableError(
      `classification cache could not be read: ${lookup.error}. Refusing to continue — ` +
        'treating cached products as uncached would re-classify the whole catalogue ' +
        'and exceed the step timeout.',
    )
  }

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
  log(`[transform] cache: ${cached.size}/${deals.length} hits`)

  // ── 2. Plan ───────────────────────────────────────────────────────────────
  // A cold start is not only the first run: bumping any version changes every
  // cache key, so a one-word prompt edit costs the same as day one.
  const plan = planRun(deals.length, cached.size, FREE_TIER_BUDGET, ZERO_SPEND)
  if (plan.isColdStart) log(`[transform] ${plan.reason}`)

  // ONE ENTRY PER CACHE KEY. `misses` was built per DEAL, so the same product
  // sold by several retailers was classified — and PAID FOR — once each, then
  // handed to the cache as duplicate rows that Postgres rejected wholesale.
  //
  // The key is deliberately retailer-independent, so a product classified once
  // is classified for everyone. Safe because the map-back below finds outcomes
  // by normalised name, which is the only variable part of the cache key — the
  // dropped duplicates still find the survivor's answer.
  const missByKey = new Map<string, { deal: UnifiedDeal; key: string }>()
  deals.forEach((deal, i) => {
    const key = keys[i] as string
    if (!cached.has(key) && !missByKey.has(key)) missByKey.set(key, { deal, key })
  })
  const misses = [...missByKey.values()]

  // Cache hits a cold start left without attributes. Classification is settled
  // for these — only the metadata is owed — so they must NOT be re-classified.
  // Without this, `RunPlan.enrich = false` is a permanent loss rather than a
  // deferral: the hit path below returns entry.attributes verbatim and never
  // reaches the enricher.
  const owedEnrichment: { deal: UnifiedDeal; key: string; subCategory: string }[] = []
  const owedKeys = new Set<string>()
  if (plan.enrich) {
    deals.forEach((deal, i) => {
      const hit = cached.get(keys[i] as string)
      const key = keys[i] as string
      // Same rule as `misses`: one request per cache key, not per deal.
      // WP-P6a: a cached uncertain row is excluded here too, not only from
      // the in-chunk enrichment above — otherwise it re-enters this backfill
      // queue on every warm run forever (its attributes never leave `{}`,
      // because nothing is ever allowed to fill them), spending quota on a
      // sub-category that is itself a guess.
      if (hit && !hit.isUncertain && needsEnrichment(hit) && !owedKeys.has(key)) {
        owedKeys.add(key)
        owedEnrichment.push({ deal, key, subCategory: hit.subCategory })
      }
    })
    if (owedEnrichment.length > 0) {
      log(`[transform] ${owedEnrichment.length} cached products still owe attributes — backfilling`)
    }
  }

  // ⚠️ STABLE ORDER, NOT ARRIVAL ORDER. This used to slice `misses` as they
  // came off collection, which depends on which retailers responded in what
  // sequence and changes every run. When the budget or the daily quota cuts the
  // queue short, that makes deferral a lottery a product can lose forever —
  // stats count HOW MANY were deferred, never WHICH.
  //
  // On 2026-09-11 the Gemini daily quota ran out partway through: Coop and
  // Denner were early and got 423 deals onto the site, Spar was late and got
  // none. Nothing chose that.
  //
  // orderForColdStart has existed, exported and tested, since the module was
  // written, and nothing called it — the fourth "built, tested, never wired"
  // found today.
  const toClassify = orderForColdStart(
    misses.map((m) => ({ ...m, productName: m.deal.productName })),
  ).slice(0, plan.limit)

  // Resolved once the classify loop below knows how many it actually reached
  // — a deadline hit can defer MORE than the budget-limited slice already did.
  const clock = deps.now ?? Date.now
  const deadlineAtMs = deps.deadlineAtMs ?? null

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
  let deadlineHit = false
  // F8 (code review of the first WP-P3 submission): named `classifiedCount`
  // before, which overstated what it measures. This counts products in a
  // chunk that was DISPATCHED to the graph and ran to completion — not how
  // many actually came back with a category. A chunk `final.halted` (the
  // circuit breaker, or a budget cutoff mid-chunk) still adds its whole
  // `slice.length` here, because the chunk was genuinely attempted; some of
  // its outcomes may still be `rejected` or carry no classification. That
  // distinction already exists per-item in `outcomes` and the final stats
  // (`rejected`, `heldBack`, …) below — this counter only answers "how far
  // through `toClassify` did the loop get", which is exactly what `deferred`
  // needs.
  let attemptedCount = 0

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
      // Per-call judge token usage. The judge makes ONE model call per
      // escalated product (unlike the classifier's per-25-product batches),
      // so this is the granularity that actually shows what an OpenRouter
      // judge run costs — WP-P8's spend guard needs exactly this evidence.
      onJudgeUsage: (tokens, verdict) => log(`[transform] judge: ${tokens} tokens (verdict ${verdict})`),
    })
    if (plan.judgeSampleRate < 1) {
      log(
        `[transform] judge sampled at 1 in ${Math.round(1 / plan.judgeSampleRate)} for this cold start — warm runs judge every product`,
      )
    }

    // Carried ACROSS chunks: the free-tier budget is a property of the run, not
    // of a chunk. Resetting it per chunk would quietly disable the guardrail.
    let budget = ZERO_SPEND

    const chunkCount = Math.ceil(toClassify.length / CHUNK_SIZE)
    for (let start = 0; start < toClassify.length; start += CHUNK_SIZE) {
      const chunkNo = Math.floor(start / CHUNK_SIZE) + 1

      // WP-P3 / RCA T1: checked BEFORE starting a new chunk, never mid-chunk —
      // a chunk already dispatched always finishes and persists. Everything
      // from here on is deferred, exactly like a budget-limited deferral, so
      // it resumes as an ordinary cache miss next run.
      if (deadlineAtMs !== null && !checkDeadline(clock(), deadlineAtMs).withinDeadline) {
        deadlineHit = true
        log(
          `[transform] ⚠ run-deferred: in-process deadline reached before chunk ${chunkNo}/${chunkCount} — ` +
            `${toClassify.length - attemptedCount} of ${toClassify.length} queued products deferred to the next run`,
        )
        break
      }

      const chunkStart = Date.now()
      const slice = toClassify.slice(start, start + CHUNK_SIZE)

      const pending: ClassificationRequest[] = slice.map(({ deal }) => ({
        productName: deal.productName,
        // The retailer's own descriptor, where component 1 captured one.
        descriptor: (deal as { sourceDescriptor?: string | null }).sourceDescriptor ?? null,
        retailer: deal.store,
      }))

      const graphStart = Date.now()
      const final = (await graph.invoke({
        pending,
        outcomes: [],
        disputed: [],
        budget,
        halted: null,
      })) as { outcomes: Outcome[]; halted: string | null; budget?: typeof ZERO_SPEND }

      const graphMs = Date.now() - graphStart
      outcomes.push(...final.outcomes)
      if (final.budget) budget = final.budget

      // Enrich and persist THIS chunk before starting the next one. A crash
      // after this point costs the chunks not yet reached, never the ones
      // already paid for.
      const { enrichMs, saveMs } = await persistChunk(
        final.outcomes,
        deps,
        attributesByName,
        log,
        plan.enrich,
      )

      // THE MEASURING DEVICE. Added after three wrong diagnoses of the cold
      // start, every one of them reasoning from call counts because the log
      // recorded what happened and never how long it took.
      //
      // `graph` covers classification, the judge and reflection together —
      // they are one state machine and cannot be timed separately from here.
      // The point of `total` is the RESIDUAL: if the named stages do not sum
      // to it, the gap is whatever nobody has accounted for, and it becomes
      // visible instead of arguable.
      const judged = final.outcomes.filter((o) => o.judgeVerdict != null).length
      const chunkTotalMs = Date.now() - chunkStart
      log(
        `[transform] chunk ${chunkNo}/${chunkCount}: ` +
          `classify+judge ${(graphMs / 1000).toFixed(1)}s (${slice.length} products, ${judged} judged) · ` +
          `enrich ${(enrichMs / 1000).toFixed(1)}s · ` +
          `save ${(saveMs / 1000).toFixed(1)}s · ` +
          `total ${(chunkTotalMs / 1000).toFixed(1)}s`,
      )
      // N4 (code review, round 2): MAX_CHUNK_MS is an observed max, not a
      // physical limit — nothing bounds a chunk against a provider slowdown
      // or a long Retry-After wait. Warn the moment reality exceeds it,
      // rather than trusting a four-sample observation forever.
      const chunkDurationWarning = checkChunkDuration(chunkTotalMs)
      if (chunkDurationWarning) log(`[transform] ⚠ ${chunkDurationWarning}`)

      attemptedCount += slice.length

      if (final.halted) {
        log(`[transform] HALTED: ${final.halted}`)
        break
      }
    }
  }

  // Covers BOTH kinds of deferral in one number: products excluded from
  // `toClassify` by the budget/cold-start limit, and (if `deadlineHit`)
  // products still queued in `toClassify` when the deadline broke the loop.
  //
  // F8: this is NOT the same number as `plan.deferred` (`run-plan.ts`,
  // `misses - limit`) — that one is a PLANNING-TIME estimate, computed
  // before the loop runs at all, of how many will never even be attempted
  // this run. When nothing breaks the loop early (no deadline, no halt),
  // `attemptedCount === toClassify.length === plan.limit`, so the two agree
  // exactly. A deadline or a halt only ever makes THIS number bigger than
  // `plan.deferred`, never smaller — the plan is a floor on what gets
  // deferred, not a ceiling.
  const deferred = misses.length - attemptedCount
  if (deferred > 0 && !deadlineHit) log(`[transform] deferring ${deferred} products to the next run`)

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
      deadlineHit,
    },
  }
}
