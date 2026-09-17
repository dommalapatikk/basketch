import { describe, expect, it } from 'vitest'
import type { Alert } from '../transformation/domain/alerts'
import { emitAnnotationsForAlerts, writeStepSummary } from './github-step-summary'

describe('a missing GITHUB_STEP_SUMMARY warns and never fails the run', () => {
  it('skips the write and logs a warning when the env var is absent', async () => {
    const calls: string[] = []
    const result = await writeStepSummary({}, '## hello', { log: (m) => calls.push(m) })

    expect(result).toEqual({ status: 'skipped', reason: expect.stringMatching(/GITHUB_STEP_SUMMARY/) })
    expect(calls.some((m) => /WARN/.test(m))).toBe(true)
  })

  it('never throws when the path is set but the write fails', async () => {
    const failing = async () => {
      throw new Error('EACCES: permission denied')
    }
    const result = await writeStepSummary({ GITHUB_STEP_SUMMARY: '/tmp/summary.md' }, '## hello', { appendFile: failing })
    expect(result).toEqual({ status: 'failed', reason: expect.stringContaining('EACCES') })
  })
})

describe('writes the markdown to the configured path', () => {
  it('appends the markdown, newline-terminated, to GITHUB_STEP_SUMMARY', async () => {
    const writes: { path: string; content: string }[] = []
    const result = await writeStepSummary(
      { GITHUB_STEP_SUMMARY: '/tmp/summary.md' },
      '## Run alerts\n\n✅ no alerts',
      { appendFile: async (path, content) => { writes.push({ path, content }) } },
    )

    expect(result).toEqual({ status: 'written' })
    expect(writes).toEqual([{ path: '/tmp/summary.md', content: '## Run alerts\n\n✅ no alerts\n' }])
  })
})

describe('emitAnnotationsForAlerts', () => {
  it('emits ::error:: for a critical alert and ::warning:: for a warning', () => {
    const alerts: Alert[] = [
      { severity: 'critical', code: 'run-halted', message: 'run halted: budget', action: 'check the budget caps' },
      { severity: 'warning', code: 'spend-near-ceiling', message: 'run is within 80% of allowance', action: 'check usage' },
    ]
    const lines: string[] = []
    emitAnnotationsForAlerts(alerts, (m) => lines.push(m))

    expect(lines[0]).toMatch(/^::error::\[run-halted\]/)
    expect(lines[1]).toMatch(/^::warning::\[spend-near-ceiling\]/)
  })

  it('maps an info-severity alert to ::notice:: — GitHub has no ::info:: command', () => {
    const alerts: Alert[] = [{ severity: 'info', code: 'fyi', message: 'nothing to act on', action: 'none' }]
    const lines: string[] = []
    emitAnnotationsForAlerts(alerts, (m) => lines.push(m))
    expect(lines[0]).toMatch(/^::notice::\[fyi\]/)
  })

  it('escapes a newline inside the message so it cannot truncate the annotation', () => {
    const alerts: Alert[] = [{ severity: 'warning', code: 'x', message: 'line one\nline two', action: 'a' }]
    const lines: string[] = []
    emitAnnotationsForAlerts(alerts, (m) => lines.push(m))
    expect(lines[0]).not.toContain('\n')
    expect(lines[0]).toContain('%0A')
  })

  it('emits nothing for an empty alert list — a healthy run adds no annotations', () => {
    const lines: string[] = []
    emitAnnotationsForAlerts([], (m) => lines.push(m))
    expect(lines).toEqual([])
  })
})
