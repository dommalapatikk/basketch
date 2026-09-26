// Tests for product resolution: find existing, create new, batch handling (mocked Supabase).
//
// WP-1c (2026-09-25 tech-lead plan, RCA §2): `resolveProducts` used to read
// "all existing products for the store" with no `.range()`. PostgREST caps an
// unpaged SELECT at 1,000 rows (`max-rows`), silently — Coop alone has 7,793.
// So ~90% of a week's products looked "new" and were re-upserted onto their
// existing rows, rewriting `first_seen_at`-adjacent columns and printing
// "Created 916 new coop products" when 147 were actually new.
//
// The fix: look up ONLY the keys this run needs, chunked through `.in()` —
// using `chunkByEncodedSize`, the SAME shared-kernel function
// `supabase-classification-cache.ts` uses — so the lookup never depends on
// how many rows the table holds.
//
// M-1 (2026-09-26 review): the first version of this fix chunked by KEY
// COUNT (`CHUNK_SIZE = 200`), reintroducing the exact defect
// `supabase-classification-cache.ts` already hit in production (run
// 34703713179): `source_name` is a raw retailer string full of umlauts, `%`,
// `&` and spaces that percent-encode to 3-6 bytes each, so a 200-key chunk of
// long Coop names could overflow postgrest-js's 8,000-byte urlLengthLimit
// while a chunk of short ones would not. The fix below chunks by BYTES
// (`chunkByEncodedSize`, 5,000-byte budget / 150-key ceiling), retries a
// failed chunk (bounded), and degrades ONLY that chunk when every retry
// fails — never the whole store, which is what turned one bad Coop chunk
// into zero product ids for every Coop deal.

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'
import { encodedSize } from './shared-kernel/chunk-by-encoded-size'

// Build a chainable mock that tracks the query.
//
// The lookup chain is now `.select(...).eq('store', store).in('source_name', chunk)`
// — never a bare `.eq(store)` awaited on its own, which was the OLD, unpaged
// path. `mockEqResult` below is deliberately THENABLE as well as chainable:
// it lets a regression test model "what would the OLD code have seen" (a
// capped table read) side by side with "what the NEW code asks for"
// (an exact key-set match), without needing two different production paths.
const mockSelectEqInResult = vi.fn()
const mockUpsertSelectResult = vi.fn()

