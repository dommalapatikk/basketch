import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createMoney } from '../../collection/domain/money'
import { type Offer, createOffer } from '../../collection/domain/offer'
import { unwrap } from '../../collection/domain/result'
import { createValidityPeriod } from '../../collection/domain/validity-period'
import type { Classified } from '../domain/deal-row'
import { MINIMUM_STORE_RATE, createSupabaseDealStore } from './supabase-deal-store'

const WEEK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))

const offer = (productName: string): Offer =>
  unwrap(
    createOffer({
      retailer: 'denner',
      productName,
      salePrice: unwrap(createMoney(1.5)),
      validity: WEEK,
    }),
  )

const classified: Classified = { category: 'dairy', subCategory: 'dairy', confidence: 0.9, isUncertain: false }

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ offer: offer(`Produkt ${i}`), classified }))

/** Fails the Nth batch (1-indexed); all others succeed. */
function stubClient(opts: { failBatch?: number; throwBatch?: number; deactivated?: number } = {}) {
  const calls: { upserts: unknown[][]; onConflict: string[] } = { upserts: [], onConflict: [] }
  let batch = 0
  const client = {
    from() {
      return {
        upsert(rows: unknown[], options?: { onConflict?: string }) {
          batch++
          if (opts.throwBatch === batch) throw new Error('connection reset')
          calls.upserts.push(rows)
          if (options?.onConflict) calls.onConflict.push(options.onConflict)
          if (opts.failBatch === batch) {
            return Promise.resolve({ error: { message: 'violates check constraint "deals_aldi_rule"' } })
          }
          return Promise.resolve({ error: null })
        },
        update() {
          return {
            lt() {
              return {
                eq() {
                  return {
                    select: () =>
                      Promise.resolve({ data: Array.from({ length: opts.deactivated ?? 0 }, () => ({ id: 'x' })), error: null }),
                  }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const make = (client: SupabaseClient, log?: (m: string) => void) =>
  createSupabaseDealStore({ client, runId: 'run-test', log })

describe('storing', () => {
  it('writes every offer', async () => {
    const { client } = stubClient()
    const r = await make(client).store(items(5))
    expect(r.stored).toBe(5)
    expect(r.ok).toBe(true)
  })

  it('batches large runs rather than sending one enormous statement', async () => {
    // 1,600 rows in one insert is a single point of failure: one bad row and
    // the whole run stores nothing.
    const { client, calls } = stubClient()
    const r = await make(client).store(items(250))
    expect(r.stored).toBe(250)
    expect(calls.upserts.length).toBe(3)
  })

  it('upserts on the real natural key, so a re-run updates instead of duplicating', async () => {
    // Verified against the live schema: unique_deal is (store, product_name, valid_from).
    const { client, calls } = stubClient()
    await make(client).store(items(1))
    expect(calls.onConflict[0]).toBe('store,product_name,valid_from')
  })

  it('does nothing at all for an empty run', async () => {
    const { client, calls } = stubClient()
    const r = await make(client).store([])
    expect(r).toEqual({ attempted: 0, stored: 0, failed: 0, failures: [], ok: true })
    expect(calls.upserts.length).toBe(0)
  })
})

describe('a partial failure loses one batch, not the run', () => {
  it('keeps the other batches when one fails', async () => {
    const { client } = stubClient({ failBatch: 2 })
    const r = await make(client).store(items(300))
    expect(r.stored).toBe(200)
    expect(r.failed).toBe(100)
  })

  it('names a product from the failing batch, not just the error code', async () => {
    // "23514 check constraint violation" alone tells you nothing about WHICH
    // product tripped it. The sample is what makes the log actionable.
    const { client } = stubClient({ failBatch: 1 })
    const r = await make(client).store(items(10))
    expect(r.failures[0]?.sample).toBe('Produkt 0')
    expect(r.failures[0]?.reason).toContain('deals_aldi_rule')
  })

  it('survives the client throwing outright', async () => {
    const { client } = stubClient({ throwBatch: 1 })
    const r = await make(client).store(items(10))
    expect(r.stored).toBe(0)
    expect(r.failures[0]?.reason).toContain('connection reset')
  })
})

describe('storing almost nothing is a FAILURE, not a quiet success', () => {
  it('reports ok when nearly everything stored', async () => {
    const { client } = stubClient({ failBatch: 5 })
    const r = await make(client).store(items(1000))
    expect(r.stored).toBe(900)
    expect(r.ok).toBe(true)
  })

  it('reports NOT ok when most of the run failed to store', async () => {
    // The old pipeline recorded that a run happened, never whether it stored
    // anything worth having. 3 rows where 1,600 were expected must be loud.
    const { client } = stubClient({ failBatch: 1 })
    const r = await make(client).store(items(100))
    expect(r.stored).toBe(0)
    expect(r.ok).toBe(false)
  })

  it('says so in the log when it falls below the floor', async () => {
    const lines: string[] = []
    const { client } = stubClient({ failBatch: 1 })
    await make(client, (m) => lines.push(m)).store(items(100))
    expect(lines.join('\n')).toContain('FAILED')
  })

  it('uses a floor that is a real threshold, not a formality', () => {
    expect(MINIMUM_STORE_RATE).toBeGreaterThanOrEqual(0.8)
    expect(MINIMUM_STORE_RATE).toBeLessThan(1)
  })
})

describe('expiring old deals', () => {
  it('reports how many were deactivated', async () => {
    // Without this the site slowly fills with last month's prices — the single
    // most damaging failure for a price comparison.
    const { client } = stubClient({ deactivated: 42 })
    expect(await make(client).deactivateExpired('2026-09-11')).toBe(42)
  })

  it('returns 0 rather than throwing when the update fails', async () => {
    const client = {
      from: () => ({
        update: () => ({ lt: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'nope' } }) }) }) }),
      }),
    } as unknown as SupabaseClient
    expect(await make(client).deactivateExpired('2026-09-11')).toBe(0)
  })
})
