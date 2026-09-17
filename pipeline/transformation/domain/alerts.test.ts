import { describe, expect, it } from 'vitest'
import type { UsdMicros } from './spend'
import {
  MACRO_F1_NOISE_FLOOR,
  RUN_SLOW_THRESHOLD_MS,
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
  enrichment: { attempted: 0, enriched: 0, statedNothing: 0, rateLimited: 0, failed: 0 },
  ...over,
})

/** `evaluateAlerts`'s second argument: a real previous run, read fine. */
const prev = (s: RunSnapshot | null = snap()) => measured(s)

/** The RunHistory read itself failed — never confused with "no previous run" (F1). */
const unreadableHistory = (reason = 'pipeline_runs.metrics unreadable: fetch failed') => notMeasured<RunSnapshot | null>(reason)

const codes = (a: ReturnType<typeof evaluateAlerts>) => a.map((x) => x.code)

describe('a healthy run is silent', () => {
  it('raises nothing when everything is normal, including a real benchmark', () => {
    expect(evaluateAlerts(snap(), prev())).toEqual([])
  })

  it('does not fail CI', () => {
    expect(shouldFailRun(evaluateAlerts(snap(), prev()))).toBe(false)
  })
})

// WP-P7 (RCA item 2, root cause): "✅ no alerts" used to be the output of both
// a healthy run and a BLIND one — `benchmarkMacroF1` was a hardcoded `null`
// that the regression rule silently skipped. `Measured<T>` closes that: a run
// is only silent about the benchmark when it genuinely has one.
describe('an instrument that could not be read says so — it is not silent', () => {
  it('reports benchmarkMacroF1 as not-measured instead of skipping the regression check quietly', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: notMeasured('benchmark not wired (AP-6)') }), prev())
    expect(codes(alerts)).toContain('instrument-missing')
    expect(alerts.find((a) => a.code === 'instrument-missing' && a.message.includes('benchmarkMacroF1'))).toBeDefined()
    expect(shouldFailRun(alerts)).toBe(false)
  })

  it('never runs the regression/drift check on a not-measured benchmark', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: notMeasured('benchmark not wired') }), prev(snap({ benchmarkMacroF1: measured(0.99) })))
    expect(codes(alerts)).not.toContain('classifier-regression')
    expect(codes(alerts)).not.toContain('classifier-drift')
  })

  it('a run with real cache traffic and no previous run says it could not compare, rather than nothing', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 900, cacheMisses: 900 }), prev(null))
    expect(codes(alerts)).toContain('instrument-missing')
    expect(alerts.find((a) => a.code === 'instrument-missing' && a.message.includes('cache-hit-rate'))).toBeDefined()
  })

  it('a run with real cache traffic and a previous run does not repeat the "no comparison" warning', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 900, cacheMisses: 900 }), prev())
    expect(alerts.filter((a) => a.message.includes('cache-hit-rate comparison'))).toHaveLength(0)
  })

  it('stays silent about the cache below the volume threshold, previous run or not', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 50, cacheMisses: 40 }), prev(null))
    expect(codes(alerts)).not.toContain('instrument-missing')
  })

  // WP-P7 code review, F1 (MUST-FIX). `supabase-run-history.ts` returns a
  // genuine `err(...)` when `pipeline_runs.metrics` cannot be read; before
  // this fix the caller collapsed that into `previous = null`, which every
  // rule below read as "no previous run YET" — an unreadable history was
  // completely silent under the cache rule's 100-lookup volume gate, and
  // misreported as "first run ever" above it. The architect's own TDD list
  // names this exact test (RCA 2026-09-15 item 2, §2.5).
  describe('an unreadable run history (F1)', () => {
    it('is reported as not-measured, never as "no previous run"', () => {
      const alerts = evaluateAlerts(snap(), unreadableHistory('HTTP 500'))
      const instrument = alerts.find((a) => a.code === 'instrument-missing' && a.message.includes('previous run'))
      expect(instrument).toBeDefined()
      expect(instrument?.message).toContain('HTTP 500')
      expect(instrument?.message).not.toContain('no previous run')
    })

    it('is a warning, not a critical failure — AP-10-style: comparison is degraded, not the run', () => {
      const alerts = evaluateAlerts(snap(), unreadableHistory())
      expect(shouldFailRun(alerts)).toBe(false)
    })

    it('produces exactly ONE instrument-missing for the unreadable history, even with real cache traffic', () => {
      const alerts = evaluateAlerts(snap({ cacheHits: 900, cacheMisses: 900 }), unreadableHistory())
      expect(alerts.filter((a) => a.code === 'instrument-missing')).toHaveLength(1)
    })

    it('suppresses classifier-regression/drift the same way "no previous run" would', () => {
      const alerts = evaluateAlerts(snap({ benchmarkMacroF1: measured(0.2) }), unreadableHistory())
      expect(codes(alerts)).not.toContain('classifier-regression')
      expect(codes(alerts)).not.toContain('classifier-drift')
    })

    it('suppresses source-shape-changed the same way "no previous run" would', () => {
      const alerts = evaluateAlerts(snap({ publishedDataCoverage: { denner: 0 } }), unreadableHistory())
      expect(codes(alerts)).not.toContain('source-shape-changed')
    })

    it('never fires pipeline-stale from an unreadable history alone', () => {
      const alerts = evaluateAlerts(snap(), unreadableHistory())
      expect(codes(alerts)).not.toContain('pipeline-stale')
    })
  })
})

