// Regression tests for the v3 cutover step, named after the defect they prevent.
//
// THE DEFECT (same shape as the 2026-09-11 writeEnrichment loss):
// `storeDeals` normalises `product_name` before the upsert, so the `deals` table
// holds "emmi vollmilch 1l". `backfillRecentDealsSkuId` looked the row up with
// the RAW offer name ("Emmi Vollmilch 1L") and matched nothing — and PostgREST
// reports no error for a SELECT that returns no rows, so the step logged
// `linked:0` and looked like a run with nothing to do.
//
// The fake below is deliberately a FAKE, not a mock: its `.in()` really filters
// against stored rows. A mock that resolved `{ data: [...], error: null }`
// unconditionally would pass whether or not the lookup key was correct — which
// is precisely how this class of defect keeps reaching production.

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'

type DealRow = {
  id: string
  store: string
  product_name: string
  valid_from: string
  is_active: boolean
  sku_id: string | null
}

/** Rows as `storeDeals` would have written them — product_name NORMALISED. */
const dealsTable: DealRow[] = []

function makeFake() {
  const rpcCalls: string[] = []

  function dealsBuilder() {
    const filters: { col: string; values: string[] }[] = []
    let mode: 'select' | 'update' = 'select'
    let patch: Partial<DealRow> = {}
    let idFilter: string | null = null

    const run = () => {
      if (mode === 'update') {
        // PostgREST returns the AFFECTED rows when .select() is chained, and an
        // empty array when the filter matched nothing. Modelling that is the
        // whole point: it is what makes a zero-row update visible.
        const target = dealsTable.find((r) => r.id === idFilter)
        if (!target) return { data: [], error: null }
        Object.assign(target, patch)
        return { data: [{ id: target.id }], error: null }
      }
      const rows = dealsTable.filter((r) =>
        filters.every((f) => f.values.includes(String(r[f.col as keyof DealRow]))),
      )
      return { data: rows.map((r) => ({ ...r })), error: null }
    }

    const builder = {
      select() { return builder },
      in(col: string, values: string[]) { filters.push({ col, values }); return builder },
      eq(col: string, value: unknown) {
        if (mode === 'update' && col === 'id') idFilter = String(value)
        else filters.push({ col, values: [String(value)] })
        return builder
      },
      update(p: Partial<DealRow>) { mode = 'update'; patch = p; return builder },
      then(resolve: (v: unknown) => unknown) { return Promise.resolve(run()).then(resolve) },
    }
    return builder
  }

  const from = vi.fn((table: string) => {
    if (table === 'deals') return dealsBuilder()

    if (table === 'concept_resolver') {
      const b = {
        select() { return b },
        eq() { return b },
        order() { return Promise.resolve({ data: [], error: null }) },
      }
      return b
    }
    if (table === 'taxonomy_subcategory') {
      return { select: () => Promise.resolve({ data: [], error: null }) }
    }
    if (table === 'concept_family') {
      return { upsert: () => Promise.resolve({ error: null }) }
    }
    if (table === 'concept') {
      return {
        upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'concept-1' }, error: null }) }) }),
      }
    }
    if (table === 'sku') {
      return {
        upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'sku-1' }, error: null }) }) }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { from, rpc: vi.fn((_fn: string, args: { view_name: string }) => { rpcCalls.push(args.view_name); return Promise.resolve({ error: null }) }), rpcCalls }
}

const fake = makeFake()
vi.mock('./supabase-client', () => ({ supabase: { from: (t: string) => fake.from(t), rpc: (f: string, a: never) => fake.rpc(f, a) } }))

const { populateV3Layer } = await import('./v3-cutover')

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    store: 'coop',
    productName: 'Emmi Vollmilch 1L',
    originalPrice: 2.5,
    salePrice: 1.95,
    discountPercent: 22,
    validFrom: '2026-09-09',
    validTo: '2026-09-16',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    category: 'dairy-eggs',
    subCategory: 'milch',
    taxonomyConfidence: 0.9,
    ...overrides,
  } as Deal
}

describe('v3 cutover links deals it actually stored', () => {
  beforeEach(() => {
    dealsTable.length = 0
    vi.clearAllMocks()
  })

  it('sets sku_id on the row storeDeals wrote, which is keyed on the NORMALISED name', async () => {
    // The row as it exists in the database: product_name lowercased by storeDeals.
    dealsTable.push({
      id: 'deal-1',
      store: 'coop',
      product_name: 'emmi vollmilch 1l',
      valid_from: '2026-09-09',
      is_active: true,
      sku_id: null,
    })

    // The deal object still carries the RAW name, exactly as run.ts passes it.
    const stats = await populateV3Layer([makeDeal()])

    expect(stats.deals_linked).toBe(1)
    expect(dealsTable[0]!.sku_id).toBe('sku-1')
  })

  it('reports zero linked when the row genuinely is not there, rather than claiming success', async () => {
    const stats = await populateV3Layer([makeDeal()])
    expect(stats.deals_linked).toBe(0)
  })
})
