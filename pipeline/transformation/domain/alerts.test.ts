import { describe, expect, it } from 'vitest'
import type { UsdMicros } from './spend'
import {
  MACRO_F1_NOISE_FLOOR,
  type RunSnapshot,
  evaluateAlerts,
  formatAlerts,
  measured,
  notMeasured,
  shouldFailRun,
} from './alerts'

const NOW = Date.parse('2026-09-10T12:00:00Z')

const ZERO = 0 as UsdMicros

/**
 * WP-P7. Every field is a REAL, MEASURED value on purpose — this fixture
 * describes a fully-wired run, benchmark included, so the tests below exercise
 * the regression/drift rules the way they will read once AP-6 lands. The
 * "not-measured" shape gets its OWN describe block further down, because
 * production emits it today and it must not be silent.
 */
const snap = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  runId: 'run-1',
  finishedAtMs: NOW,
  totalProducts: 1800,
  classified: 1750,
  uncertain: 50,
  rejected: 0,
  invalidCategoryRejected: 0,
  cacheHits: 1600,
  cacheMisses: 200,
  tokensUsed: 80_000,
  usdMicrosSpent: ZERO,
  spendNearCeiling: false,
  spendUnguarded: false,
  durationMs: 8 * 60_000,
  benchmarkMacroF1: measured(0.86),
  publishedDataCoverage: { denner: 1.0, lidl: 1.0 },
  halted: null,
  ...over,
})

const codes = (a: ReturnType<typeof evaluateAlerts>) => a.map((x) => x.code)

describe('a healthy run is silent', () => {
  it('raises nothing when everything is normal, including a real benchmark', () => {
    expect(evaluateAlerts(snap(), snap(), NOW)).toEqual([])
  })

  it('does not fail CI', () => {
    expect(shouldFailRun(evaluateAlerts(snap(), snap(), NOW))).toBe(false)
  })
})

// WP-P7 (RCA item 2, root cause): "✅ no alerts" used to be the output of both
// a healthy run and a BLIND one — `benchmarkMacroF1` was a hardcoded `null`
// that the regression rule silently skipped. `Measured<T>` closes that: a run
// is only silent about the benchmark when it genuinely has one.
describe('an instrument that could not be read says so — it is not silent', () => {
  it('reports benchmarkMacroF1 as not-measured instead of skipping the regression check quietly', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: notMeasured('benchmark not wired (AP-6)') }), snap(), NOW)
    expect(codes(alerts)).toContain('instrument-missing')
    expect(alerts.find((a) => a.code === 'instrument-missing')?.message).toContain('benchmarkMacroF1')
    expect(shouldFailRun(alerts)).toBe(false)
  })

  it('never runs the regression/drift check on a not-measured benchmark', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: notMeasured('benchmark not wired') }), snap({ benchmarkMacroF1: measured(0.99) }), NOW)
    expect(codes(alerts)).not.toContain('classifier-regression')
    expect(codes(alerts)).not.toContain('classifier-drift')
  })

  it('a run with real cache traffic and no previous run says it could not compare, rather than nothing', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 900, cacheMisses: 900 }), null, NOW)
    expect(codes(alerts)).toContain('instrument-missing')
    expect(alerts.find((a) => a.code === 'instrument-missing')?.message).toContain('cache-hit-rate')
  })

  it('a run with real cache traffic and a previous run does not repeat the "no comparison" warning', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 900, cacheMisses: 900 }), snap(), NOW)
    expect(alerts.filter((a) => a.message.includes('cache-hit-rate comparison'))).toHaveLength(0)
  })

  it('stays silent about the cache below the volume threshold, previous run or not', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 50, cacheMisses: 40 }), null, NOW)
    expect(codes(alerts)).not.toContain('instrument-missing')
  })
})

describe('the pipeline stopped — the failure that actually happened', () => {
  it('fires when there has been no run for over a week', () => {
    // GitHub disables scheduled workflows after 60 days idle. This project has
    // already lost a pipeline that way, silently.
    const stale = snap({ finishedAtMs: NOW - 9 * 86_400_000 })
    const alerts = evaluateAlerts(stale, null, NOW)
    expect(codes(alerts)).toContain('pipeline-stale')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('fires when a run halted early', () => {
    const alerts = evaluateAlerts(snap({ halted: 'token budget exhausted: 800000/800000' }), snap(), NOW)
    expect(codes(alerts)).toContain('run-halted')
    expect(shouldFailRun(alerts)).toBe(true)
  })
})

describe('classifier regression vs noise', () => {
  it('is critical when macro-F1 falls past the regression threshold', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: measured(0.70) }), snap({ benchmarkMacroF1: measured(0.86) }), NOW)
    expect(codes(alerts)).toContain('classifier-regression')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('warns, but does not fail, on drift above the noise floor', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: measured(0.81) }), snap({ benchmarkMacroF1: measured(0.86) }), NOW)
    expect(codes(alerts)).toContain('classifier-drift')
    expect(shouldFailRun(alerts)).toBe(false)
  })

  it('stays silent inside the measured noise floor', () => {
    // Measured 2026-09-10: same model, same prompt, temperature 0, produced 16
    // errors one run and 18 the next. An alarm tighter than that fires weekly
    // and then gets ignored — which is how the original bug survived.
    const jitter = snap({ benchmarkMacroF1: measured(0.86 - (MACRO_F1_NOISE_FLOOR - 0.005)) })
    expect(evaluateAlerts(jitter, snap({ benchmarkMacroF1: measured(0.86) }), NOW)).toEqual([])
  })

  it('says nothing about regression without a previous run to compare against', () => {
    expect(codes(evaluateAlerts(snap({ benchmarkMacroF1: measured(0.4) }), null, NOW))).not.toContain('classifier-regression')
  })

  it('says nothing about regression when the PREVIOUS run never measured a benchmark either', () => {
    const alerts = evaluateAlerts(
      snap({ benchmarkMacroF1: measured(0.4) }),
      snap({ benchmarkMacroF1: notMeasured('benchmark not wired') }),
      NOW,
    )
    expect(codes(alerts)).not.toContain('classifier-regression')
    expect(codes(alerts)).not.toContain('classifier-drift')
  })
})

