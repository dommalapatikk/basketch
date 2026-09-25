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
// the same shape `supabase-classification-cache.ts` already uses — so the
// lookup never depends on how many rows the table holds.

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'

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
    mockSelectEqInResult.mockResolvedValueOnce({
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
    for (const call of mockSelectEqInResult.mock.calls) {
      expect((call[1] as string[]).length).toBeLessThanOrEqual(200)
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
    // The insert-missing path (`ignoreDuplicates: true`) must never fire for
    // a product the key-set lookup already found — that is the "re-sent as
    // new" defect this test is named after.
    expect(upsertSpy).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ source_name: targetName })]),
      expect.objectContaining({ ignoreDuplicates: true }),
    )
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
