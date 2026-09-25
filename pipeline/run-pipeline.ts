// run-pipeline — the composition-root-shaped orchestration `run.ts` never had.
//
// Every defect logged in HANDOVER.md §4 has the same shape: "a correct unit
// that nothing wires up." The reason is structural — `main()` in run.ts was a
// 700-line unexported function, so nothing could construct it with a fake
// source, a fake cache or a fake judge and watch what came out. This module IS
// that seam.
//
// LAYERING: this file is the APPLICATION layer. It defines `PipelineDeps` —
// the port every real dependency must satisfy — and orchestrates collection
// and transformation against that port. It imports no fetch, no Supabase
// client and no Gemini SDK; `composition.ts` (infrastructure) is the only file
// that builds the real thing.
//
// BEHAVIOUR: every log line, every phase order and every exit condition below
// is moved from `run.ts`, not rewritten. `process.exit` is gone — each
// function RETURNS an outcome, and `run.ts` (now a thin shell) maps it to an
// exit code via `exitCodeFor`.
//
// WP-P3 (RCA T1) extends that mapping to 0 / 75 / 1 and adds the in-process
// deadline. The deadline DECISION (`checkDeadline`) lives in the domain
// (`transformation/domain/resilience.ts`); this file only threads the clock
// and the deadline through, and decides what to DO with the result.

import type { Deal, Store, UnifiedDeal } from '../shared/types'
import { normalizeProductName } from '../shared/types'

import type { CollectOffersOutcome } from './collection/application/collect-offers'
import { collectOffers } from './collection/application/collect-offers'
import type { Offer } from './collection/domain/offer'
import { isoWeekOf } from './collection/domain/iso-week'
import type { OfferSource } from './collection/domain/offer-source'
import { createJsonTelemetry } from './collection/infrastructure/telemetry/json-telemetry'
import { formatRunSummary } from './collection/infrastructure/telemetry/json-telemetry'
import { filterGrocery } from './grocery-filter'
import { emitAnnotationsForAlerts } from './observability/github-step-summary'
import { extractProductMetadata } from './product-metadata'
import type { AliasMap, UnknownTag } from './resolve-taxonomy'
import { collectUnknownTags, resolveTaxonomy } from './resolve-taxonomy'
import type { ClassifyDealsDeps, ClassifyDealsResult } from './transformation/application/classify-deals'
import { ClassificationCacheUnreadableError, classifyDeals } from './transformation/application/classify-deals'
import type { JudgeSpendInfo, RunHistory } from './transformation/application/run-snapshot'
import { buildRunSnapshot } from './transformation/application/run-snapshot'
import type { Alert, Measured, RunSnapshot } from './transformation/domain/alerts'
import { evaluateAlerts, formatAlerts, measured, notMeasured, shouldFailRun } from './transformation/domain/alerts'
import { RUN_DEADLINE_MS, checkWriteTailDuration } from './transformation/domain/resilience'
import { isOk } from './collection/domain/result'
import type { ActiveCountsResult, PipelineRunInput, StoreDealsResult } from './store'
import type { DealEnrichment } from './storage/domain/offer-to-unified'
import { dealStoreEnrichment, offerToUnifiedDeal } from './storage/domain/offer-to-unified'
import { productLookupKey } from './storage/domain/product-key'
import type { StoreSweepPlan } from './storage/domain/stale-sweep'
import { sweepPlan } from './storage/domain/stale-sweep'

// ============================================================
// The port — every real dependency composition.ts must build
// ============================================================

/**
 * What `classifyDeals` needs, minus the per-run fields (`runId`, `log`,
 * `deadlineAtMs`, `now`) `classifyGroceryDeals` supplies itself — the deadline
 * is a property of THIS run, not of the classifier/cache/judge composition.
 */
export type ClassificationDeps = Omit<ClassifyDealsDeps, 'runId' | 'log' | 'deadlineAtMs' | 'now'> & {
  /**
   * WP-P7. What the composition root knows about the judge's own spend
   * ledger — not part of `ClassifyDealsDeps` because `classifyDeals` never
   * needs to read it; only the alert snapshot does, once classification has
   * finished. Kept alongside the classifier/judge/reflector/cache it was
   * built from, rather than threaded separately, so there is exactly one
   * place (`composition.ts`) that constructs a run's whole classification
   * dependency set.
   */
  readonly judgeSpend: JudgeSpendInfo
}

/**
 * Every Supabase-touching operation `runTransform` needs, bundled into one
 * port so a test can substitute an in-memory fake for the whole storage layer
 * — the same reason `OfferSource` exists for collection.
 */
export type StorageDeps = {
  readonly loadAliases: () => Promise<AliasMap>
  readonly reportUnknownTags: (tags: readonly UnknownTag[]) => Promise<void>
  readonly resolveProducts: (deals: readonly Deal[], store: Store) => Promise<Map<string, { productId: string }>>
  readonly activeCountsByWindow: () => Promise<ActiveCountsResult>
  readonly storeDeals: (deals: Deal[], productIds?: Map<string, string>) => Promise<StoreDealsResult>
  readonly writeEnrichment: (items: readonly DealEnrichment[]) => Promise<number>
  readonly deactivateStaleForStores: (runStartedAt: Date, plan: Map<string, StoreSweepPlan>) => Promise<number>
  readonly deactivateExpiredDeals: () => Promise<number>
  readonly logPipelineRun: (input: PipelineRunInput) => Promise<void>
}

