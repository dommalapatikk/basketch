// Alerts — the conditions that must be noticed without anyone watching.
//
// The founding failure of this project: `pipeline_runs` was written on every run
// for months and nobody read it, so a categorisation regression stayed invisible
// while the pipeline reported success. Emitting data is not observability.
//
// Every rule below is derived from something that actually broke:
//
//   tomato purée in fresh vegetables   nothing was ever visibly unsure
//   pipeline stopped for 60 days       GitHub disables idle cron; nothing noticed
//   Denner descriptor coverage         a source can change shape while offer
//                                      counts stay perfectly healthy
//   16 wrong one run, 18 the next      temperature 0 is NOT deterministic, so a
//                                      regression alarm needs a noise band or it
//                                      cries wolf every week
//   8 of 9 rules fed literals          `run.ts` hardcoded invalidCategoryRejected,
//                                      tokensUsed, rappenSpent, benchmarkMacroF1,
//                                      publishedDataCoverage and halted, and
//                                      always passed `previous: null` — so
//                                      "✅ no alerts" was the output of a run
//                                      that was healthy AND of one that was
//                                      blind (RCA 2026-09-15, item 2; WP-P7).
//
// WP-P7's own fix has a shape worth naming: `Measured<T>` (below) exists
// because a rule fed a LITERAL zero and a rule that genuinely MEASURED zero
// were, before this file, indistinguishable. A field that has never been
// wired must say so, not silently read as "measured and fine".

import type { Retailer } from '../../collection/domain/offer'
import type { UsdMicros } from './spend'
import { RUN_TIMEOUT_MS } from './resilience'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type Alert = {
  readonly severity: AlertSeverity
  readonly code: string
  readonly message: string
  /** What to do about it. An alert without an action is noise. */
  readonly action: string
}

/**
 * A field that either was genuinely read, or says why it was not.
 *
 * THE INVARIANT THIS EXISTS TO ENFORCE: an alert rule that could not evaluate
 * must announce that, rather than sitting silent — silence is what let a run
 * that stored 400 deals log "✅ no alerts" while four of its rules were fed
 * hardcoded literals (RCA 2026-09-15, item 2). `null`, `0` and `{}` are all
 * valid MEASURED values, so a caller that forgot to wire an instrument could
 * pass one and the type system would not notice. `Measured<T>` makes "I did
 * not measure this" a distinct, named state instead of a value that happens
 * to look like zero.
 */
export type Measured<T> =
  | { readonly kind: 'measured'; readonly value: T }
  | { readonly kind: 'not-measured'; readonly reason: string }

export function measured<T>(value: T): Measured<T> {
  return { kind: 'measured', value }
}

export function notMeasured<T>(reason: string): Measured<T> {
  return { kind: 'not-measured', reason }
}

export type RunSnapshot = {
  readonly runId: string
  readonly finishedAtMs: number
  readonly totalProducts: number
  readonly classified: number
  readonly uncertain: number
  readonly rejected: number
  readonly invalidCategoryRejected: number
  readonly cacheHits: number
  readonly cacheMisses: number
  readonly tokensUsed: number
  /**
   * WP-P8 moved spend to USD (OpenRouter meters and caps in USD; see
   * `spend.ts`). Renamed from `rappenSpent`, which no production caller had
   * ever fed a real value — CHF rappen described a ceiling
   * (`guardrails.ts`'s `Budget.maxRappen`) that nothing paid into. A field
   * with no producer is exactly the shape this WP exists to close, so it is
   * not carried forward under its old name.
   */
  readonly usdMicrosSpent: UsdMicros
  /** WP-P8: this run crossed SPEND_CEILING_WARN_SHARE of the monthly allowance. */
  readonly spendNearCeiling: boolean
  /** WP-P8 (AP-10): a paid model was reachable with no provider-side cap, so the judge was skipped. */
  readonly spendUnguarded: boolean
  readonly durationMs: number
  /**
   * `not-measured` until AP-6 (what this metric should measure) is decided by
   * the PM — see `docs/rca/2026-09-15-architect-items-1-2-5.md` §2.4. Kept as
   * `Measured<number>`, not `number | null`, so a run that has not wired a
   * benchmark says so on every run instead of silently skipping the
   * regression/drift rules below.
   */
  readonly benchmarkMacroF1: Measured<number>
  readonly publishedDataCoverage: Partial<Record<Retailer, number>>
  readonly halted: string | null
}

/**
 * How far macro-F1 may drop before it counts as a regression.
 *
 * NOT a round number chosen by taste. Measured 2026-09-10: the same model, same
 * prompt, same 291 products, temperature 0, produced 16 errors one run and 18
 * the next — a swing of ~0.7pp in accuracy from nothing but provider
 * non-determinism. An alarm tighter than the noise floor fires every week and
 * is then ignored, which is how the original bug survived.
 */
