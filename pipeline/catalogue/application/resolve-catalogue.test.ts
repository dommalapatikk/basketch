// Application tests for resolveCatalogueIdentity (ARCH-X §2.6, tech-lead
// cross-review §7 WP-1a). The fake `CatalogueStore` below is deliberately a
// FAKE, not a mock: `upsertConcepts`/`upsertSkus` really batch (chunks of
// 100, mirroring the real `supabase-catalogue-store.ts`) and really dedupe by
// natural key, so C-4's round-trip count reflects what a real batching
// implementation would do, not what a mock was told to return.

import { describe, it, expect, vi } from 'vitest'

import type { Deal } from '../../../shared/types'
import { err, ok } from '../../collection/domain/result'
import type { ConceptDraft, ConceptFamilyDraft } from '../domain/catalogue-plan'
import type { ResolverRule } from '../domain/concept-resolution'
import { dealKey, dealKeyToString } from '../domain/deal-key'
import { skuKeyToString } from '../domain/sku-key'
import type { CatalogueStore, SkuUpsertInput } from './resolve-catalogue'
import { resolveCatalogueIdentity } from './resolve-catalogue'

const NOW = '2026-09-25T00:00:00.000Z'
const BATCH_SIZE = 100

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

/**
 * A stateful fake that behaves like the real upsert semantics (same natural
 * key in twice → same id back, converging like `ON CONFLICT DO UPDATE`), and
 * counts every simulated HTTP round trip so C-4 and C-10 can assert on it.
 */
function makeFakeStore(rules: ResolverRule[] = []): CatalogueStore & { readonly httpCalls: number } {
  let httpCalls = 0
  const conceptIdBySlug = new Map<string, string>()
  const skuIdByKey = new Map<string, string>()
  let nextId = 1

  return {
    get httpCalls() {
      return httpCalls
    },
    async loadResolverRules() {
      httpCalls++
      return ok(rules)
    },
    async loadValidTaxonomySubcats() {
      httpCalls++
      return ok(new Set<string>())
    },
    async upsertFamilies(families: readonly ConceptFamilyDraft[]) {
      for (let i = 0; i < families.length; i += BATCH_SIZE) httpCalls++
      return ok(undefined)
    },
    async upsertConcepts(concepts: readonly ConceptDraft[]) {
      for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
        httpCalls++
        for (const c of concepts.slice(i, i + BATCH_SIZE)) {
          if (!conceptIdBySlug.has(c.slug)) conceptIdBySlug.set(c.slug, `concept-${nextId++}`)
        }
      }
      return ok(new Map(conceptIdBySlug))
    },
    async upsertSkus(skus: readonly SkuUpsertInput[]) {
      const idByKey = new Map<string, string>()
      for (let i = 0; i < skus.length; i += BATCH_SIZE) {
        httpCalls++
        for (const s of skus.slice(i, i + BATCH_SIZE)) {
          const k = skuKeyToString(s.key)
          if (!skuIdByKey.has(k)) skuIdByKey.set(k, `sku-${nextId++}`)
          idByKey.set(k, skuIdByKey.get(k)!)
        }
      }
      return ok(idByKey)
    },
  }
}

describe('C-4: round trips are O(batches), not O(deals)', () => {
  it('2,000 distinct deals resolve in at most 50 simulated round trips', async () => {
    const deals: Deal[] = Array.from({ length: 2000 }, (_, i) =>
      makeDeal({ productName: `Product ${i}`, validFrom: '2026-09-09' }),
    )
    const store = makeFakeStore()

    const links = await resolveCatalogueIdentity(deals, store, NOW)

    expect(links.skuIdByDeal.size).toBe(2000)
    expect(store.httpCalls).toBeLessThanOrEqual(50)
  })
})

