import { describe, expect, it } from 'vitest'

import type { RunTrace } from '../../application/telemetry'
import { combineTelemetry, createJsonTelemetry, formatRunSummary } from './json-telemetry'

const trace: RunTrace = {
  runId: 'run_test',
  week: '2026-W37',
  startedAt: '2026-09-08T05:00:00.000Z',
  durationMs: 8400,
  totalOffers: 431,
  status: 'degraded',
  sources: [
    { retailer: 'denner', durationMs: 2100, status: 'ok', offerCount: 246, warningCount: 0, warnings: [] },
    {
      retailer: 'coop',
      durationMs: 6300,
      status: 'failed',
      offerCount: 0,
      warningCount: 0,
      failureReason: 'below-expected-yield',
      detail: 'parsed 3 offers, expected at least 100',
      warnings: [],
    },
  ],
}

function capture() {
  const lines: string[] = []
  return { lines, sink: (l: string) => lines.push(l) }
}

describe('JSON telemetry', () => {
  it('emits one parseable JSON object per line', () => {
    const { lines, sink } = capture()
    const t = createJsonTelemetry(sink)
    t.runStarted('run_test', '2026-W37', ['denner', 'coop'])
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
    t.runStarted('run_test', '2026-W37', ['denner'])
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
      durationMs: 10,
      status: 'ok',
      offerCount: 5,
      warningCount: 100,
      warnings: Array.from({ length: 100 }, (_, i) => `dropped item ${i}`),
    })
    const e = JSON.parse(lines[0]!)
    expect(e.warningCount).toBe(100)
    expect(e.warnings).toHaveLength(20)
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
  it('renders a table with per-store status', () => {
    const md = formatRunSummary(trace)
    expect(md).toContain('⚠️ Collection degraded — 2026-W37')
    expect(md).toContain('| denner | ✅ ok | 246 |')
    expect(md).toContain('| coop | ❌ below-expected-yield | 0 |')
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
})