/**
 * The one thing every real dependency (sources, classifier, reflector, judge,
 * enricher, cache, storage, the revalidate ping) is built from. Composed in
 * exactly one place — `composition.ts#createProductionDeps` — and never
 * built inline here.
 */
export type PipelineDeps = {
  /**
   * WP-J1 (D5): no longer parameterised by a shared ISO week. Each
   * `OfferSource` now names its own publication via `editionFor(date)`,
   * asked per source inside `collectOffers` — the ISO-week-for-everyone
   * shape this signature used to have is exactly the item 1 RCA's root
   * cause (one week computed here, handed to all seven, Migros asking for
   * a flyer that was not published yet on a Monday run).
   */
  readonly sources: () => readonly OfferSource[]
  /**
   * Deferred rather than eager: selecting the tier-1 model is a network probe
   * (`model-probe.ts`), and it must fire at the exact point in the log
   * sequence `run.ts` always fired it — after the grocery filter, before
   * classification — not at composition time.
   */
  readonly createClassificationDeps: (log: (message: string) => void) => Promise<ClassificationDeps>
  readonly storage: StorageDeps
  /**
   * WP-P7 (T2). The port every run's `RunSnapshot` is saved through and the
   * previous one read back from — `RunHistory.save` never touches
   * `storage.logPipelineRun`'s row; both are independent, append-only
   * writers to `pipeline_runs`.
   */
  readonly runHistory: RunHistory
  readonly revalidate: () => Promise<void>
  /**
   * WP-P7. Appends markdown to `$GITHUB_STEP_SUMMARY`, never throws — a
   * missing env var or a write failure degrades to a logged warning
   * (`observability/github-step-summary.ts`).
   */
  readonly writeStepSummary: (markdown: string) => Promise<void>
}

// ============================================================
// Outcomes — replace `process.exit`, never thrown
// ============================================================

export type TransformOutcome =
  | { readonly status: 'ok'; readonly storedCount: number }
  /**
   * WP-P3 / RCA T1: the in-process deadline (`RUN_DEADLINE_MS`) was reached on
   * a NON-final attempt. Whatever was classified before the deadline is
   * already persisted (`storeDeals` already ran) — this status exists only to
   * pick exit 75 over exit 1, so `retry_on_exit_code: 75` retries the run
   * instead of treating an incomplete run as a deterministic failure.
   */
  | { readonly status: 'deadline-hit' }
  /**
   * The classification cache could not be read (most lookup chunks failed) —
   * a transient Supabase/network problem, not a bug. Nothing was written this
   * attempt (the failure happens before any storage write), so there is
   * nothing new to revalidate.
   */
  | { readonly status: 'cache-unreadable' }
  | { readonly status: 'alert-failed' }
  | { readonly status: 'storage-shortfall' }

export type PipelineOutcome = TransformOutcome | { readonly status: 'no-data' }

/** EX_TEMPFAIL (BSD sysexits) — the code `pipeline.yml`'s `retry_on_exit_code` watches for. */
const EX_TEMPFAIL = 75

/**
 * The exit-code split (RCA T1): 0 success (including a deliberate partial
 * publish), 75 transient — worth retrying now — 1 deterministic: a bug, a
 * critical alert, or a genuine write shortfall. Never retried.
 *
 * Kept as ONE function so the mapping lives in exactly one place — the
 * opposite of `run.ts`'s old `if (outcome.status !== 'ok') process.exit(1)`,
 * which could only ever express two outcomes.
 */
export function exitCodeFor(outcome: PipelineOutcome): 0 | 75 | 1 {
  switch (outcome.status) {
    case 'ok':
      return 0
    case 'deadline-hit':
    case 'cache-unreadable':
      return EX_TEMPFAIL
    // 'no-data' is 1, not 75: every source returning nothing is a
    // COLLECTION problem (a fetch refused, a source misconfigured, a
    // genuine bug), not the transient-infrastructure shape 75 exists for.
    // Retrying it as-is would re-run collection for all seven retailers,
    // against CLAUDE.md's "one fetch per publication" rule — a retryable
    // exit code must never be the default for "something upstream failed
    // and we don't know why". Before `retry_on_exit_code` existed,
    // nick-fields/retry's default `retry_on: 'any'` retried EVERY non-zero
    // exit unconditionally, so 'no-data' WAS implicitly retried by attempt
    // 2 — this exit-code split deliberately removes that.
    case 'no-data':
    case 'alert-failed':
    case 'storage-shortfall':
      return 1
  }
}

const infoLog = (message: string): void => console.log(`[pipeline] [INFO] ${message}`)

/** Correlation id for a run: prefers the GitHub Actions run id so a stored row links back to the job log that produced it. */
export function computeRunId(env: Record<string, string | undefined>, now: Date): string {
  return env.GITHUB_RUN_ID ? `gha-${env.GITHUB_RUN_ID}` : `local-${now.toISOString().replace(/[:.]/g, '-')}`
}

// ============================================================
// Collection phase
// ============================================================

export type StoreStatus = { readonly status: 'success' | 'failed' | 'skipped'; readonly count: number }

