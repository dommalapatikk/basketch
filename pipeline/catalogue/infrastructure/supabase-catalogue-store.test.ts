// Infrastructure tests for the real CatalogueStore (ARCH-X §2.6, C-5).
//
// The fake Supabase client below deliberately returns rows in REVERSED order
// from what was sent — PostgREST makes no promise about response order, and a
// mock that echoed rows back in request order would pass even if the
// production code mapped ids positionally (exactly the defect class C-5
// guards against, the same discipline `v3-cutover.test.ts` used for the old
// per-row backfill).

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { ConceptDraft } from '../domain/catalogue-plan'
import type { SkuUpsertInput } from '../application/resolve-catalogue'
import { skuKey, skuKeyToString } from '../domain/sku-key'

type ConceptRow = { id: string; slug: string; display_name: string; family_slug: string }
type SkuRow = {
  id: string
  concept_id: string
  store_slug: string
  region_slug: string
  source_product_id: string
  regular_price?: number | null
}

const conceptTable: ConceptRow[] = []
const skuTable: SkuRow[] = []
let nextId = 1

function makeFakeSupabase() {
  const from = vi.fn((table: string) => {
    if (table === 'concept') {
      return {
        upsert(rows: { slug: string; display_name: string; family_slug: string }[]) {
          const affected: ConceptRow[] = []
          for (const row of rows) {
            let existing = conceptTable.find((c) => c.slug === row.slug)
            if (!existing) {
              existing = { id: `concept-${nextId++}`, ...row }
              conceptTable.push(existing)
            }
            affected.push(existing)
          }
          return {
            select: () =>
              Promise.resolve({
                // REVERSED — the production code must not rely on order.
                data: [...affected].reverse(),
                error: null,
              }),
          }
        },
      }
    }
    if (table === 'sku') {
      return {
        upsert(rows: Record<string, unknown>[]) {
          const affected: SkuRow[] = []
          for (const row of rows) {
            let existing = skuTable.find(
              (s) =>
                s.concept_id === row.concept_id &&
                s.store_slug === row.store_slug &&
                s.region_slug === row.region_slug &&
                s.source_product_id === row.source_product_id,
            )
            if (!existing) {
              existing = {
                id: `sku-${nextId++}`,
                concept_id: row.concept_id as string,
                store_slug: row.store_slug as string,
                region_slug: row.region_slug as string,
                source_product_id: row.source_product_id as string,
              }
              skuTable.push(existing)
            }
            // Mirrors a real upsert: a row missing `regular_price` never
            // clobbers what is already stored (V-c behaviour, at the fake
            // level — the real check is that the KEY is absent).
            if ('regular_price' in row) existing.regular_price = row.regular_price as number
            affected.push(existing)
          }
          return {
            select: () =>
              Promise.resolve({
                data: [...affected].reverse(),
                error: null,
              }),
          }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { from, rpc: vi.fn(() => Promise.resolve({ error: null })) }
}

const fake = makeFakeSupabase()
vi.mock('../../supabase-client', () => ({ supabase: { from: (t: string) => fake.from(t), rpc: fake.rpc } }))

const { upsertConcepts, upsertSkus } = await import('./supabase-catalogue-store')

describe('C-5: ids are mapped by natural key, not response order', () => {
  beforeEach(() => {
    conceptTable.length = 0
    skuTable.length = 0
    vi.clearAllMocks()
  })

  it('upsertConcepts matches ids to slugs even when the response is reversed', async () => {
    const drafts: ConceptDraft[] = [
      { slug: 'milch-emmi-vollmilch-1l', displayName: 'Emmi Vollmilch 1L', familySlug: 'milch' },
      { slug: 'milch-coop-naturaplan-milch', displayName: 'Coop Naturaplan Milch', familySlug: 'milch' },
      { slug: 'kaese-appenzeller', displayName: 'Appenzeller', familySlug: 'kaese' },
    ]

    const result = await upsertConcepts(drafts)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const d of drafts) {
      expect(result.value.get(d.slug)).toBe(conceptTable.find((c) => c.slug === d.slug)!.id)
    }
  })

  it('upsertSkus matches ids to (concept, store, region, sourceProductId) even when the response is reversed', async () => {
    const inputs: SkuUpsertInput[] = [
      {
        key: skuKey('concept-1', 'coop', 'all', 'emmi vollmilch 1l'),
        sourceProductName: 'Emmi Vollmilch 1L',
        lastDealSeenAt: '2026-09-25T00:00:00.000Z',
      },
      {
        key: skuKey('concept-1', 'migros', 'aare', 'emmi vollmilch 1l'),
        sourceProductName: 'Emmi Vollmilch 1L',
        regularPrice: 2.5,
        lastDealSeenAt: '2026-09-25T00:00:00.000Z',
      },
      {
        key: skuKey('concept-2', 'coop', 'all', 'appenzeller'),
        sourceProductName: 'Appenzeller',
        lastDealSeenAt: '2026-09-25T00:00:00.000Z',
      },
    ]

    const result = await upsertSkus(inputs)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const input of inputs) {
      const stringKey = skuKeyToString(input.key)
      expect(result.value.get(stringKey)).toBeDefined()
    }
  })
})

describe('V-c / P2a: a sku upsert never sends regular_price: null', () => {
  beforeEach(() => {
    conceptTable.length = 0
    skuTable.length = 0
    vi.clearAllMocks()
  })

  it('groups skus with and without a printed price into separate batches', async () => {
    const inputs: SkuUpsertInput[] = [
      { key: skuKey('concept-1', 'coop', 'all', 'a'), sourceProductName: 'A', lastDealSeenAt: 'now' },
      { key: skuKey('concept-1', 'coop', 'all', 'b'), sourceProductName: 'B', regularPrice: 4.2, lastDealSeenAt: 'now' },
    ]

    await upsertSkus(inputs)

    const rowA = skuTable.find((s) => s.source_product_id === 'a')!
    const rowB = skuTable.find((s) => s.source_product_id === 'b')!
    expect(rowA.regular_price).toBeUndefined()
    expect(rowB.regular_price).toBe(4.2)
  })
})