describe('the pipeline stopped — the failure that actually happened', () => {
  // WP-P7 code review, F2a (MUST-FIX). The in-process form
  // (`nowMs - current.finishedAtMs`) is measured from inside the very process
  // reporting `finishedAtMs`, so the gap is always ~0ms — structurally unable
  // to fire. The gap is now measured against the LAST SUCCESSFUL run's own
  // `finishedAtMs`, which a run that actually executes can genuinely observe.
  it('fires when the gap since the last successful run exceeds a week', () => {
    const nineDaysMs = 9 * 24 * 60 * 60 * 1000
    const old = snap({ finishedAtMs: NOW })
    const current = snap({ finishedAtMs: NOW + nineDaysMs })
    const alerts = evaluateAlerts(current, prev(old))
    expect(codes(alerts)).toContain('pipeline-stale')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('stays silent inside the gap threshold', () => {
    const old = snap({ finishedAtMs: NOW })
    const current = snap({ finishedAtMs: NOW + 2 * 24 * 60 * 60 * 1000 })
    expect(codes(evaluateAlerts(current, prev(old)))).not.toContain('pipeline-stale')
  })

  it('never fires on a genuine first run — there is no previous to measure a gap against', () => {
    const current = snap({ finishedAtMs: NOW + 9 * 24 * 60 * 60 * 1000 })
    expect(codes(evaluateAlerts(current, prev(null)))).not.toContain('pipeline-stale')
  })

  it('fires when a run halted early', () => {
    const alerts = evaluateAlerts(snap({ halted: 'token budget exhausted: 800000/800000' }), prev())
    expect(codes(alerts)).toContain('run-halted')
    expect(shouldFailRun(alerts)).toBe(true)
  })
})

describe('classifier regression vs noise', () => {
  it('is critical when macro-F1 falls past the regression threshold', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: measured(0.70) }), prev(snap({ benchmarkMacroF1: measured(0.86) })))
    expect(codes(alerts)).toContain('classifier-regression')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('warns, but does not fail, on drift above the noise floor', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: measured(0.81) }), prev(snap({ benchmarkMacroF1: measured(0.86) })))
    expect(codes(alerts)).toContain('classifier-drift')
    expect(shouldFailRun(alerts)).toBe(false)
  })

  it('stays silent inside the measured noise floor', () => {
    // Measured 2026-09-10: same model, same prompt, temperature 0, produced 16
    // errors one run and 18 the next. An alarm tighter than that fires weekly
    // and then gets ignored — which is how the original bug survived.
    const jitter = snap({ benchmarkMacroF1: measured(0.86 - (MACRO_F1_NOISE_FLOOR - 0.005)) })
    expect(evaluateAlerts(jitter, prev(snap({ benchmarkMacroF1: measured(0.86) })))).toEqual([])
  })

  it('says nothing about regression without a previous run to compare against', () => {
    expect(codes(evaluateAlerts(snap({ benchmarkMacroF1: measured(0.4) }), prev(null)))).not.toContain('classifier-regression')
  })

  it('says nothing about regression when the PREVIOUS run never measured a benchmark either', () => {
    const alerts = evaluateAlerts(
      snap({ benchmarkMacroF1: measured(0.4) }),
      prev(snap({ benchmarkMacroF1: notMeasured('benchmark not wired') })),
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
      prev(snap({ publishedDataCoverage: { denner: 1.0, lidl: 1.0 } })),
    )
    expect(codes(alerts)).toContain('source-shape-changed')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('does not fire for a source that never published metadata', () => {
    const alerts = evaluateAlerts(
      snap({ publishedDataCoverage: { coop: 0 } }),
      prev(snap({ publishedDataCoverage: { coop: 0 } })),
    )
    expect(codes(alerts)).not.toContain('source-shape-changed')
  })

  // WP-P7: "not due" (ALDI/Volg's twice-weekly cadence) must never read as
  // "shape changed" just because this run never collected that retailer.
  it('does not fire for a retailer this run never collected at all', () => {
    const alerts = evaluateAlerts(
      snap({ publishedDataCoverage: { denner: 1.0 } }), // aldi absent — not due today
      prev(snap({ publishedDataCoverage: { denner: 1.0, aldi: 1.0 } })),
    )
    expect(codes(alerts)).not.toContain('source-shape-changed')
  })
})