export type CollectOutcome = {
  readonly storeDealsMap: Map<Store, UnifiedDeal[]>
  readonly storeStatusMap: Map<Store, StoreStatus>
  /** Fields `Offer` carries that `UnifiedDeal` cannot: CropRegion, priceBasis, integer rappen. */
  readonly pendingEnrichment: Map<string, DealEnrichment>
  /**
   * WP-P7. The raw offers this run's collection phase actually returned —
   * kept (not only converted into `UnifiedDeal`) because `buildRunSnapshot`
   * computes `publishedDataCoverage` from `Offer.sourceAttributes`, a field
   * `UnifiedDeal` does not carry.
   */
  readonly offers: readonly Offer[]
}

export type RunCollectOptions = {
  readonly now: Date
}

function logCollectionTrace(outcome: CollectOffersOutcome): void {
  console.log(`[pipeline] [INFO] collected ${outcome.offers.length} offers · ${outcome.trace.status}`)
  for (const span of outcome.trace.sources) {
    const mark = span.status === 'ok' ? 'ok  ' : 'FAIL'
    console.log(
      `[pipeline] [INFO]   ${mark} ${span.retailer.padEnd(8)} ${String(span.offerCount).padStart(4)} offers  ${span.warningCount} warnings` +
        (span.status === 'ok' ? '' : `  ${span.failureReason}: ${(span.detail ?? '').slice(0, 80)}`),
    )
  }
}

/**
 * The collection module's `Offer[]` is the only source of collected deals —
 * WP-P4 (RCA 2026-09-15, AP-3) retired the legacy aktionis matrix job that
 * used to write `*-deals.json` for `off`/`shadow` mode to read or compare
 * against. This function builds `CollectOutcome` straight from what was
 * fetched, with no merge and no fallback to a file that no longer exists.
 */
function buildCollectOutcome(offers: readonly Offer[]): CollectOutcome {
  const storeDealsMap = new Map<Store, UnifiedDeal[]>()
  const storeStatusMap = new Map<Store, StoreStatus>()
  const pendingEnrichment = new Map<string, DealEnrichment>()

  for (const offer of offers) {
    const store = offer.retailer as Store
    const list = storeDealsMap.get(store) ?? []
    list.push(offerToUnifiedDeal(offer))
    storeDealsMap.set(store, list)
  }
  for (const [store, list] of storeDealsMap) {
    storeStatusMap.set(store, { status: list.length > 0 ? 'success' : 'failed', count: list.length })
  }
  for (const offer of offers) {
    const enrichment = dealStoreEnrichment(offer)
    if (enrichment) pendingEnrichment.set(enrichment.key, enrichment)
  }
  console.log(`[pipeline] [INFO] ${pendingEnrichment.size} offers carry fields UnifiedDeal cannot hold`)

  return { storeDealsMap, storeStatusMap, pendingEnrichment, offers }
}

/**
 * WP-P7: wires `createJsonTelemetry` — built, tested, and never constructed
 * in production before this. Structured NDJSON to stdout alongside the
 * existing human-readable `[pipeline] [INFO]` lines, not instead of them.
 */
async function runCollectionModule(deps: PipelineDeps, now: Date): Promise<CollectOutcome> {
  console.log('[pipeline] [INFO] collection module: LIVE')
  // WP-J1 (D5): this `week` is a DISPLAY label for the trace/telemetry only —
  // it is never fed to an adapter any more. Each source names its own
  // publication via `editionFor`, asked per source inside `collectOffers`
  // (passed `referenceDate: now` below), which is the actual fix for the
  // item 1 RCA's "one week for all seven" defect.
  const week = isoWeekOf(now)

  const outcome = await collectOffers(deps.sources(), week, {
    timeoutMs: 600_000,
    telemetry: createJsonTelemetry(),
    referenceDate: now,
  })
  logCollectionTrace(outcome)
  await deps.writeStepSummary(formatRunSummary(outcome.trace))

  return buildCollectOutcome(outcome.offers)
}

export async function runCollect(deps: PipelineDeps, options: RunCollectOptions): Promise<CollectOutcome> {
  const collected = await runCollectionModule(deps, options.now)

  for (const [store, result] of collected.storeStatusMap) {
    console.log(`[pipeline] [INFO] Collected ${result.count} ${store} deals`)
  }

  return collected
}

function flattenStoreDeals(map: ReadonlyMap<Store, readonly UnifiedDeal[]>): UnifiedDeal[] {
  return Array.from(map.values()).flat()
}

// ============================================================
// Transform phase
// ============================================================

function normalizeProductNames(deals: readonly UnifiedDeal[]): void {
  for (const deal of deals) {
    deal.productName = normalizeProductName(deal.productName)
  }
  console.log(`[pipeline] [INFO] Normalised ${deals.length} product names`)
}

