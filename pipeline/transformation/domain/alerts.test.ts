import { describe, expect, it } from 'vitest'
import {
  MACRO_F1_NOISE_FLOOR,
  type RunSnapshot,
  evaluateAlerts,
  formatAlerts,
  shouldFailRun,
} from './alerts'

const NOW = Date.parse('2026-09-10T12:00:00Z')

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
  rappenSpent: 0,
  durationMs: 8 * 60_000,
  benchmarkMacroF1: 0.86,
  publishedDataCoverage: { denner: 1.0, lidl: 1.0 },
  halted: null,
  ...over,
})

const codes = (a: ReturnType<typeof evaluateAlerts>) => a.map((x) => x.code)

describe('a healthy run is silent', () => {
  it('raises nothing when everything is normal', () => {
    expect(evaluateAlerts(snap(), snap(), NOW)).toEqual([])
  })

  it('does not fail CI', () => {
    expect(shouldFailRun(evaluateAlerts(snap(), snap(), NOW))).toBe(false)
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
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: 0.70 }), snap({ benchmarkMacroF1: 0.86 }), NOW)
    expect(codes(alerts)).toContain('classifier-regression')
    expect(shouldFailRun(alerts)).toBe(true)
  })

  it('warns, but does not fail, on drift above the noise floor', () => {
    const alerts = evaluateAlerts(snap({ benchmarkMacroF1: 0.81 }), snap({ benchmarkMacroF1: 0.86 }), NOW)
    expect(codes(alerts)).toContain('classifier-drift')
    expect(shouldFailRun(alerts)).toBe(false)
  })

  it('stays silent inside the measured noise floor', () => {
    // Measured 2026-09-10: same model, same prompt, temperature 0, produced 16
    // errors one run and 18 the next. An alarm tighter than that fires weekly
    // and then gets ignored — which is how the original bug survived.
    const jitter = snap({ benchmarkMacroF1: 0.86 - (MACRO_F1_NOISE_FLOOR - 0.005) })
    expect(evaluateAlerts(jitter, snap({ benchmarkMacroF1: 0.86 }), NOW)).toEqual([])
  })

  it('says nothing without a previous run to compare against', () => {
    expect(codes(evaluateAlerts(snap({ benchmarkMacroF1: 0.4 }), null, NOW))).not.toContain('classifier-regression')
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

  it('warns when a free pipeline starts spending money', () => {
    expect(codes(evaluateAlerts(snap({ rappenSpent: 250 }), snap(), NOW))).toContain('spend-unexpected')
  })

  it('warns when a run gets slow enough to threaten the CI limit', () => {
    expect(codes(evaluateAlerts(snap({ durationMs: 50 * 60_000 }), snap(), NOW))).toContain('run-slow')
  })
})

describe('every alert says what to do about it', () => {
  it('carries a non-empty action — an alert without one is noise', () => {
    const alerts = evaluateAlerts(
      snap({ halted: 'budget', uncertain: 900, rappenSpent: 300, invalidCategoryRejected: 200 }),
      snap({ benchmarkMacroF1: 0.9 }),
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