const mockFrom = vi.fn((_table: string) => ({
  // For: .select(...).eq(...).in(...)
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      in: mockSelectEqInResult,
    })),
  })),
  // For: .upsert(...).select(...) — used both to insert missing products
  // (ignoreDuplicates: true) and to grouped-upsert offer dates onto existing
  // ones (onConflict: 'id').
  upsert: vi.fn(() => ({
    select: mockUpsertSelectResult,
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// Mock product-group-assign to avoid needing all group rules
vi.mock('./product-group-assign', () => ({
  assignProductGroup: () => null,
}))

const { resolveProducts } = await import('./product-resolve')

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    store: 'migros',
    productName: 'Vollmilch 1L',
    originalPrice: 1.95,
    salePrice: 1.5,
    discountPercent: 23,
    validFrom: '2026-04-09',
    validTo: '2026-04-16',
    image: null,
    sourceCategory: 'Milch',
    sourceUrl: null,
    category: 'fresh',
    subCategory: 'dairy',
    taxonomyConfidence: 0.7,
    ...overrides,
  }
}

/** An existing-product row shaped for the key-set lookup. */
function existingRow(over: Partial<{ id: string; source_name: string; product_group: string | null; canonical_name: string; category: string }> = {}) {
  return {
    id: 'prod-1',
    source_name: 'Vollmilch 1L',
    product_group: null,
    canonical_name: 'Vollmilch 1L',
    category: 'fresh',
    ...over,
  }
}

describe('resolveProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: mockSelectEqInResult,
        })),
      })),
      upsert: vi.fn(() => ({
        select: mockUpsertSelectResult,
      })),
    }))
  })

  it('returns empty map for empty deals array', async () => {
    const result = await resolveProducts([], 'migros')
    expect(result.size).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('matches existing products by source_name via a key-set lookup', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({
      data: [existingRow({ id: 'prod-1', source_name: 'Vollmilch 1L', product_group: 'milk-whole-1l' })],
      error: null,
    })
    // The matched deal has a validFrom, so an offer-date grouped upsert follows.
    mockUpsertSelectResult.mockResolvedValueOnce({ data: [{ id: 'prod-1' }], error: null })

    const deals = [makeDeal({ productName: 'Vollmilch 1L' })]
    const result = await resolveProducts(deals, 'migros')

    expect(result.size).toBe(1)
    expect(result.get('Vollmilch 1L')).toEqual({
      productId: 'prod-1',
      productGroup: 'milk-whole-1l',
    })
    expect(mockSelectEqInResult).toHaveBeenCalledWith('source_name', ['Vollmilch 1L'])
  })

  it('creates new products for unmatched deals', async () => {
    // Key-set lookup returns no existing products
    mockSelectEqInResult.mockResolvedValueOnce({ data: [], error: null })
    // Insert-missing upsert returns the new row
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'new-prod-1', source_name: 'Pouletbrust 500g', product_group: null }],
      error: null,
    })

    const deals = [makeDeal({ productName: 'Pouletbrust 500g', category: 'fresh', subCategory: 'poultry' })]
    const result = await resolveProducts(deals, 'migros')

    expect(result.size).toBe(1)
    expect(result.get('Pouletbrust 500g')?.productId).toBe('new-prod-1')
  })

  it('handles a key-set lookup error gracefully, resolving nothing rather than guessing new-vs-existing', async () => {
    // M-1: a failed chunk is now RETRIED (bounded) before it counts as
    // unreadable, so every attempt — not just the first — must see the
    // error, or a later retry would read `undefined` from an unconfigured
    // mock and crash instead of degrading.
    mockSelectEqInResult.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    })

    const deals = [makeDeal()]
    const result = await resolveProducts(deals, 'migros')

    expect(result.size).toBe(0)
    // A chunk we could not read must never be treated as "these are all new" —
    // that is exactly how a transient error would mint duplicate products.
    expect(mockUpsertSelectResult).not.toHaveBeenCalled()
  })

  it('handles insert error gracefully and continues', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({ data: [], error: null })
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'insert failed' },
    })

    const deals = [makeDeal()]
    const result = await resolveProducts(deals, 'migros')

    // Failed to insert, so no products resolved from insert
    expect(result.size).toBe(0)
  })

  it('deduplicates by source_name in a single run', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({ data: [], error: null })
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'deduped-1', source_name: 'Vollmilch 1L', product_group: null }],
      error: null,
    })

    // Same product name appears twice in deals
    const deals = [
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-04-09' }),
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-04-16' }),
    ]
    const result = await resolveProducts(deals, 'migros')

    // Both deals map to the same product
    expect(result.size).toBe(1)
    expect(result.get('Vollmilch 1L')?.productId).toBe('deduped-1')
  })

  it('chunks the key-set lookup so a single .in() call never carries every name in a big run', async () => {
    const names = Array.from({ length: 450 }, (_, i) => `Product ${i}`)
    mockSelectEqInResult.mockResolvedValue({ data: [], error: null })
    mockUpsertSelectResult.mockResolvedValue({ data: [], error: null })

    const deals = names.map((n) => makeDeal({ productName: n }))
    await resolveProducts(deals, 'migros')

    expect(mockSelectEqInResult.mock.calls.length).toBeGreaterThan(1)
    const total = mockSelectEqInResult.mock.calls.reduce((sum, call) => sum + (call[1] as string[]).length, 0)
    expect(total).toBe(450)
    // M-1: the byte-budget chunker's own key ceiling is 150, not the old
    // count-based CHUNK_SIZE of 200.
    for (const call of mockSelectEqInResult.mock.calls) {
      expect((call[1] as string[]).length).toBeLessThanOrEqual(150)
    }
  })

  // THE DEFECT, 2026-09-24 Coop RCA (tech-lead cross-review §2):
  // `product-resolve.ts:47-50` read the WHOLE `products` table for a store
  // with no `.range()`. PostgREST's `max-rows` silently caps that read at
  // 1,000 rows. Coop has 7,793 live products, so a product past row 1,000
  // was invisible to the old lookup map and got RE-SENT as new — merging
  // onto its own existing row and rewriting first-seen-adjacent columns.
  // "916 created" on 2026-09-24 was really 147.
  it('2026-09-24: 7,793 Coop products, PostgREST returns 1,000 — an existing product beyond the cap is never re-sent as new', async () => {
    // A virtual table far bigger than PostgREST's 1,000-row cap.
    const FULL_TABLE = Array.from({ length: 1200 }, (_, i) =>
      existingRow({
        id: `prod-${i + 1}`,
        source_name: `Coop Product ${i + 1}`,
        canonical_name: `Coop Product ${i + 1}`,
      }),
    )
    // What PostgREST's max-rows actually hands back to a bare, unpaged read —
    // the OLD code's whole query. It is missing everything past row 1,000.
    const cappedRows = FULL_TABLE.slice(0, 1000)

    const targetName = 'Coop Product 1150' // beyond the cap
    const target = FULL_TABLE.find((p) => p.source_name === targetName)!

    const inSpy = vi.fn((_col: string, values: string[]) =>
      Promise.resolve({ data: FULL_TABLE.filter((p) => values.includes(p.source_name)), error: null }),
    )
    const upsertSpy = vi.fn()

    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          // A THENABLE that is ALSO chainable with `.in()`. Awaiting it
          // directly (the OLD, unpaged path) resolves to what PostgREST's
          // max-rows really returns: capped, and missing this product.
          const node = {
            in: inSpy,
            then: (resolve: (v: unknown) => void) => resolve({ data: cappedRows, error: null }),
          }
          return node
        }),
      })),
      upsert: vi.fn((batch: unknown[], options: unknown) => {
        upsertSpy(batch, options)
        return { select: mockUpsertSelectResult }
      }),
    }))
    mockUpsertSelectResult.mockResolvedValueOnce({ data: [{ id: target.id }], error: null })

    const deal = makeDeal({ productName: targetName, validFrom: '2026-09-24', validTo: '2026-10-01' })
    const result = await resolveProducts([deal], 'coop')

    // Resolved to its REAL, existing id — not a freshly minted one.
    expect(result.get(targetName)?.productId).toBe(target.id)
    // The lookup went through `.in()`, scoped to exactly this run's key(s).
    expect(inSpy).toHaveBeenCalledWith('source_name', [targetName])
    // S-2 (2026-09-26 review): assert on the SHAPE of the row, not on the
    // upsert's options. An insert-path row (a "new product") has no `id` yet;
    // an offer-date-update row always has one (`onConflict: 'id'`). Asserting
    // only "not called with ignoreDuplicates: true for this target" would
    // still pass against a regression that re-inserted the target WITHOUT
    // that flag — the old code upserted with no `ignoreDuplicates` at all, so
    // that narrower assertion would not have caught its own defect. This one
    // fails on ANY upsert call whose batch contains an id-less row for the
    // target, whatever options ride alongside it.
    const insertShapedTarget = upsertSpy.mock.calls.some(([batch]) =>
      (batch as Record<string, unknown>[]).some(
        (row) => row.source_name === targetName && !('id' in row),
      ),
    )
    expect(insertShapedTarget).toBe(false)
  })
})

