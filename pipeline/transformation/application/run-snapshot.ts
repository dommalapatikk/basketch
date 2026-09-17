// run-snapshot — the application-layer bridge between what a run actually
// produced and the domain's RunSnapshot (WP-P7 / RCA 2026-09-15, item 2).
//
// THE DEFECT THIS CLOSES: `run-pipeline.ts`'s `evaluateAlertsStep` built a
// `RunSnapshot` from six literals — `invalidCategoryRejected: 0`,
// `tokensUsed: 0`, `rappenSpent: 0`, `benchmarkMacroF1: null`,
// `publishedDataCoverage: {}`, `halted: null` — and always passed
// `previous: null`, because nothing ever saved a snapshot. 8 of 9 alert rules
// could never fire; only `uncertainty-spike` had real inputs.
//
// `buildRunSnapshot` is the fix: its parameters are the REAL output types —
// `ClassifyDealsResult['stats']`, the offers collection actually returned,
// and the judge's own spend reading — so there is nowhere left for a caller
// to type a literal. Per-retailer coverage is computed from
// `hasPublishedData` (`source-attributes.ts`) over those offers — a function
// that existed, fully built and tested, with no production caller before
// this file.
//
// LAYERING: application. Imports the collection and transformation DOMAIN
// (`Offer`, `hasPublishedData`, `RunSnapshot`, `Measured`) and the
// transformation application's own `ClassifyDealsResult` type. Imports
// NOTHING from infrastructure — no Supabase, no fetch. `SupabaseRunHistory`
// (infrastructure) implements the `RunHistory` port defined here.

import type { Offer, Retailer } from '../../collection/domain/offer'
import { hasPublishedData } from '../../collection/domain/source-attributes'
import type { Result } from '../../collection/domain/result'
import { type Measured, type RunSnapshot, SPEND_CEILING_WARN_SHARE, notMeasured } from '../domain/alerts'
import type { UsdMicros } from '../domain/spend'
import type { ClassifyDealsResult } from './classify-deals'

/**
 * What the composition root exposes about the judge's own spend ledger —
 * built once, in `composition.ts`, from the SAME `ModelGate` the judge calls
 * through, and the SAME `guarded` flag `resolveJudgeSpendCeiling` already
 * computed and — until this WP — never read again (WP-P8 review comment,
 * `model-gate.ts`'s `spendSnapshot()`).
 */
export type JudgeSpendInfo = {
  /**
   * `false` when a paid call was reachable (an OpenRouter key exists) with
   * no confirmed provider-side credit cap — AP-10's "run without the judge,
   * loudly" case. `true` when there is nothing to guard (no key at all) or
   * the account read back a confirmed monthly limit.
   */
  readonly guarded: boolean
  /**
   * `null` when nothing was ever reserved this run (no judge built at all).
   * Otherwise the judge's `ModelGate.spendSnapshot()` — what it has actually
   * spent, out of what this run was allowed.
   */
  readonly spendSnapshot: () => { readonly spentMicros: UsdMicros; readonly ceilingMicros: UsdMicros } | null
}

/**
 * The port every run's snapshot is saved through and the previous one read
 * back from — T2 (Tech Lead ruling, 2026-09-15): one `pipeline_runs.metrics
 * jsonb` column, append-only, one row per run.
 *
 * `lastSuccessful` returning `ok(null)` means "no successful run has ever
 * been saved" — a real, nameable state, never confused with "we could not
 * read the table", which is `err(...)` and must announce itself as
 * `instrument-missing`, not silently be read as "no previous run".
 */
export type RunHistory = {
  readonly lastSuccessful: () => Promise<Result<RunSnapshot | null>>
  readonly save: (snapshot: RunSnapshot) => Promise<Result<void>>
}

/**
 * Per-retailer share of THIS RUN's collected offers that carried real
 * published metadata (`hasPublishedData`, `source-attributes.ts:202`) — the
 * function the RCA named as "fully built and has no production caller
 * today". A retailer absent from the result was not collected this run at
 * all (not due this week, ALDI/Volg's twice-weekly cadence) — `evaluateAlerts`
 * already treats "absent from current" as "not comparable", never as a
 * collapse, so leaving it out here rather than writing a synthetic `0` is
 * what keeps that true.
 */
function publishedDataCoverage(offers: readonly Offer[]): Partial<Record<Retailer, number>> {
  const total = new Map<Retailer, number>()
  const withData = new Map<Retailer, number>()

  for (const offer of offers) {
    total.set(offer.retailer, (total.get(offer.retailer) ?? 0) + 1)
    if (hasPublishedData(offer.sourceAttributes)) {
      withData.set(offer.retailer, (withData.get(offer.retailer) ?? 0) + 1)
    }
  }

  const coverage: Partial<Record<Retailer, number>> = {}
  for (const [retailer, count] of total) {
    coverage[retailer] = count > 0 ? (withData.get(retailer) ?? 0) / count : 0
  }
  return coverage
}

/**
 * AP-6 (PM + Tech Lead) has not been decided: what should `benchmarkMacroF1`
 * even measure — live Denner offers, or the fixed 291-row benchmark
 * re-classified with the cache bypassed? Until it is, the field says so on
 * every run, honestly, rather than reading as a measured zero (the literal
 * `null` this replaces did the opposite: `evaluateAlerts` silently skipped
 * the whole regression/drift rule).
 */
const BENCHMARK_NOT_WIRED: Measured<number> = notMeasured(
  'benchmark not wired — AP-6 (what this metric should measure) is undecided by the PM',
)

export type RunSnapshotInputs = {
  readonly runId: string
  readonly finishedAtMs: number
  readonly durationMs: number
  readonly stats: ClassifyDealsResult['stats']
  /** The offers THIS run's collection phase actually returned — feeds `publishedDataCoverage`. */
  readonly collectedOffers: readonly Offer[]
  readonly judgeSpend: JudgeSpendInfo
}

/**
 * Pure. No literal left to type: every field comes from a real output — the
 * classification stats, the collected offers, or the judge's own ledger.
 */
export function buildRunSnapshot(inputs: RunSnapshotInputs): RunSnapshot {
  const { stats } = inputs
  const spend = inputs.judgeSpend.spendSnapshot()

  return {
    runId: inputs.runId,
    finishedAtMs: inputs.finishedAtMs,
    totalProducts: stats.total,
    classified: stats.classified,
    uncertain: stats.uncertain,
    rejected: stats.rejected,
    invalidCategoryRejected: stats.heldBackByFailure['invalid-category'] ?? 0,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.total - stats.cacheHits,
    tokensUsed: stats.tokensUsed,
    usdMicrosSpent: (spend?.spentMicros ?? 0) as UsdMicros,
    spendNearCeiling: spend !== null && spend.ceilingMicros > 0 && spend.spentMicros >= spend.ceilingMicros * SPEND_CEILING_WARN_SHARE,
    spendUnguarded: !inputs.judgeSpend.guarded,
    durationMs: inputs.durationMs,
    benchmarkMacroF1: BENCHMARK_NOT_WIRED,
    publishedDataCoverage: publishedDataCoverage(inputs.collectedOffers),
    halted: stats.halted,
  }
}