describe('quality and cost signals', () => {
  it('warns when uncertainty spikes', () => {
    expect(codes(evaluateAlerts(snap({ uncertain: 500 }), prev()))).toContain('uncertainty-spike')
  })

  it('warns when the model names categories that do not exist', () => {
    expect(codes(evaluateAlerts(snap({ invalidCategoryRejected: 100 }), prev()))).toContain('invalid-category-spike')
  })

  it('warns when the cache stops working', () => {
    const alerts = evaluateAlerts(snap({ cacheHits: 100, cacheMisses: 1700 }), prev())
    expect(codes(alerts)).toContain('cache-hit-rate-low')
  })

  // WP-P8 replaced "any spend is unexpected" — untrue since the paid judge was
  // wired on 2026-09-10, and it would have fired on every run — with the two
  // things actually worth a warning.
  it('warns when a run approaches the monthly paid-model allowance', () => {
    expect(codes(evaluateAlerts(snap({ spendNearCeiling: true }), prev()))).toContain('spend-near-ceiling')
  })

  it('warns when a paid model was reachable with no provider-side cap (AP-10)', () => {
    expect(codes(evaluateAlerts(snap({ spendUnguarded: true }), prev()))).toContain('spend-unguarded')
  })

  it('says nothing about money on an ordinary run — the judge is paid by design', () => {
    const c = codes(evaluateAlerts(snap({ usdMicrosSpent: 250_000 as UsdMicros }), prev()))
    expect(c).not.toContain('spend-near-ceiling')
    expect(c).not.toContain('spend-unguarded')
  })

  it('neither money warning is critical — AP-10 keeps the run going without the judge', () => {
    const alerts = evaluateAlerts(snap({ spendNearCeiling: true, spendUnguarded: true }), prev())
    const money = alerts.filter((a) => a.code.startsWith('spend-'))
    expect(money).toHaveLength(2)
    expect(money.every((a) => a.severity === 'warning')).toBe(true)
  })

  it('warns when a run gets slow enough to threaten a normal finish', () => {
    expect(codes(evaluateAlerts(snap({ durationMs: 50 * 60_000 }), prev()))).toContain('run-slow')
  })

  // WP-P7 code review, F2b (MUST-FIX). The threshold used to be 0.8 x
  // RUN_TIMEOUT_MS (48 minutes, the pipeline.yml step's own external kill
  // line) — but classification is cut off at RUN_DEADLINE_MS (28 minutes),
  // so a run that finishes normally realistically peaks around 37 minutes,
  // never anywhere near 48. A threshold no real run can reach can never fire.
  it('derives the threshold from the in-process deadline, not the step timeout', () => {
    expect(RUN_SLOW_THRESHOLD_MS).toBeLessThan(40 * 60_000)
    expect(RUN_SLOW_THRESHOLD_MS).toBeGreaterThan(30 * 60_000)
  })

  it('fires just above the realistic peak duration (deadline + write tail), which the old 48-minute threshold never would', () => {
    const justOverRealisticPeak = RUN_SLOW_THRESHOLD_MS + 1
    expect(codes(evaluateAlerts(snap({ durationMs: justOverRealisticPeak }), prev()))).toContain('run-slow')
  })
})

describe('every alert says what to do about it', () => {
  it('carries a non-empty action — an alert without one is noise', () => {
    const alerts = evaluateAlerts(
      snap({ halted: 'budget', uncertain: 900, spendNearCeiling: true, invalidCategoryRejected: 200 }),
      prev(snap({ benchmarkMacroF1: measured(0.9) })),
    )
    expect(alerts.length).toBeGreaterThan(2)
    for (const a of alerts) expect(a.action.length).toBeGreaterThan(20)
  })

  it('formats readably for a log or a notification', () => {
    const out = formatAlerts(evaluateAlerts(snap({ halted: 'budget' }), prev()))
    expect(out).toContain('🔴')
    expect(out).toContain('run-halted')
    expect(out).toContain('→')
  })

  it('says so plainly when there is nothing wrong', () => {
    expect(formatAlerts([])).toBe('✅ no alerts')
  })
})