// M-1 (2026-09-26 review). `CHUNK_SIZE = 200` counted KEYS, not bytes — the
// exact defect `supabase-classification-cache.ts` already hit in production
// (run 34703713179). `source_name` is a raw retailer string full of umlauts,
// `%`, `&` and spaces; a 200-key chunk of long Coop names can overflow
// postgrest-js's 8,000-byte `urlLengthLimit` while a chunk of short names
// would not — and `fetchExistingByKeySet` used to return `null` (never an
// empty map) the moment ANY chunk failed, which zeroed the WHOLE store's
// product ids, not just the names in that one chunk.
describe('M-1: the key-set lookup chunks by BYTES, retries a failed chunk, and degrades only that chunk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: vi.fn(() => ({ select: mockUpsertSelectResult })),
    }))
  })

  it('keeps every lookup chunk under the byte budget for long, umlaut-heavy names — a count-based chunk could not', async () => {
    const names = Array.from(
      { length: 300 },
      (_, i) => `Denner Schweinsnierstück Aktion ${i} mit Umlauten äöü und Prozent %`,
    )
    mockSelectEqInResult.mockResolvedValue({ data: [], error: null })
    mockUpsertSelectResult.mockResolvedValue({ data: [], error: null })

    const deals = names.map((n) => makeDeal({ productName: n }))
    await resolveProducts(deals, 'coop')

    expect(mockSelectEqInResult.mock.calls.length).toBeGreaterThan(1)
    for (const call of mockSelectEqInResult.mock.calls) {
      const chunkNames = call[1] as string[]
      expect(chunkNames.length).toBeLessThanOrEqual(150)
      expect(encodedSize(chunkNames)).toBeLessThanOrEqual(5_000)
    }
    // No key is lost or duplicated across chunks.
    const seen = mockSelectEqInResult.mock.calls.flatMap((call) => call[1] as string[])
    expect(seen.sort()).toEqual([...names].sort())
  })

  it('retries a failed chunk (bounded) before giving up on it', async () => {
    let attempts = 0
    mockSelectEqInResult.mockImplementation(() => {
      attempts++
      if (attempts < 3) return Promise.resolve({ data: null, error: { message: 'fetch failed' } })
      return Promise.resolve({ data: [existingRow({ id: 'prod-1', source_name: 'Vollmilch 1L' })], error: null })
    })
    mockUpsertSelectResult.mockResolvedValue({ data: [{ id: 'prod-1' }], error: null })

    const result = await resolveProducts([makeDeal({ productName: 'Vollmilch 1L' })], 'migros')

    // Recovered on the retry — resolved to the real existing row.
    expect(result.get('Vollmilch 1L')?.productId).toBe('prod-1')
    expect(attempts).toBeGreaterThan(1)
  })

  it('a chunk that fails EVERY retry is skipped — not resolved, not recreated as new — while the OTHER chunk keeps its ids', async () => {
    // 150 names fill exactly one byte-budget chunk (the default max-keys
    // ceiling); the 151st name lands alone in a second chunk. That second
    // chunk fails every attempt; the first must be completely unaffected —
    // this is the M-1 defect itself: one bad chunk must never zero a whole
    // store's product ids.
    const goodNames = Array.from({ length: 150 }, (_, i) => `Good Product ${i}`)
    const badName = 'Bad Product (always times out)'

    let badAttempts = 0
    mockSelectEqInResult.mockImplementation((_col: string, values: string[]) => {
      if (values.length === 1 && values[0] === badName) {
        badAttempts++
        return Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout' } })
      }
      return Promise.resolve({
        data: values.map((name) => existingRow({ id: `id-${name}`, source_name: name, canonical_name: name })),
        error: null,
      })
    })
    const upsertCalls: Record<string, unknown>[][] = []
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: vi.fn((batch: Record<string, unknown>[]) => {
        upsertCalls.push(batch)
        return { select: mockUpsertSelectResult }
      }),
    }))
    mockUpsertSelectResult.mockResolvedValue({ data: [], error: null })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const deals = [...goodNames, badName].map((n) => makeDeal({ productName: n }))
    const result = await resolveProducts(deals, 'coop')
    errorSpy.mockRestore()

    for (const name of goodNames) {
      expect(result.get(name)?.productId).toBe(`id-${name}`)
    }
    expect(result.has(badName)).toBe(false)
    // Bounded retry: attempted more than once, but not unboundedly.
    expect(badAttempts).toBeGreaterThan(1)
    expect(badAttempts).toBeLessThanOrEqual(5)
    // Never guessed "new" (nor queued an offer-date update) for a name we
    // could not read — it must appear in NO write batch at all.
    const badNameWritten = upsertCalls.some((batch) => batch.some((row) => row.source_name === badName))
    expect(badNameWritten).toBe(false)
  })
})

