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

import type { Retailer } from '../../collection/domain/offer'
import { RUN_TIMEOUT_MS } from './resilience'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type Alert = {
  readonly severity: AlertSeverity
  readonly code: string
  readonly message: string
  /** What to do about it. An alert without an action is noise. */
  readonly action: string
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
  readonly rappenSpent: number
  /** WP-P8: this run crossed SPEND_CEILING_WARN_SHARE of the monthly allowance. */
  readonly spendNearCeiling?: boolean
  /** WP-P8 (AP-10): a paid model was reachable with no provider-side cap, so the judge was skipped. */
  readonly spendUnguarded?: boolean
  readonly durationMs: number
  readonly benchmarkMacroF1: number | null
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

/** GitHub disables scheduled workflows after 60 days idle. 8 days catches it. */
/**
 * WP-P8 (AP-8). Warn once a run has consumed this share of the month's paid
 * allowance — early enough to act, late enough not to fire every week.
 */
export const SPEND_CEILING_WARN_SHARE = 0.8

export const STALE_RUN_MS = 8 * 24 * 60 * 60 * 1000

/**
 * Warn before the step's own external timeout, not after. Derived from
 * `RUN_TIMEOUT_MS` (THE one definition, `resilience.ts`) rather than a
 * second hardcoded number — F6, code review of the first WP-P3 submission.
 */
export const RUN_SLOW_THRESHOLD_MS = RUN_TIMEOUT_MS * 0.8

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
  if (current.benchmarkMacroF1 !== null && previous?.benchmarkMacroF1 != null) {
    const drop = previous.benchmarkMacroF1 - current.benchmarkMacroF1
    if (drop >= MACRO_F1_REGRESSION_THRESHOLD) {
      alerts.push({
        severity: 'critical',
        code: 'classifier-regression',
        message: `macro-F1 fell ${drop.toFixed(3)} (${previous.benchmarkMacroF1.toFixed(3)} → ${current.benchmarkMacroF1.toFixed(3)})`,
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
  if (looked > 100 && current.cacheHits / looked < 0.5 && previous !== null) {
    alerts.push({
      severity: 'warning',
      code: 'cache-hit-rate-low',
      message: `cache hit rate ${((current.cacheHits / looked) * 100).toFixed(0)}% — expected 85–95% after the first month`,
      action: 'A version was probably bumped (taxonomy, prompt or schema), invalidating every key. Expected once; not weekly.',
    })
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
