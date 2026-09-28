import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `connection()`/`cacheTag()`/`cacheLife()` all require a real Next.js
// request/cache runtime (work-unit-async-storage) and throw outside one —
// see next/dist/server/request/connection.js and .../use-cache/cache-tag.js.
// `'use cache'` itself is inert under vitest (no SWC transform runs), so the
// function body below executes as plain JS and would hit those guards. These
// no-op stand-ins let the regression test exercise the real argument-passing
// contract (today flows in as a parameter) without needing the runtime that
// enforces the cache semantics themselves — the same trade-off the file's own
// pre-existing comment about `'use cache'` being inert under vitest describes.
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }))

/**
 * Replaces the old "expire <= 3600 bounds today's staleness" test (RCA
 * docs/rca/2026-09-27-tech-lead-stale-expired-deals.md §5.1, §7.2): that
 * premise was false. `cacheLife.expire` only ever bounded the in-memory
 * `'use cache'` entry, never the durable, traffic-driven Vercel ISR copy of
 * a fully-prerendered page — which is what actually stayed stale for hours
 * on 2026-09-27. The real fix is structural: `today` is a parameter of the
 * cached function, so it is part of the cache key (source-level assertions
 * below), and the page that reads it is never allowed to be the static
 * shell (enforced in `[locale]/page.test.tsx`, not here).
 */
// SF-2, docs/reviews/2026-09-28-review-stale-expired-deals.md: `source.indexOf`
// alone is fooled by a comment that happens to contain the same text as the
// real call — this file's own module doc comment says "`await connection()`
// defers this function..." BEFORE the real `await connection()` statement, so
// deleting the real call (mutation M7) left the comment's occurrence sitting
// at the same (smaller) index and the test kept passing. Stripping comments
// first means only actual code can satisfy the assertion.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('snapshot.ts source shape — the cache key includes the Zurich date', () => {
  const source = readFileSync(join(__dirname, 'snapshot.ts'), 'utf8')
  const code = stripComments(source)

  it('the cached function takes `today` as a parameter', () => {
    expect(source).toMatch(/async function getDealRowsForDay\(input:\s*\{\s*today:\s*string\s*\}\)/)
  })

  it('the exported, uncached getWeeklySnapshot calls connection() before reading the Zurich date', () => {
    const connectionIndex = code.indexOf('await connection()')
    const todayIndex = code.indexOf('todayInZurich()')
    expect(connectionIndex).toBeGreaterThan(-1)
    expect(todayIndex).toBeGreaterThan(-1)
    expect(connectionIndex).toBeLessThan(todayIndex)
  })

  it('the cache tag includes the day, so a pipeline revalidate still reaches every day\'s entry via the plain "deals" tag', () => {
    expect(source).toMatch(/cacheTag\(\s*['"]deals['"]\s*,\s*`deals:\$\{input\.today\}`\s*\)/)
  })

  it('never reads the wall clock (todayInZurich or new Date) inside the "use cache" function body', () => {
    const cachedFnStart = source.indexOf('async function getDealRowsForDay')
    const cachedFnEnd = source.indexOf('\n}', cachedFnStart)
    const cachedBody = source.slice(cachedFnStart, cachedFnEnd)
    expect(cachedBody).not.toMatch(/todayInZurich\(\)/)
    expect(cachedBody).not.toMatch(/new Date\(/)
  })
})

/**
 * Regression, named after the defect (RCA §7 item 1): a snapshot filled on
 * 2026-09-26 must never be served on 2026-09-27, because Volg's active deals
 * all have `valid_to = 2026-09-26`. `'use cache'` is inert under vitest (no
 * real Next cache to inspect outside a request), so this pins the CONTRACT
 * that makes the cache key correct instead: the function actually wrapped in
 * `'use cache'` (`supabaseDealsProvider.fetchDealRows`) must receive `today`
 * as an explicit argument that changes across the midnight boundary — never
 * a value it reads from the clock itself.
 */
describe('2026-09-27 stale-expired-deals: a snapshot filled on 2026-09-26 is never served on 2026-09-27 (Volg valid_to 2026-09-26)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('passes the day the fetch is keyed on as an argument, not a value read from inside the cache', async () => {
    const { supabaseDealsProvider } = await import('./supabase-provider')
    const fetchSpy = vi
      .spyOn(supabaseDealsProvider, 'fetchDealRows')
      .mockResolvedValue({ deals: [], isDegraded: false })

    const { getWeeklySnapshot } = await import('./snapshot')

    // 2026-09-26T21:50:00Z = 23:50 Zurich (CEST, UTC+2) — still 26 Sep.
    vi.useFakeTimers().setSystemTime(new Date('2026-09-26T21:50:00Z'))
    const before = await getWeeklySnapshot({ locale: 'de' })
    expect(before.today).toBe('2026-09-26')
    expect(fetchSpy).toHaveBeenLastCalledWith({ today: '2026-09-26' })

    // 2026-09-26T22:10:00Z = 00:10 Zurich, 27 Sep — the day has rolled over.
    vi.setSystemTime(new Date('2026-09-26T22:10:00Z'))
    const after = await getWeeklySnapshot({ locale: 'de' })
    expect(after.today).toBe('2026-09-27')
    expect(fetchSpy).toHaveBeenLastCalledWith({ today: '2026-09-27' })

    // The two requests hit the fetch with two DIFFERENT keys — never the
    // same one — which is exactly what makes a 26-Sep entry unreachable on
    // 27-Sep once this runs through the real Next cache in production.
    expect(fetchSpy.mock.calls[0]?.[0]).not.toEqual(fetchSpy.mock.calls[1]?.[0])
  })
})

/**
 * SF-1, docs/reviews/2026-09-28-review-stale-expired-deals.md: the test
 * above spies on `fetchDealRows` through `getWeeklySnapshot`, which reads
 * `today` from the clock itself (by design — it's the one place allowed to).
 * That can't tell apart a correct `getDealRowsForDay` from one mutated to
 * read the day through a helper instead of `input.today` (M9: "the D6 guard
 * only works at grep level and the regression test cannot tell the
 * difference, because 'use cache' does nothing under vitest"). Calling
 * `getDealRowsForDay` directly, with the clock set to a DIFFERENT day than
 * the argument, is the one test that tells them apart.
 */
describe('getDealRowsForDay — the argument wins over the clock (M9)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('fetches the day it was called with, not the day the system clock reports', async () => {
    const { supabaseDealsProvider } = await import('./supabase-provider')
    const fetchSpy = vi
      .spyOn(supabaseDealsProvider, 'fetchDealRows')
      .mockResolvedValue({ deals: [], isDegraded: false })

    const { getDealRowsForDay } = await import('./snapshot')

    // 2026-09-26T22:10:00Z = 00:10 Zurich, 27 Sep — the clock disagrees with
    // the argument below on purpose.
    vi.useFakeTimers().setSystemTime(new Date('2026-09-26T22:10:00Z'))

    await getDealRowsForDay({ today: '2026-09-26' })

    expect(fetchSpy).toHaveBeenCalledWith({ today: '2026-09-26' })
  })
})