// M-2 (2026-09-26 review). Two deals resolving to the SAME existing product
// (e.g. two promotion windows for "Vollmilch 1L" in one run) used to push TWO
// entries into `offerDateUpdates`, both carrying the same `id`. The single
// `ON CONFLICT (id) DO UPDATE` upsert then proposed the same conflict key
// twice, and Postgres rejects the WHOLE statement (SQLSTATE 21000) — losing
// up to a whole batch (100) products' offer dates, not just the duplicate.
//
// Fix: dedupe `offerDateUpdates` by `id` before the upsert. The entry with
// the LATEST `offer_valid_from` wins — the most recent promotion window is
// the one worth keeping current; ties keep whichever is encountered last,
// same as the old per-row `Promise.all` (last write won).
describe('M-2: offer-date updates are deduped by product id before the single upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: vi.fn(() => ({ select: mockUpsertSelectResult })),
    }))
  })

  it('two deals with the same source_name against one existing row produce ONE row per id in the upsert payload', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({
      data: [existingRow({ id: 'prod-1', source_name: 'Vollmilch 1L' })],
      error: null,
    })
    const upsertSpy = vi.fn((_batch: unknown[]) => ({ select: mockUpsertSelectResult }))
    // NOT `.mockImplementationOnce` — `.from('products')` is called once for
    // the lookup and again for the offer-date upsert, and `upsertSpy` must be
    // the `upsert` returned on BOTH calls (only the second is ever invoked).
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: upsertSpy,
    }))
    mockUpsertSelectResult.mockResolvedValueOnce({ data: [{ id: 'prod-1' }], error: null })

    const deals = [
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-09-24', validTo: '2026-09-30' }),
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-09-25', validTo: '2026-10-01' }),
    ]
    await resolveProducts(deals, 'migros')

    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const batch = upsertSpy.mock.calls[0]![0] as { id: string }[]
    const ids = batch.map((r) => r.id)
    expect(ids).toEqual(['prod-1']) // one row, not two, for the same id
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the LATEST offer_valid_from when two deals collide on one product id', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({
      data: [existingRow({ id: 'prod-1', source_name: 'Vollmilch 1L' })],
      error: null,
    })
    const upsertSpy = vi.fn((_batch: unknown[]) => ({ select: mockUpsertSelectResult }))
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: upsertSpy,
    }))
    mockUpsertSelectResult.mockResolvedValueOnce({ data: [{ id: 'prod-1' }], error: null })

    const deals = [
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-09-24', validTo: '2026-09-30' }),
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-09-30', validTo: '2026-10-07' }),
    ]
    await resolveProducts(deals, 'migros')

    const batch = upsertSpy.mock.calls[0]![0] as { id: string; offer_valid_from: string; offer_valid_to: string | null }[]
    expect(batch).toEqual([
      expect.objectContaining({ id: 'prod-1', offer_valid_from: '2026-09-30', offer_valid_to: '2026-10-07' }),
    ])
  })
})

