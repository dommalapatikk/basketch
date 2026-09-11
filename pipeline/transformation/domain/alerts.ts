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
export const STALE_RUN_MS = 8 * 24 * 60 * 60 * 1000

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
  if (current.durationMs > 45 * 60_000) {
    alerts.push({
      severity: 'warning',
      code: 'run-slow',
      message: `run took ${Math.round(current.durationMs / 60_000)} minutes`,
      action: 'A provider may be throttling. GitHub Actions jobs are capped at 6 hours.',
    })
  }

  // ── Money ─────────────────────────────────────────────────────────────────
  if (current.rappenSpent > 100) {
    alerts.push({
      severity: 'warning',
      code: 'spend-unexpected',
      message: `run spent ${current.rappenSpent} rappen — this pipeline should be free`,
      action: 'Something is calling a paid model. Check which model the classifier resolved to.',
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
