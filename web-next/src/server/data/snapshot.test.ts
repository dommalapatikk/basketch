import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * HIGH, code review of 9525601: `cacheLife('hours')` revalidates in the
 * background hourly but only EXPIRES (forces a synchronous, fresh rebuild)
 * after a day. Under low overnight traffic — 10-50 users, per CLAUDE.md —
 * nobody's request triggers that background revalidation, so the first
 * visitor after a quiet night can be served a `today` up to ~24h stale:
 * Thursday's flyer still reads "from Thu" and is excluded from the verdict,
 * or a deal that ended Wednesday still votes.
 *
 * `cacheLife`/`cacheTag` require the Next.js runtime and cannot be invoked
 * directly in a vitest unit test (there is no cache to inspect outside a
 * real request), so this is a source-level config test — the same pattern
 * CLAUDE.md's own plan uses for the pipeline's
 * `RUN_DEADLINE_MS < timeout_minutes in pipeline.yml` check: read the
 * config, assert its bound, rather than exercise the runtime behaviour.
 */
describe('getWeeklySnapshot cache profile bounds "today" staleness', () => {
  const source = readFileSync(join(__dirname, 'snapshot.ts'), 'utf8')

  it('does not use the unbounded-expire "hours" preset (expire: 1 day)', () => {
    expect(source).not.toMatch(/cacheLife\(\s*['"]hours['"]\s*\)/)
  })

  it('sets an explicit expire of at most one hour, so "today" can never be more than an hour stale', () => {
    const match = source.match(/expire:\s*(\d+)/)
    expect(match).not.toBeNull()
    const expireSeconds = Number(match?.[1])
    expect(expireSeconds).toBeGreaterThan(0)
    expect(expireSeconds).toBeLessThanOrEqual(3600)
  })

  it('keeps a revalidate shorter than expire, so most requests never hit the synchronous rebuild', () => {
    const revalidateMatch = source.match(/revalidate:\s*(\d+)/)
    const expireMatch = source.match(/expire:\s*(\d+)/)
    expect(revalidateMatch).not.toBeNull()
    expect(expireMatch).not.toBeNull()
    expect(Number(revalidateMatch?.[1])).toBeLessThan(Number(expireMatch?.[1]))
  })
})