describe('a source changing shape — invisible in offer counts', () => {
  it('fires when published-metadata coverage collapses', () => {
    // Denner descriptor coverage went 100% today. If it hits 0 while offers
    // still parse, the adapter is silently blind and the model starts guessing
    // what it used to be told.
    const alerts = evaluateAlerts(
      snap({ publishedDataCoverage: { denner: 0, lidl: 1.0 } }),
      snap({ publishedDataCoverage: { denner: 1.0, lidl: 1.0 } }),
      NOW,
    )
    expect(codes(alerts)).toContain('source-shape-changed')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('does not fire for a source that never published metadata', () => {
    const alerts = evaluateAlerts(
      snap({ publishedDataCoverage: { coop: 0 } }),
      snap({ publishedDataCoverage: { coop: 0 } }),
      NOW,
    )
    expect(codes(alerts)).not.toContain('source-shape-changed')
  })

  // WP-P7: "not due" (ALDI/Volg's twice-weekly cadence) must never read as
  // "shape changed" just because this run never collected that retailer.
  it('does not fire for a retailer this run never collected at all', () => {
    const alerts = evaluateAlerts(
      snap({ publishedDataCoverage: { denner: 1.0 } }), // aldi absent — not due today
      snap({ publishedDataCoverage: { denner: 1.0, aldi: 1.0 } }),
      NOW,
    )
    expect(codes(alerts)).not.toContain('source-shape-changed')
  })
})

describe('quality and cost signals', () => {
  it('warns when uncertainty spikes', () => {
    expect(codes(evaluateAlerts(snap({ uncertain: 500 }), snap(), NOW))).toContain('uncertainty-spike')
  })

  it('warns when the model names categories that do not exist', () => {
    expect(codes(evaluateAlerts(snap({ invalidCategoryRejected: 100 }), snap(), NOW))).toContain('invalid-category-spike')
  })

  it('warns when the cache stops working', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 100, cacheMisses: 1700 }), snap(), NOW)
    expect(codes(alerts)).toContain('cache-hit-rate-low')
  })

  // WP-P8 replaced "any spend is unexpected" — untrue since the paid judge was
  // wired on 2026-09-10, and it would have fired on every run — with the two
  // things actually worth a warning.
  it('warns when a run approaches the monthly paid-model allowance', () => {
    expect(codes(evaluateAlerts(snap({ spendNearCeiling: true }), snap(), NOW))).toContain('spend-near-ceiling')
  })

  it('warns when a paid model was reachable with no provider-side cap (AP-10)', () => {
    expect(codes(evaluateAlerts(snap({ spendUnguarded: true }), snap(), NOW))).toContain('spend-unguarded')
  })

  it('says nothing about money on an ordinary run — the judge is paid by design', () => {
    const c = codes(evaluateAlerts(snap({ usdMicrosSpent: 250_000 as UsdMicros }), snap(), NOW))
    expect(c).not.toContain('spend-near-ceiling')
    expect(c).not.toContain('spend-unguarded')
  })

  it('neither money warning is critical — AP-10 keeps the run going without the judge', () => {
    const alerts = evaluateAlerts(snap({ spendNearCeiling: true, spendUnguarded: true }), snap(), NOW)
    const money = alerts.filter((a) => a.code.startsWith('spend-'))
    expect(money).toHaveLength(2)
    expect(money.every((a) => a.severity === 'warning')).toBe(true)
  })

  it('warns when a run gets slow enough to threaten the CI limit', () => {
    expect(codes(evaluateAlerts(snap({ durationMs: 50 * 60_000 }), snap(), NOW))).toContain('run-slow')
  })
})

describe('every alert says what to do about it', () => {
  it('carries a non-empty action — an alert without one is noise', () => {
    const alerts = evaluateAlerts(
      snap({ halted: 'budget', uncertain: 900, spendNearCeiling: true, invalidCategoryRejected: 200 }),
      snap({ benchmarkMacroF1: measured(0.9) }),
      NOW,
    )
    expect(alerts.length).toBeGreaterThan(2)
    for (const a of alerts) expect(a.action.length).toBeGreaterThan(20)
  })

  it('formats readably for a log or a notification', () => {
    const out = formatAlerts(evaluateAlerts(snap({ halted: 'budget' }), snap(), NOW))
    expect(out).toContain('🔴')
    expect(out).toContain('run-halted')
    expect(out).toContain('→')
  })

  it('says so plainly when there is nothing wrong', () => {
    expect(formatAlerts([])).toBe('✅ no alerts')
  })
})