// S-7 / S-8 (2026-09-26 review): the insert-path guarantees that were true
// but untested — every existing test passed even after these mutations.
describe('S-7 / S-8: the insert-missing path is provably safe and honest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: vi.fn(() => ({ select: mockUpsertSelectResult })),
    }))
  })

  it('S-7: inserts new products with ignoreDuplicates: true — never rewrites a concurrently-created row', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({ data: [], error: null })
    const upsertSpy = vi.fn(() => ({ select: mockUpsertSelectResult }))
    // NOT `.mockImplementationOnce` — `.from('products')` is called once for
    // the lookup and again for the insert, and `upsertSpy` must back BOTH.
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: mockSelectEqInResult })) })),
      upsert: upsertSpy,
    }))
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'new-1', source_name: 'Pouletbrust 500g', product_group: null }],
      error: null,
    })

    await resolveProducts([makeDeal({ productName: 'Pouletbrust 500g' })], 'migros')

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ ignoreDuplicates: true }),
    )
  })

  it('S-8: "Created N" logs the DB-CONFIRMED count, not the number of rows sent', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({ data: [], error: null })
    // Two new products are SENT; the database only CONFIRMS one (the other
    // was, say, a concurrently-created duplicate ignoreDuplicates skipped).
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'new-1', source_name: 'Pouletbrust 500g', product_group: null }],
      error: null,
    })

    const infos: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { infos.push(a.join(' ')) })

    await resolveProducts(
      [
        makeDeal({ productName: 'Pouletbrust 500g' }),
        makeDeal({ productName: 'Rindshackfleisch 500g' }),
      ],
      'migros',
    )
    logSpy.mockRestore()

    expect(infos.join('\n')).toMatch(/Created 1 new migros products/)
    expect(infos.join('\n')).not.toMatch(/Created 2 new migros products/)
  })
})