/** Rejects non-grocery items at ingest (Parkside, Silvercrest, etc.). See v4 spec §13 and grocery-filter.ts. */
function filterToGroceryOnly(allRaw: readonly UnifiedDeal[]): UnifiedDeal[] {
  const groceryOnly: UnifiedDeal[] = []
  const rejectionReasons = new Map<string, number>()
  for (const deal of allRaw) {
    const decision = filterGrocery(deal)
    if (decision.keep) {
      groceryOnly.push(deal)
    } else {
      const key = `${decision.reason}:${decision.matched ?? ''}`
      rejectionReasons.set(key, (rejectionReasons.get(key) ?? 0) + 1)
    }
  }
  const rejected = allRaw.length - groceryOnly.length
  if (rejected > 0) {
    const breakdown = [...rejectionReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ')
    console.log(`[pipeline] [INFO] Grocery filter rejected ${rejected} non-grocery items (${breakdown})`)
  }
  return groceryOnly
}

/** Brand/quantity/organic extraction is used downstream by the product resolver; logged here for visibility only. */
function logProductMetadata(groceryOnly: readonly UnifiedDeal[]): void {
  let organicCount = 0
  let brandCount = 0
  let quantityCount = 0
  for (const deal of groceryOnly) {
    const meta = extractProductMetadata(deal.productName, deal.sourceCategory)
    if (meta.isOrganic) organicCount++
    if (meta.brand) brandCount++
    if (meta.quantity != null) quantityCount++
  }
  console.log(`[pipeline] [INFO] Metadata: ${brandCount} brands, ${quantityCount} quantities, ${organicCount} organic`)
}

function logClassificationSummary(stats: ClassifyDealsResult['stats']): void {
  console.log(
    `[pipeline] [INFO] Categorized ${stats.classified} · cached ${stats.cacheHits} · uncertain ${stats.uncertain} (published, label withheld) · rejected ${stats.rejected} · blocked ${stats.blocked} · held back ${stats.heldBack}`,
  )
  // The weekly review queue, and the only number here that should trend to zero.
  if (stats.uncertain > 0) {
    console.log(`[pipeline] [INFO] ${stats.uncertain} products need review: WHERE is_uncertain`)
  }
  // The deadline-triggered case already logged its own "run-deferred" line,
  // with the chunk it stopped before — this generic message would say "(cold
  // start)" for a run that may not be one.
  if (stats.deferred > 0 && !stats.deadlineHit) {
    console.warn(`[pipeline] [WARN] ${stats.deferred} products deferred to the next run (cold start)`)
  }
}

type ClassifyGroceryDealsOutcome = {
  readonly result: ClassifyDealsResult
  /** WP-P7: carried out so `finishRun` can build the alert snapshot's spend fields. */
  readonly judgeSpend: JudgeSpendInfo
}

async function classifyGroceryDeals(
  deps: PipelineDeps,
  groceryOnly: readonly UnifiedDeal[],
  runId: string,
  deadlineAtMs: number,
  now: () => number,
): Promise<ClassifyGroceryDealsOutcome> {
  const { judgeSpend, ...classification } = await deps.createClassificationDeps(infoLog)
  const result = await classifyDeals(groceryOnly, { ...classification, runId, log: infoLog, deadlineAtMs, now })
  logClassificationSummary(result.stats)
  return { result, judgeSpend }
}

async function resolveTaxonomyStep(deps: PipelineDeps, categorized: readonly Deal[]): Promise<Deal[]> {
  const aliases = await deps.storage.loadAliases()
  const resolved = categorized.map((d) => resolveTaxonomy(d, aliases))
  const unknowns = collectUnknownTags(categorized, aliases)
  if (unknowns.length > 0) {
    console.warn(`[pipeline] [WARN] ${unknowns.length} unmapped sub_category tag(s): ${unknowns.map((u) => u.source_tag).join(', ')}`)
    await deps.storage.reportUnknownTags(unknowns)
  }
  const mappedCount = resolved.filter((d) => d.categorySlug != null).length
  console.log(`[pipeline] [INFO] Taxonomy alias: ${mappedCount}/${resolved.length} deals got a category_slug`)
  return resolved
}

async function resolveProductIds(
  deps: PipelineDeps,
  resolved: readonly Deal[],
  storeStatusMap: ReadonlyMap<Store, StoreStatus>,
): Promise<Map<string, string>> {
  const storeNames = Array.from(storeStatusMap.keys())
  const resolvedMaps = await Promise.all(
    storeNames.map((store) => deps.storage.resolveProducts(resolved.filter((d) => d.store === store), store)),
  )

  const productIds = new Map<string, string>()
  for (let i = 0; i < storeNames.length; i++) {
    const store = storeNames[i]!
    const map = resolvedMaps[i]!
    for (const [name, result] of map) {
      productIds.set(productLookupKey(store, name), result.productId)
    }
  }
  console.log(`[pipeline] [INFO] Resolved ${productIds.size} products`)
  return productIds
}

type WriteOutcome = {
  readonly writeResult: StoreDealsResult
  readonly liveByWindowBeforeWrite: Map<string, Map<string, number>> | null
  readonly liveCountsOk: boolean
}

/**
 * F1, carried forward from WP-P1's code review: live counts MUST be read
 * BEFORE `storeDeals` writes anything, or "before" and "after" are the same
 * read and the sweep guard measures a run against data it just changed
 * itself. `run.ts` had no test seam to guard this order until this module
 * existed — see `run-pipeline.test.ts`, "read counts before writing".
 */
async function writeDealsWithSweepGuard(deps: PipelineDeps, resolved: Deal[], productIds: Map<string, string>): Promise<WriteOutcome> {
  const liveCountsResult = await deps.storage.activeCountsByWindow()
  if (!liveCountsResult.ok) {
    console.warn(
      `[pipeline] [WARN] Live counts unreadable — stale sweep skipped for all stores: ${liveCountsResult.error.message}`,
      { details: liveCountsResult.error.details, hint: liveCountsResult.error.hint },
    )
  }
  // `null` here — never an empty map — is what tells sweepPlan to sweep
  // NOTHING, rather than reading "we don't know" as "nothing is live".
  const liveByWindowBeforeWrite = liveCountsResult.ok ? liveCountsResult.counts : null

  const writeResult = await deps.storage.storeDeals(resolved, productIds)

  return { writeResult, liveByWindowBeforeWrite, liveCountsOk: liveCountsResult.ok }
}

async function writeEnrichmentStep(deps: PipelineDeps, pendingEnrichment: ReadonlyMap<string, DealEnrichment>): Promise<void> {
  if (pendingEnrichment.size === 0) return
  const enriched = await deps.storage.writeEnrichment([...pendingEnrichment.values()])
  console.log(`[pipeline] [INFO] enriched ${enriched}/${pendingEnrichment.size} deals with crop/price-basis/rappen`)
}

// ⚠️ COLLECTING IS NOT REFRESHING. A store that fetched successfully but wrote
// nothing must not be swept — see item #5 in HANDOVER.md §4.
async function sweepStep(deps: PipelineDeps, storeStatusMap: ReadonlyMap<Store, StoreStatus>, write: WriteOutcome, startDate: Date): Promise<void> {
  const collectionSucceeded = [...storeStatusMap.entries()]
    .filter(([, r]) => r.status === 'success' && r.count > 0)
    .map(([store]) => store)

  const plan = sweepPlan({
    collectionSucceeded,
    writtenByWindow: write.writeResult.writtenByWindow,
    liveByWindow: write.liveByWindowBeforeWrite,
  })

  if (write.liveCountsOk) {
    const skipped = collectionSucceeded.filter((s) => !plan.has(s))
    if (skipped.length > 0) {
      console.error(
        `[pipeline] [ERROR] NOT sweeping ${skipped.join(', ')} — collected but stored nothing this run. Their previous deals stay visible rather than being switched off.`,
      )
    }
  }

  if (write.writeResult.attempted > 0 && write.writeResult.total === 0) {
    console.error(
      `[pipeline] [ERROR] Wrote 0 of ${write.writeResult.attempted} deals — skipping the stale sweep entirely. Every deal currently on the site stays visible.`,
    )
  }

  if (write.writeResult.attempted === 0 || write.writeResult.total > 0) {
    await deps.storage.deactivateStaleForStores(startDate, plan)
  }
}

/**
 * WP-P7 (RCA item 2): `collapsed` — rows `storeDeals` merged before anything
 * reached Postgres, because two offers shared a conflict key (store +
 * product_name + valid_from) — is NOT a write failure. Before this, "48
 * failed" could mean 48 genuine rejections or 48 ordinary collapses, and an
 * operator (and `storageRatioBelowThreshold`, below) could not tell which.
 */
function logStorageShortfall(resolvedLength: number, categorizedLength: number, storedCount: number, collapsed: number): boolean {
  const genuineShortfall = resolvedLength - collapsed - storedCount
  const storagePartialFailure = genuineShortfall > 0
  if (storagePartialFailure) {
    console.error(
      `[pipeline] [ERROR] Storage shortfall: stored ${storedCount} of ${categorizedLength} deals ` +
        `(${genuineShortfall} failed${collapsed > 0 ? `, ${collapsed} more collapsed as duplicate conflict keys — not a failure` : ''})`,
    )
  } else if (collapsed > 0) {
    console.log(`[pipeline] [INFO] ${collapsed} deals collapsed as duplicate conflict keys — not a write failure`)
  }
  return storagePartialFailure
}

async function deactivateExpiredStep(deps: PipelineDeps): Promise<void> {
  const deactivatedCount = await deps.storage.deactivateExpiredDeals()
  if (deactivatedCount > 0) {
    console.log(`[pipeline] [INFO] Deactivated ${deactivatedCount} expired deals`)
  }
}

type LogRunParams = {
  readonly storeStatusMap: ReadonlyMap<Store, StoreStatus>
  readonly storedCount: number
  readonly resolvedLength: number
  readonly collapsed: number
  readonly storagePartialFailure: boolean
  readonly durationMs: number
}

async function logRunStep(deps: PipelineDeps, params: LogRunParams): Promise<void> {
  const errors: string[] = []
  const failedStores = [...params.storeStatusMap.entries()].filter(([, r]) => r.status === 'failed').map(([store]) => store)
  if (failedStores.length > 0) errors.push(`Sources failed: ${failedStores.join(', ')}`)
  if (params.storagePartialFailure) {
    const genuineShortfall = params.resolvedLength - params.collapsed - params.storedCount
    errors.push(`Storage: stored ${params.storedCount}/${params.resolvedLength} (${genuineShortfall} failed)`)
  }

  const storeResults: Record<string, { status: string; count: number }> = {}
  for (const [store, result] of params.storeStatusMap) {
    storeResults[store] = { status: result.status, count: result.count }
  }

  await deps.storage.logPipelineRun({
    store_results: storeResults,
    total_stored: params.storedCount,
    duration_ms: params.durationMs,
    error_log: errors.length > 0 ? errors.join('; ') : null,
  })
}

// KNOWN LIMITATIONS (WP-P7 code review, 2026-09-17) — carried forward,
// deliberately NOT fixed in this package. Recorded here so the next WP finds
// them without re-discovering them from scratch.
//
// C1. A DEGRADED run's snapshot becomes the next run's baseline. If a run's
//     `publishedDataCoverage` or `benchmarkMacroF1` is itself already low
//     (a real regression that fired `source-shape-changed` or
//     `classifier-regression` once), that same low value is what
//     `RunHistory.save` persists — so the NEXT run compares against the
//     degraded value, not the last healthy one, and the alert can
//     self-silence after firing exactly once. Also: `RunHistory.lastSuccessful`
//     returns the last RUN RECORDED, not the last run that actually PASSED
//     its own alerts (`supabase-run-history.ts`'s own header documents this
//     as a deliberate choice for week-over-week DRIFT comparisons) — the
//     port's name promises more than it delivers and should be renamed or
//     re-scoped.
// C2. `collapsed` (`store.ts`) is correctly excluded from the storage-ratio
//     denominator, but is itself unobserved by any alert. A
//     `normalizeProductName` regression that starts merging genuinely
//     DISTINCT offers into the same conflict key would inflate `collapsed`,
//     shrink the denominator, and hide real data loss behind a healthy ratio.
// C3. No fixture-backed test proves a REAL retailer adapter's offers clear
//     `COVERAGE_COLLAPSE`'s 0.5 "was working" gate — `source-shape-changed`
//     is unit-tested but not proven reachable from an actual Denner/Migros/…
//     fixture the way the collection module's own port-contract tests would.
// C4. Two independent `pipeline_runs` rows exist per run (`store.ts`'s
//     `logPipelineRun` and `SupabaseRunHistory#save`), so
//     `SELECT * FROM pipeline_runs ORDER BY run_at DESC LIMIT 1` can return
//     the metrics-only row (`total_stored: 0`, no `store_results`). Latent:
//     only the retired Vite frontend ever read `pipeline_runs` that way.
// C5. `instrument-missing` for `benchmarkMacroF1` will fire on every run,
//     forever, until AP-6 (what the metric should measure) is decided — a
//     deferral with no end condition. That decision is the PM's.
export type EvaluateAlertsStepInputs = {
  readonly runId: string
  readonly stats: ClassifyDealsResult['stats']
  readonly durationMs: number
  readonly collectedOffers: readonly Offer[]
  readonly judgeSpend: JudgeSpendInfo
  /** Test-only seam. Production never sets this. Defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * The founding failure of this project: `pipeline_runs` was written every
 * run for months and nobody read it, so a categorisation regression stayed
 * invisible while the pipeline reported success. Emitting data is not
 * observability — something has to LOOK at it.
 *
 * WP-P7 (RCA item 2): every field of the snapshot below now comes from a
 * REAL output — `buildRunSnapshot`'s whole point is that there is nowhere
 * left to type a literal. `previous` is read from `deps.runHistory`, not
 * hardcoded `null` — the comment this replaced ("No previous run to compare
 * against yet… Passing null is honest") had no end condition, because
 * nothing ever saved a snapshot for "yet" to end on.
 *
 * `now` is injected (defaulting to `Date.now`) purely so a test can pin
 * `finishedAtMs` without a real clock — ONE call (WP-P7 code review, F2a:
 * `evaluateAlerts` no longer takes a separate `nowMs`; `pipeline-stale` is
 * measured against the previous run's own `finishedAtMs`, not "now").
 *
 * WP-P7 code review, F1 (MUST-FIX): an unreadable `RunHistory` used to
 * collapse straight to `previous = null` here — indistinguishable from a
 * genuine first-ever run, and silent under `cache-hit-rate-low`'s 100-lookup
 * volume gate. `previous` is now `Measured<RunSnapshot | null>`, so
 * `evaluateAlerts` itself reports the read failure as `instrument-missing`
 * rather than this call site deciding, on its own, that "unreadable" means
 * "nothing to compare against yet".
 */
async function evaluateAlertsStep(deps: PipelineDeps, inputs: EvaluateAlertsStepInputs): Promise<boolean> {
  const now = inputs.now ?? Date.now

  const snapshot: RunSnapshot = buildRunSnapshot({
    runId: inputs.runId,
    finishedAtMs: now(),
    durationMs: inputs.durationMs,
    stats: inputs.stats,
    collectedOffers: inputs.collectedOffers,
    judgeSpend: inputs.judgeSpend,
  })

  const previousResult = await deps.runHistory.lastSuccessful()
  const previous: Measured<RunSnapshot | null> = isOk(previousResult)
    ? measured(previousResult.value)
    : notMeasured(previousResult.error)
  if (!isOk(previousResult)) {
    console.warn(`[pipeline] [WARN] run history unreadable — comparing against no baseline this run: ${previousResult.error}`)
  }

  const alerts: readonly Alert[] = evaluateAlerts(snapshot, previous)
  console.log(`\n[pipeline] [INFO] alerts:\n${formatAlerts(alerts)}\n`)
  emitAnnotationsForAlerts(alerts)
  await deps.writeStepSummary(`## Pipeline alerts\n\n${formatAlerts(alerts)}`)

  // Saved regardless of whether this run passed its own alerts — the
  // regression/drift rules compare consecutive runs, not "the last time
  // everything was fine" (see `supabase-run-history.ts`'s own header). A
  // save failure is logged and never fails the run: losing next run's
  // baseline is a worse outcome than this run's own results.
  const saveResult = await deps.runHistory.save(snapshot)
  if (!isOk(saveResult)) {
    console.warn(`[pipeline] [WARN] could not save this run's snapshot — next run will compare against an older baseline: ${saveResult.error}`)
  }

  if (shouldFailRun(alerts)) {
    console.error('[pipeline] [ERROR] a critical alert fired — failing the run so it is visible')
    return true
  }
  return false
}

const STORAGE_THRESHOLD = 0.8

/**
 * Fails if stored deals fall below 80% of resolved — significant data loss.
 *
 * WP-P7: the denominator excludes `collapsed` rows — two offers merged into
 * one BEFORE anything reached Postgres are not a write that could have
 * failed, and counting them against the ratio would make an ordinary run
 * with a lot of legitimate duplicate conflict keys look like a storage
 * failure it never had.
 */
function storageRatioBelowThreshold(resolvedLength: number, storedCount: number, collapsed: number): boolean {
  const attemptedAfterCollapse = resolvedLength - collapsed
  const storageRatio = attemptedAfterCollapse > 0 ? storedCount / attemptedAfterCollapse : 1
  if (attemptedAfterCollapse > 0 && storageRatio < STORAGE_THRESHOLD) {
    console.error(`[pipeline] [ERROR] Storage ratio ${(storageRatio * 100).toFixed(1)}% is below ${STORAGE_THRESHOLD * 100}% threshold — failing pipeline`)
    return true
  }
  return false
}

export type RunTransformOptions = {
  readonly startTime: number
  readonly startDate: Date
  readonly runId: string
  /**
   * Whether this is nick-fields/retry's LAST attempt (`PIPELINE_FINAL_ATTEMPT`
   * env var — see `composition.ts`/`run.ts`). A deadline hit on a non-final
   * attempt exits 75 to retry; on the final attempt it publishes what it has
   * and exits 0. There is no further retry to defer to.
   */
  readonly isFinalAttempt: boolean
  /**
   * Clock, injected for tests. Defaults to `Date.now`. Drives BOTH the
   * in-process deadline check and alert evaluation, so one test can pin both
   * without waiting on the wall clock — the same clock P2's `finishRun.now`
   * seam already established.
   */
  readonly clock?: () => number
}

export type FinishRunParams = {
  readonly runId: string
  readonly stats: ClassifyDealsResult['stats']
  readonly resolvedLength: number
  readonly storedCount: number
  /** WP-P7: rows `storeDeals` merged before anything reached Postgres — not a write failure. */
  readonly collapsed: number
  readonly durationMs: number
  readonly isFinalAttempt: boolean
  /** WP-P7: feeds `buildRunSnapshot`'s `publishedDataCoverage`. */
  readonly collectedOffers: readonly Offer[]
  /** WP-P7: feeds `buildRunSnapshot`'s `usdMicrosSpent`/`spendNearCeiling`/`spendUnguarded`. */
  readonly judgeSpend: JudgeSpendInfo
  /** Test-only seam — see `evaluateAlertsStep`. Production never sets this. */
  readonly now?: () => number
}

/**
 * The exit checks, in order: revalidate, then the in-process deadline
 * (WP-P3), then an alert, then a storage shortfall, then (only then) success.
 *
 * Exported so WP-P3's tests, and today's, can drive it directly without
 * running the whole transform phase.
 *
 * REVALIDATE UNCONDITIONALLY, FIRST — every status this function can return
 * reports on an attempt where `storeDeals` has already run, `deadline-hit`
 * included. Fixes TWO things, not one:
 *
 *   1. (The original WP-P3 fix.) A storage-ratio failure or a critical alert
 *      used to write data and then skip revalidation entirely.
 *   2. (F3, code review of the first WP-P3 submission.) The first submission
 *      special-cased `deadline-hit` as "not terminal, attempt 2 revalidates
 *      when it finishes" — but attempt 2 can itself be killed, throw, or
 *      return `cache-unreadable` (which never reaches this function at all).
 *      Any of those leaves attempt 1's already-published rows unrevalidated
 *      until `cacheLife('hours')` expires. Revalidating is an idempotent
 *      webhook ping — there is no correctness cost to calling it on a run
 *      that turns out to need a retry, only a cost to skipping it on one
 *      that turns out not to get one.
 */
export async function finishRun(deps: PipelineDeps, params: FinishRunParams): Promise<TransformOutcome> {
  // Bust the web-next snapshot cache so fresh data shows up immediately
  // instead of waiting for the cacheLife('hours') safety belt to expire.
  await deps.revalidate()

  if (params.stats.deadlineHit && !params.isFinalAttempt) {
    console.warn(
      `[pipeline] [WARN] run-deferred: attempt hit the in-process deadline — persisted what was classified, exiting 75 to retry`,
    )
    return { status: 'deadline-hit' }
  }
  if (params.stats.deadlineHit) {
    console.warn(
      '[pipeline] [WARN] run-deferred: final attempt hit the in-process deadline — publishing everything classified or cached, deferring the rest',
    )
  }

  const alertFailed = await evaluateAlertsStep(deps, {
    runId: params.runId,
    stats: params.stats,
    durationMs: params.durationMs,
    collectedOffers: params.collectedOffers,
    judgeSpend: params.judgeSpend,
    now: params.now,
  })
  if (alertFailed) {
    return { status: 'alert-failed' }
  }
  if (storageRatioBelowThreshold(params.resolvedLength, params.storedCount, params.collapsed)) {
    return { status: 'storage-shortfall' }
  }

  console.log(`[pipeline] [INFO] Pipeline complete in ${params.durationMs}ms — stored ${params.storedCount} deals`)
  return { status: 'ok', storedCount: params.storedCount }
}

export async function runTransform(deps: PipelineDeps, collected: CollectOutcome, options: RunTransformOptions): Promise<TransformOutcome> {
  const clock = options.clock ?? Date.now
  const allRaw = flattenStoreDeals(collected.storeDealsMap)
  normalizeProductNames(allRaw)
  const groceryOnly = filterToGroceryOnly(allRaw)
  logProductMetadata(groceryOnly)

  let categorized: Deal[]
  let stats: ClassifyDealsResult['stats']
  let judgeSpend: JudgeSpendInfo
  try {
    const deadlineAtMs = options.startTime + RUN_DEADLINE_MS
    const classified = await classifyGroceryDeals(deps, groceryOnly, options.runId, deadlineAtMs, clock)
    categorized = classified.result.deals
    stats = classified.result.stats
    judgeSpend = classified.judgeSpend
  } catch (err) {
    // A cache that cannot be read is a transient Supabase/network problem,
    // not a bug — nothing has been written yet, so there is nothing to
    // revalidate. Any OTHER thrown error is a real bug and is left to
    // propagate to run.ts's outer catch, which maps it to exit 1.
    if (err instanceof ClassificationCacheUnreadableError) {
      console.error(`[pipeline] [ERROR] ${err.message}`)
      return { status: 'cache-unreadable' }
    }
    throw err
  }

  // F1 ruling, point 3: the write tail — everything from here to `logRun` —
  // is one of the two measured constants `RUN_DEADLINE_MS` is derived from
  // (`WRITE_TAIL_MS`, `resilience.ts`). Logged as its own line every run so
  // it stays measurable instead of rotting into folklore; WP-P7 will feed it
  // into the stored run metrics.
  //
  // RETIRED 2026-09-25 (tech-lead ruling after PM decisions, §10 of
  // docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md): a catalogue step
  // used to run here, resolving every deal to a concept + sku and setting
  // deals.sku_id. It was verified that nothing in the product reads that
  // layer (web-next, the pipeline and the database) — a writer with no
  // reader costing ~667s of the write tail for zero product value. The
  // tables/columns/views are NOT dropped (a two-way door); the batched
  // writer built for it is kept in git history at commit a9a2958
  // (`pipeline/catalogue/`) and can be restored by reverting this commit.
  const writeTailStart = clock()

  const resolved = await resolveTaxonomyStep(deps, categorized)
  const productIds = await resolveProductIds(deps, resolved, collected.storeStatusMap)

  const write = await writeDealsWithSweepGuard(deps, resolved, productIds)
  const storedCount = write.writeResult.total

  await writeEnrichmentStep(deps, collected.pendingEnrichment)
  await sweepStep(deps, collected.storeStatusMap, write, options.startDate)

  const storagePartialFailure = logStorageShortfall(resolved.length, categorized.length, storedCount, write.writeResult.collapsed)
  await deactivateExpiredStep(deps)

  // F7 (code review of the first WP-P3 submission): `Date.now()` here while
  // `options.startTime` came from the injected clock made a test-pinned
  // `startTime` produce a nonsensical multi-year `durationMs` — the tests
  // passing was luck, not design. One clock, used everywhere in this
  // function, is what makes the deadline tests' `durationMs` a real ~29
  // minutes (RUN_DEADLINE_MS plus a minute) instead of ~9e10ms.
  const durationMs = clock() - options.startTime
  await logRunStep(deps, {
    storeStatusMap: collected.storeStatusMap,
    storedCount,
    resolvedLength: resolved.length,
    collapsed: write.writeResult.collapsed,
    storagePartialFailure,
    durationMs,
  })

  const writeTailMs = clock() - writeTailStart
  console.log(
    `[pipeline] [INFO] write tail: ${writeTailMs}ms (taxonomy → resolve → storeDeals → enrichment → sweep → deactivate → logRun)`,
  )
  // N4 (code review, round 2): WRITE_TAIL_MS scales with deal count — warn
  // the moment a real run exceeds it, rather than trusting a measurement
  // taken at a smaller catalogue forever.
  const writeTailWarning = checkWriteTailDuration(writeTailMs)
  if (writeTailWarning) console.warn(`[pipeline] [WARN] ${writeTailWarning}`)

  return finishRun(deps, {
    runId: options.runId,
    stats,
    resolvedLength: resolved.length,
    storedCount,
    collapsed: write.writeResult.collapsed,
    durationMs,
    isFinalAttempt: options.isFinalAttempt,
    collectedOffers: collected.offers,
    judgeSpend,
    now: options.clock,
  })
}

// ============================================================
// The whole run
// ============================================================

export type RunPipelineOptions = {
  readonly now: Date
  readonly runId: string
  /** See `RunTransformOptions.isFinalAttempt`. */
  readonly isFinalAttempt: boolean
  /** See `RunTransformOptions.clock`. */
  readonly clock?: () => number
}

export async function runPipeline(deps: PipelineDeps, options: RunPipelineOptions): Promise<PipelineOutcome> {
  const clock = options.clock ?? Date.now
  const startTime = clock()
  console.log(`[pipeline] [INFO] Starting pipeline run ${options.runId}`)

  const collected = await runCollect(deps, { now: options.now })

  const allRaw = flattenStoreDeals(collected.storeDealsMap)
  if (allRaw.length === 0) {
    console.error('[pipeline] [ERROR] No deal data available from any source')
    return { status: 'no-data' }
  }

  return runTransform(deps, collected, {
    startTime,
    startDate: options.now,
    runId: options.runId,
    isFinalAttempt: options.isFinalAttempt,
    clock: options.clock,
  })
}