describe('C-6: resolver rules unreadable → no concept or sku written, and the result says why', () => {
  it('aborts before any upsert and reports rulesUnreadable', async () => {
    const upsertFamilies = vi.fn(async () => ok(undefined))
    const upsertConcepts = vi.fn(async () => ok(new Map<string, string>()))
    const upsertSkus = vi.fn(async () => ok(new Map<string, string>()))
    const store: CatalogueStore = {
      loadResolverRules: async () => err('transient read error'),
      loadValidTaxonomySubcats: async () => ok(new Set()),
      upsertFamilies,
      upsertConcepts,
      upsertSkus,
    }

    const links = await resolveCatalogueIdentity([makeDeal()], store, NOW)

    expect(links.skipped.rulesUnreadable).toBe(true)
    expect(links.skuIdByDeal.size).toBe(0)
    expect(links.conceptsResolved).toBe(0)
    expect(links.skusUpserted).toBe(0)
    expect(upsertFamilies).not.toHaveBeenCalled()
    expect(upsertConcepts).not.toHaveBeenCalled()
    expect(upsertSkus).not.toHaveBeenCalled()
  })

  it('also aborts when the taxonomy sub-category list is unreadable (V-b)', async () => {
    const upsertConcepts = vi.fn(async () => ok(new Map<string, string>()))
    const store: CatalogueStore = {
      loadResolverRules: async () => ok([]),
      loadValidTaxonomySubcats: async () => err('transient read error'),
      upsertFamilies: async () => ok(undefined),
      upsertConcepts,
      upsertSkus: async () => ok(new Map()),
    }

    const links = await resolveCatalogueIdentity([makeDeal()], store, NOW)

    expect(links.skipped.subcatsUnreadable).toBe(true)
    expect(links.skuIdByDeal.size).toBe(0)
    expect(upsertConcepts).not.toHaveBeenCalled()
  })
})

describe('C-10: a re-run with the same deals issues only upserts and returns the same ids', () => {
  it('is idempotent across two runs', async () => {
    const deals = [makeDeal({ productName: 'Emmi Vollmilch 1L' }), makeDeal({ productName: 'Coop Naturaplan Milch', originalPrice: null })]
    const store = makeFakeStore()

    const first = await resolveCatalogueIdentity(deals, store, NOW)
    const second = await resolveCatalogueIdentity(deals, store, NOW)

    expect([...second.skuIdByDeal.entries()]).toEqual([...first.skuIdByDeal.entries()])
    expect(second.conceptsResolved).toBe(first.conceptsResolved)
  })
})

describe('V-c: a batch never nulls an existing regular_price', () => {
  it('a deal with no printed price sends no regularPrice key to the store', async () => {
    let observedInputs: readonly SkuUpsertInput[] = []
    const store: CatalogueStore = {
      loadResolverRules: async () => ok([]),
      loadValidTaxonomySubcats: async () => ok(new Set()),
      upsertFamilies: async () => ok(undefined),
      upsertConcepts: async (concepts) => ok(new Map(concepts.map((c) => [c.slug, `concept-${c.slug}`]))),
      upsertSkus: async (skus) => {
        observedInputs = skus
        return ok(new Map(skus.map((s) => [skuKeyToString(s.key), `sku-${s.key.sourceProductId}`])))
      },
    }

    await resolveCatalogueIdentity([makeDeal({ originalPrice: null })], store, NOW)

    expect(observedInputs).toHaveLength(1)
    expect('regularPrice' in observedInputs[0]!).toBe(false)
  })
})

describe('links deals by DealKey', () => {
  it('the result is addressable by dealKeyToString', async () => {
    const deal = makeDeal({ store: 'coop', productName: 'Emmi Vollmilch 1L', validFrom: '2026-09-09' })
    const store = makeFakeStore()

    const links = await resolveCatalogueIdentity([deal], store, NOW)

    const key = dealKeyToString(dealKey('coop', 'Emmi Vollmilch 1L', '2026-09-09'))
    expect(links.skuIdByDeal.has(key)).toBe(true)
  })
})