export const MACRO_F1_NOISE_FLOOR = 0.03
export const MACRO_F1_REGRESSION_THRESHOLD = 0.10

/** Above this share of uncertain results, something upstream is wrong. */
export const UNCERTAIN_RATE_ALARM = 0.20

/** A source publishing nothing while still yielding offers has changed shape. */
export const COVERAGE_COLLAPSE = 0.01

/**
 * WP-P8 (AP-8). Warn once a run has consumed this share of the month's paid
 * allowance — early enough to act, late enough not to fire every week.
 */
export const SPEND_CEILING_WARN_SHARE = 0.8

/** GitHub disables scheduled workflows after 60 days idle. 8 days catches it. */
export const STALE_RUN_MS = 8 * 24 * 60 * 60 * 1000

/**
 * Warn before the step's own external timeout, not after. Derived from
 * `RUN_TIMEOUT_MS` (THE one definition, `resilience.ts`) rather than a
 * second hardcoded number — F6, code review of the first WP-P3 submission.
 */
export const RUN_SLOW_THRESHOLD_MS = RUN_TIMEOUT_MS * 0.8

/**
 * The uniform shape for "a rule could not run". Named `instrument-missing`,
 * not `<field>-missing`, because the field it names is in `message` — one
 * code an operator can filter on, whatever is unmeasured this run.
 */
function instrumentMissing(field: string, reason: string): Alert {
  return {
    severity: 'warning',
    code: 'instrument-missing',
    message: `${field} could not be evaluated: ${reason}`,
    action:
      'Expected until the instrument is wired or a baseline exists (one run after the first successful save). ' +
      'If it never clears, something upstream stopped producing it.',
  }
}