describe('offer-date updates report what the database accepted', () => {
  /**
   * THE DEFECT, same shape as writeEnrichment on 2026-09-11.
   *
   * The offer-date pass used to fire one `.update().eq('id', id)` per row
   * through `Promise.all` and threw the settled values away. A Supabase
   * query builder RESOLVES with `{ error }` on a PostgREST failure — it does
   * not reject — so `Promise.all` completed happily and every error was
   * discarded. The step then logged `Updated offer dates on N existing
   * products` where N was the number of rows it INTENDED to write, never the
   * number the database accepted.
   *
   * WP-1c replaces the per-row `Promise.all` with ONE grouped upsert per
   * batch (`onConflict: 'id'`) — the same idiom `store.ts` uses for deals —
   * so the round-trip count drops from O(rows) to O(batches), and the
   * confirmed count still comes from what `.select()` hands back, never from
   * what was sent.
   */
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: mockSelectEqInResult,
        })),
      })),
      upsert: vi.fn(() => ({
        select: mockUpsertSelectResult,
      })),
    }))
  })

  it('does not claim rows it never wrote when every update fails', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({
      data: [existingRow({ id: 'prod-1', source_name: 'Vollmilch 1L' })],
      error: null,
    })
    mockUpsertSelectResult.mockResolvedValueOnce({ data: null, error: { message: 'permission denied for table products' } })
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')) })
    const infos: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { infos.push(a.join(' ')) })

    await resolveProducts([makeDeal()], 'migros')

    spy.mockRestore()
    logSpy.mockRestore()

    // The failure must be visible...
    expect(errors.join('\n')).toMatch(/offer date/i)
    // ...and the success line must not claim the row it failed to write.
    expect(infos.join('\n')).not.toMatch(/Updated offer dates on 1 /)
  })

  it('groups offer-date writes into one upsert per batch, not one request per row', async () => {
    mockSelectEqInResult.mockResolvedValueOnce({
      data: [
        existingRow({ id: 'prod-1', source_name: 'A' }),
        existingRow({ id: 'prod-2', source_name: 'B' }),
        existingRow({ id: 'prod-3', source_name: 'C' }),
      ],
      error: null,
    })
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'prod-1' }, { id: 'prod-2' }, { id: 'prod-3' }],
      error: null,
    })

    const deals = [
      makeDeal({ productName: 'A' }),
      makeDeal({ productName: 'B' }),
      makeDeal({ productName: 'C' }),
    ]
    await resolveProducts(deals, 'migros')

    // Exactly one upsert call carries all three offer-date updates together.
    expect(mockUpsertSelectResult).toHaveBeenCalledTimes(1)
  })
})
