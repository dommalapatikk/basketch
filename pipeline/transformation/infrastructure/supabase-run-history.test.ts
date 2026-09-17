import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isOk } from '../../collection/domain/result'
import { measured, notMeasured } from '../domain/alerts'
import type { RunSnapshot } from '../domain/alerts'
import type { UsdMicros } from '../domain/spend'
import { createSupabaseRunHistory } from './supabase-run-history'

const snapshot = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  runId: 'run-1',
  finishedAtMs: 1_700_000_000_000,
  totalProducts: 100,
  classified: 90,
  uncertain: 5,
  rejected: 1,
  invalidCategoryRejected: 0,
  cacheHits: 80,
  cacheMisses: 20,
  tokensUsed: 1_000,
  usdMicrosSpent: 0 as UsdMicros,
  spendNearCeiling: false,
  spendUnguarded: false,
  durationMs: 120_000,
  benchmarkMacroF1: measured(0.86),
  publishedDataCoverage: { denner: 1 },
  halted: null,
  enrichment: { attempted: 0, enriched: 0, statedNothing: 0, rateLimited: 0, failed: 0 },
  ...over,
})

/** Minimal Supabase stub — enough surface for `.select().not().order().limit()` and `.insert()`. */
function stubClient(behaviour: {
  selectResult?: { data: unknown[] | null; error: { message: string; details?: string; hint?: string } | null }
  insertResult?: { error: { message: string } | null }
  throwOnInsert?: boolean
}) {
  const inserted: unknown[] = []
  const client = {
    from() {
      return {
        select() {
          return {
            not() {
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve(behaviour.selectResult ?? { data: [], error: null })
                    },
                  }
                },
              }
            },
          }
        },
        insert(row: unknown) {
          if (behaviour.throwOnInsert) throw new Error('connection reset')
          inserted.push(row)
          return Promise.resolve(behaviour.insertResult ?? { error: null })
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, inserted }
}

describe('lastSuccessful', () => {
  it('returns ok(null) when no run has ever saved a snapshot — not an error, a real state', async () => {
    const { client } = stubClient({ selectResult: { data: [], error: null } })
    const history = createSupabaseRunHistory({ client })
    const result = await history.lastSuccessful()
    expect(isOk(result)).toBe(true)
    expect(isOk(result) && result.value).toBeNull()
  })

  it('returns the most recent row carrying a valid RunSnapshot', async () => {
    const stored = snapshot({ runId: 'run-42', totalProducts: 1800 })
    const { client } = stubClient({ selectResult: { data: [{ metrics: stored }], error: null } })
    const history = createSupabaseRunHistory({ client })
    const result = await history.lastSuccessful()
    expect(isOk(result) && result.value).toEqual(stored)
  })

  it('round-trips a not-measured benchmark, not just a measured one', async () => {
    const stored = snapshot({ benchmarkMacroF1: notMeasured('benchmark not wired') })
    const { client } = stubClient({ selectResult: { data: [{ metrics: stored }], error: null } })
    const history = createSupabaseRunHistory({ client })
    const result = await history.lastSuccessful()
    expect(isOk(result) && result.value?.benchmarkMacroF1).toEqual(notMeasured('benchmark not wired'))
  })

  it('an unreadable table is reported as unreadable, never as "no previous run"', async () => {
    const degraded: string[] = []
    const { client } = stubClient({ selectResult: { data: null, error: { message: 'fetch failed', details: 'ECONNRESET' } } })
    const history = createSupabaseRunHistory({ client, onDegraded: (_op, detail) => degraded.push(detail) })

    const result = await history.lastSuccessful()

    expect(isOk(result)).toBe(false)
    expect(degraded.some((d) => d.includes('ECONNRESET'))).toBe(true)
  })

  it('a row whose metrics do not match the current shape is reported as unreadable, not trusted', async () => {
    const { client } = stubClient({ selectResult: { data: [{ metrics: { runId: 'run-1' } }], error: null } })
    const history = createSupabaseRunHistory({ client })
    const result = await history.lastSuccessful()
    expect(isOk(result)).toBe(false)
  })
})

describe('save', () => {
  it('inserts a new row carrying the snapshot as metrics — append-only, never an update', async () => {
    const { client, inserted } = stubClient({})
    const history = createSupabaseRunHistory({ client })
    const s = snapshot()

    const result = await history.save(s)

    expect(isOk(result)).toBe(true)
    expect(inserted).toEqual([{ metrics: s }])
  })

  it('reports a failed insert rather than pretending the snapshot was saved', async () => {
    const { client } = stubClient({ insertResult: { error: { message: 'insert rejected' } } })
    const history = createSupabaseRunHistory({ client })
    const result = await history.save(snapshot())
    expect(isOk(result)).toBe(false)
  })

  it('reports a thrown network error rather than crashing the run', async () => {
    const { client } = stubClient({ throwOnInsert: true })
    const history = createSupabaseRunHistory({ client })
    const result = await history.save(snapshot())
    expect(isOk(result)).toBe(false)
  })
})