export function evaluateAlerts(
  current: RunSnapshot,
  previous: RunSnapshot | null,
  nowMs: number,
): Alert[] {
  const alerts: Alert[] = []

  // ── The run did not happen ────────────────────────────────────────────────
  if (nowMs - current.finishedAtMs > STALE_RUN_MS) {
    alerts.push({
      severity: 'critical',
      code: 'pipeline-stale',
      message: `no successful run for ${Math.floor((nowMs - current.finishedAtMs) / 86_400_000)} days`,
      action: 'GitHub disables scheduled workflows after 60 days without a commit. Re-enable it and push.',
    })
  }

  // ── The run stopped early ─────────────────────────────────────────────────
  if (current.halted) {
    alerts.push({
      severity: 'critical',
      code: 'run-halted',
      message: `run halted: ${current.halted}`,
      action: 'Check the budget caps and the provider status. Products were left unclassified.',
    })
  }

  // ── The classifier regressed ──────────────────────────────────────────────
  //
  // `not-measured` announces itself INSTEAD OF the regression/drift check,
  // never alongside it — there is nothing to compare while the instrument is
  // unwired, so trying both would just be a second way to say nothing.
  if (current.benchmarkMacroF1.kind === 'not-measured') {
    alerts.push(instrumentMissing('benchmarkMacroF1', current.benchmarkMacroF1.reason))
  } else if (previous !== null && previous.benchmarkMacroF1.kind === 'measured') {
    const currentF1 = current.benchmarkMacroF1.value
    const previousF1 = previous.benchmarkMacroF1.value
    const drop = previousF1 - currentF1
    if (drop >= MACRO_F1_REGRESSION_THRESHOLD) {
      alerts.push({
        severity: 'critical',
        code: 'classifier-regression',
        message: `macro-F1 fell ${drop.toFixed(3)} (${previousF1.toFixed(3)} → ${currentF1.toFixed(3)})`,
        action: 'Compare prompt_version and model between the two runs. A provider may have changed the model behind a stable name.',
      })
    } else if (drop >= MACRO_F1_NOISE_FLOOR) {
      alerts.push({
        severity: 'warning',
        code: 'classifier-drift',
        message: `macro-F1 fell ${drop.toFixed(3)} — above the ${MACRO_F1_NOISE_FLOOR} noise floor but below the regression threshold`,
        action: 'Watch. Two consecutive drifts in the same direction is a regression, not noise.',
      })
    }
  }

  // ── A source changed shape ────────────────────────────────────────────────
  //
  // Compares only retailers COLLECTED IN BOTH runs. A retailer absent from
  // `current.publishedDataCoverage` is not "due" this run (ALDI/Volg's
  // twice-weekly cadence, WP-J1) — that is a scheduling fact, not a shape
  // change, so it must never read as one.
  for (const [retailer, coverage] of Object.entries(current.publishedDataCoverage)) {
    const was = previous?.publishedDataCoverage?.[retailer as Retailer]
    if (coverage <= COVERAGE_COLLAPSE && was !== undefined && was > 0.5) {
      alerts.push({
        severity: 'critical',
        code: 'source-shape-changed',
        message: `${retailer} published-metadata coverage collapsed ${was.toFixed(2)} → ${coverage.toFixed(2)}`,
        action: `The ${retailer} adapter still parses offers but no longer reads their metadata. Offer counts will look healthy. Check the adapter against a fresh response.`,
      })
    }
  }

  // ── The model is out of its depth ─────────────────────────────────────────
  if (current.totalProducts > 0) {
    const rate = current.uncertain / current.totalProducts
    if (rate > UNCERTAIN_RATE_ALARM) {
      alerts.push({
        severity: 'warning',
        code: 'uncertainty-spike',
        message: `${(rate * 100).toFixed(0)}% of products are uncertain (threshold ${UNCERTAIN_RATE_ALARM * 100}%)`,
        action: 'Check the review queue. A spike usually means a source degraded, not that the model got worse.',
      })
    }
  }

  // ── The prompt and the taxonomy drifted apart ────────────────────────────
  if (current.invalidCategoryRejected > current.totalProducts * 0.02) {
    alerts.push({
      severity: 'warning',
      code: 'invalid-category-spike',
      message: `${current.invalidCategoryRejected} answers named a category outside the taxonomy`,
      action: 'The prompt and BROWSE_CATEGORIES have drifted apart, or the model changed. Should sit near zero.',
    })
  }

  // ── The cache stopped working ─────────────────────────────────────────────
  const looked = current.cacheHits + current.cacheMisses
  if (looked > 100) {
    if (previous === null) {
      // WP-P7: this used to be silent — the `previous !== null` gate below
      // meant "no history yet" and "measured and fine" produced the identical
      // empty alert list. A run with real cache traffic and no baseline says
      // so, once, until `RunHistory` has a first successful save to compare
      // against.
      alerts.push(instrumentMissing('cache-hit-rate comparison', 'no previous run to compare against yet'))
    } else if (current.cacheHits / looked < 0.5) {
      alerts.push({
        severity: 'warning',
        code: 'cache-hit-rate-low',
        message: `cache hit rate ${((current.cacheHits / looked) * 100).toFixed(0)}% — expected 85–95% after the first month`,
        action: 'A version was probably bumped (taxonomy, prompt or schema), invalidating every key. Expected once; not weekly.',
      })
    }
  }

  // ── The run is too slow ───────────────────────────────────────────────────
  // F6 (code review of the first WP-P3 submission): was a hardcoded 45 while
  // `resilience.ts` claimed to be THE ONE DEFINITION of the step timeout.
  // Derived at 80% of it so this warns before the step's own external
  // timeout, not after.
  if (current.durationMs > RUN_SLOW_THRESHOLD_MS) {
    alerts.push({
      severity: 'warning',
      code: 'run-slow',
      message: `run took ${Math.round(current.durationMs / 60_000)} minutes`,
      action: 'A provider may be throttling. GitHub Actions jobs are capped at 6 hours.',
    })
  }

  // ── Money ─────────────────────────────────────────────────────────────────
  //
  // WP-P8. This pipeline is NOT free and has not been since 2026-09-10: the
  // classification judge is `openai/gpt-5-nano` through OpenRouter, a
  // deliberate PM decision, capped at USD 5 a month (AP-8). The old rule here
  // warned that spending ANY money was unexpected, which stopped being true
  // the day the judge was wired and would have cried wolf on every run.
  //
  // What is worth waking someone for is a run approaching the ceiling, or a
  // paid call that was possible with no provider-side cap behind it. Both are
  // WARNINGS on purpose: under AP-7 a critical alert fails the run, and AP-10
  // says a run with an unguarded account should keep going WITHOUT the judge,
  // not die.
  if (current.spendNearCeiling) {
    alerts.push({
      severity: 'warning',
      code: 'spend-near-ceiling',
      message: `run is within ${SPEND_CEILING_WARN_SHARE * 100}% of the monthly paid-model allowance`,
      action: 'Check the OpenRouter key\'s usage. Raising the cap is a PM decision (AP-8), not a code change.',
    })
  }

  if (current.spendUnguarded) {
    alerts.push({
      severity: 'warning',
      code: 'spend-unguarded',
      message: 'a paid model was reachable with no provider-side credit limit — the judge was skipped',
      action: 'Set a credit limit on the OpenRouter CI key (USD 5/month, monthly reset, auto top-up off), then re-run.',
    })
  }

  return alerts
}

/** True when a run should be treated as failed by CI. */
export function shouldFailRun(alerts: readonly Alert[]): boolean {
  return alerts.some((a) => a.severity === 'critical')
}

/** One-line-per-alert summary for logs and notifications. */
export function formatAlerts(alerts: readonly Alert[]): string {
  if (alerts.length === 0) return '✅ no alerts'
  const icon = { critical: '🔴', warning: '🟡', info: 'ℹ️' } as const
  return alerts.map((a) => `${icon[a.severity]} [${a.code}] ${a.message}\n   → ${a.action}`).join('\n')
}
