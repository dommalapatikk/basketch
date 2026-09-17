import { describe, expect, it } from 'vitest'

import type { RunTrace } from '../../application/telemetry'
import { createIsoWeek } from '../../domain/iso-week'
import { unwrap } from '../../domain/result'
import { combineTelemetry, createJsonTelemetry, formatRunSummary } from './json-telemetry'

const WEEK_37 = unwrap(createIsoWeek('2026-W37'))
const WEEK_38 = unwrap(createIsoWeek('2026-W38'))

const trace: RunTrace = {
  runId: 'run_test',
  // Deliberately the run's own nominal week, NOT necessarily what every
  // source was asked for — the whole point of MUST-FIX 1 (WP-J1 code
  // review) is that these two can legitimately disagree.
  runWeek: WEEK_38,
  startedAt: '2026-09-08T05:00:00.000Z',
  durationMs: 8400,
  totalOffers: 431,
  status: 'degraded',
  sources: [
    {
      retailer: 'denner',
      // Denner has no week-numbered URL — its own publication is bookkeeping
      // only and happens to equal the run's week here.
      publication: WEEK_38,
      durationMs: 2100,
      status: 'ok',
      offerCount: 246,
      warningCount: 0,
      warnings: [],
      degraded: false,
    },
    {
      retailer: 'coop',
      publication: WEEK_38,
      durationMs: 6300,
      status: 'failed',
      offerCount: 0,
      warningCount: 0,
      failureReason: 'below-expected-yield',
      detail: 'parsed 3 offers, expected at least 100',
      warnings: [],
      degraded: false,
    },
  ],
}

/**
 * A Thursday-anchored retailer whose publication DIFFERS from the run's own
 * week — the exact shape MUST-FIX 1 exists to make visible. If `trace.week`
 * (now `runWeek`) were the only place a week appeared, this span's real
 * publication (2026-W37) would be invisible to an operator reading the log.
 */
const migrosSpan: RunTrace['sources'][number] = {
  retailer: 'migros',
  publication: WEEK_37,
  durationMs: 4200,
  status: 'ok',
  offerCount: 34,
  warningCount: 2,
  warnings: [],
  degraded: false,
}

const degradedSpan: RunTrace['sources'][number] = {
  retailer: 'coop',
  publication: WEEK_38,
  durationMs: 5000,
  status: 'ok',
  offerCount: 920,
  warningCount: 270,
  warnings: [],
  degraded: true,
}

function capture() {
  const lines: string[] = []
  return { lines, sink: (l: string) => lines.push(l) }
}

describe('JSON telemetry', () => {
  it('emits one parseable JSON object per line', () => {
    const { lines, sink } = capture()
    const t = createJsonTelemetry(sink)
    t.runStarted('run_test', WEEK_38, ['denner', 'coop'])
    t.sourceFinished('run_test', trace.sources[0]!)
    t.runFinished(trace)

    expect(lines).toHaveLength(3)
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow()
    expect(JSON.parse(lines[0]!).event).toBe('collection.run.started')
    expect(JSON.parse(lines[2]!).event).toBe('collection.run.finished')
  })

  it('tags every line with runId so a run can be reassembled by grep', () => {
    const { lines, sink } = capture()
    const t = createJsonTelemetry(sink)
    t.runStarted('run_test', WEEK_38, ['denner'])
    t.sourceFinished('run_test', trace.sources[0]!)
    t.runFinished(trace)
    for (const l of lines) expect(JSON.parse(l).runId).toBe('run_test')
  })

  it('includes the failure reason and detail on a failed source', () => {
    const { lines, sink } = capture()
    createJsonTelemetry(sink).sourceFinished('run_test', trace.sources[1]!)
    const e = JSON.parse(lines[0]!)
    expect(e.status).toBe('failed')
    expect(e.failureReason).toBe('below-expected-yield')
    expect(e.detail).toContain('expected at least 100')
  })

  it('omits failure fields on a healthy source', () => {
    const { lines, sink } = capture()
    createJsonTelemetry(sink).sourceFinished('run_test', trace.sources[0]!)
    const e = JSON.parse(lines[0]!)
    expect(e).not.toHaveProperty('failureReason')
    expect(e).not.toHaveProperty('warnings')
  })

  it('caps warnings in the log but keeps the count exact', () => {
    const { lines, sink } = capture()
    createJsonTelemetry(sink).sourceFinished('run_test', {
      retailer: 'coop',
      publication: WEEK_38,
      durationMs: 10,
      status: 'ok',
      offerCount: 5,
      warningCount: 100,
      warnings: Array.from({ length: 100 }, (_, i) => `dropped item ${i}`),
      degraded: false,
    })
    const e = JSON.parse(lines[0]!)
    expect(e.warningCount).toBe(100)
    expect(e.warnings).toHaveLength(20)
  })

  it('a degraded source is visible in the source event — WP-C3 code review F2 (was written and read by nothing)', () => {
    const { lines, sink } = capture()
    createJsonTelemetry(sink).sourceFinished('run_test', degradedSpan)
    const e = JSON.parse(lines[0]!)
    expect(e.degraded).toBe(true)
  })

  it('omits the degraded field entirely on a healthy source, not degraded: false', () => {
    const { lines, sink } = capture()
    createJsonTelemetry(sink).sourceFinished('run_test', trace.sources[0]!)
    const e = JSON.parse(lines[0]!)
    expect(e).not.toHaveProperty('degraded')
  })

  it('a degraded source is visible in the run-finished event too', () => {
    const { lines, sink } = capture()
    createJsonTelemetry(sink).runFinished({ ...trace, sources: [degradedSpan] })
    const e = JSON.parse(lines[0]!)
    expect(e.sources[0].degraded).toBe(true)
  })

  describe('WP-J1 code review MUST-FIX 1 — the per-source publication is emitted, not just the run week', () => {
    it('sourceFinished carries the source\'s OWN publication', () => {
      const { lines, sink } = capture()
      createJsonTelemetry(sink).sourceFinished('run_test', migrosSpan)
      const e = JSON.parse(lines[0]!)
      expect(e.publication).toBe('2026-W37')
    })

    it('runFinished carries BOTH the run-level runWeek and each source\'s own publication, and they may disagree', () => {
      const { lines, sink } = capture()
      createJsonTelemetry(sink).runFinished({ ...trace, sources: [migrosSpan, trace.sources[1]!] })
      const e = JSON.parse(lines[0]!)
      expect(e.runWeek).toBe('2026-W38')
      expect(e.sources[0].publication).toBe('2026-W37')
      expect(e.sources[1].publication).toBe('2026-W38')
      expect(e.runWeek).not.toBe(e.sources[0].publication)
    })
  })
})

describe('combineTelemetry', () => {
  it('fans out to every backend', () => {
    const a = capture()
    const b = capture()
    const t = combineTelemetry(createJsonTelemetry(a.sink), createJsonTelemetry(b.sink))
    t.runFinished(trace)
    expect(a.lines).toHaveLength(1)
    expect(b.lines).toHaveLength(1)
  })
})

describe('GitHub Actions run summary', () => {
  it('renders a table with per-store status and each store\'s own publication week', () => {
    const md = formatRunSummary(trace)
    expect(md).toContain('⚠️ Collection degraded — 2026-W38')
    expect(md).toContain('| denner | 2026-W38 | ✅ ok | 246 |')
    expect(md).toContain('| coop | 2026-W38 | ❌ below-expected-yield | 0 |')
  })

  it('shows a retailer\'s publication even when it differs from the run\'s own week', () => {
    const withMigros: RunTrace = { ...trace, sources: [...trace.sources, migrosSpan] }
    const md = formatRunSummary(withMigros)
    expect(md).toContain('| migros | 2026-W37 | ✅ ok | 34 |')
  })

  it('lists failures with their detail', () => {
    const md = formatRunSummary(trace)
    expect(md).toContain('### Failures')
    expect(md).toContain('**coop** — below-expected-yield: parsed 3 offers, expected at least 100')
  })

  it('omits the failures section on a clean run', () => {
    const clean: RunTrace = { ...trace, status: 'ok', sources: [trace.sources[0]!] }
    const md = formatRunSummary(clean)
    expect(md).toContain('✅ Collection ok')
    expect(md).not.toContain('### Failures')
  })

  it('marks a degraded-but-ok source in its row and lists it separately — WP-C3 code review F2', () => {
    const withDegraded: RunTrace = { ...trace, sources: [...trace.sources, degradedSpan] }
    const md = formatRunSummary(withDegraded)
    expect(md).toContain('| coop | 2026-W38 | ⚠️ ok (degraded) | 920 |')
    expect(md).toContain('### Degraded')
    expect(md).toContain('**coop** — more than 5% of its offers have a display-truncated name')
  })

  it('omits the degraded section on a run with no degraded source', () => {
    const md = formatRunSummary(trace)
    expect(md).not.toContain('### Degraded')
  })
})
