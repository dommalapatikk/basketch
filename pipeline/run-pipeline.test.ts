// run-pipeline.test.ts — the test seam `run.ts` never had.
//
// HANDOVER.md §4: every recurring defect in this codebase is "a correct unit
// that nothing wires up." That happened because `main()` in run.ts was a
// 700-line unexported function — nothing could build it with a fake source, a
// fake cache or a fake judge and watch what came out. These tests go through
// `runPipeline`, the composition root (`createProductionDeps`), or both —
// never only a hand-built fake in isolation — because the production wiring
// is exactly what went untested.

import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

// composition.ts pulls in product-resolve.ts and store.ts, both of which
// create a real Supabase client AT MODULE LOAD TIME. None of these tests
// talk to Supabase — every test either injects a fake `StorageDeps` or only
// exercises the collection wiring — so the client itself is mocked away
// before anything imports it, the same pattern store.test.ts uses.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }))

import { RETAILERS, createOffer } from './collection/domain/offer'
import { createMoney } from './collection/domain/money'
import { collected } from './collection/domain/offer-source'
import type { OfferSource } from './collection/domain/offer-source'
import { ok, unwrap } from './collection/domain/result'
import { createValidityPeriod } from './collection/domain/validity-period'
import type { Transport } from './collection/infrastructure/live-sources'
import { createInMemoryCache } from './transformation/domain/classification-cache'
import { createClassification, createConfidence } from './transformation/domain/classification'
import type { ClassificationOutcome, Classifier } from './transformation/domain/classifier'
import { createProductionDeps } from './composition'
import type { ClassificationDeps, PipelineDeps, StorageDeps } from './run-pipeline'
import { runPipeline } from './run-pipeline'
import type { Deal } from '../shared/types'

const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

const classification = (category: string, subCategory: string) =>
  unwrap(createClassification({ category, subCategory, confidence: unwrap(createConfidence(0.95)), tier: 1, model: 'test' }))

/** Always answers the same category — deterministic, no network, no cache dependence. */
const classifierAnswering = (category: string, subCategory: string): Classifier => ({
  name: 'test-classifier',
  tier: 1,
  batchSize: 25,
  async classify(batch) {
    return ok(batch.map((request): ClassificationOutcome => ({ ok: true, request, classification: classification(category, subCategory) })))
  },
})

/** Records every call, in order, and every deal `storeDeals` actually received. */
function fakeStorage(): StorageDeps & { readonly calls: string[]; readonly storedDeals: Deal[] } {
  const calls: string[] = []
  const storedDeals: Deal[] = []

  return {
    calls,
    storedDeals,
    async loadAliases() {
      calls.push('loadAliases')
      return new Map()
    },
    async reportUnknownTags() {
      calls.push('reportUnknownTags')
    },
    async resolveProducts(deals, store) {
      calls.push('resolveProducts')
      const out = new Map<string, { productId: string }>()
      for (const deal of deals) out.set(deal.productName, { productId: `${store}:${deal.productName}` })
      return out
    },
    async activeCountsByWindow() {
      calls.push('activeCountsByWindow')
      return { ok: true, counts: new Map() }
    },
    async storeDeals(deals) {
      calls.push('storeDeals')
      storedDeals.push(...deals)
      const byStore = new Map<string, number>()
      const writtenByWindow = new Map<string, Map<string, number>>()
      for (const deal of deals) {
        byStore.set(deal.store, (byStore.get(deal.store) ?? 0) + 1)
        const forStore = writtenByWindow.get(deal.store) ?? new Map<string, number>()
        forStore.set(deal.validFrom, (forStore.get(deal.validFrom) ?? 0) + 1)
        writtenByWindow.set(deal.store, forStore)
      }
      return { attempted: deals.length, total: deals.length, byStore, writtenByWindow }
    },
    async writeEnrichment(items) {
      calls.push('writeEnrichment')
      return items.length
    },
    async populateV3Layer() {
      calls.push('populateV3Layer')
      return { concepts_resolved: 0, skus_upserted: 0, deals_linked: 0 }
    },
    async deactivateStaleForStores() {
      calls.push('deactivateStaleForStores')
      return 0
    },
    async deactivateExpiredDeals() {
      calls.push('deactivateExpiredDeals')
      return 0
    },
    async logPipelineRun() {
      calls.push('logPipelineRun')
    },
  }
}

function fakeClassificationDeps(): ClassificationDeps {
  return {
    cache: createInMemoryCache(),
    tier1: classifierAnswering('dairy', 'dairy'),
    judge: null,
    reflector: null,
    enricher: null,
  }
}

type FakeDeps = PipelineDeps & { readonly storage: ReturnType<typeof fakeStorage> }

function fakeDeps(overrides: Partial<Omit<PipelineDeps, 'storage'>> = {}): FakeDeps {
  return {
    sources: () => [],
    createClassificationDeps: async () => fakeClassificationDeps(),
    revalidate: async () => {},
    ...overrides,
    storage: fakeStorage(),
  }
}

const dennerOfferSource = (productName: string): OfferSource => ({
  retailer: 'denner',
  expectedMinimumOffers: 1,
  async fetchOffers() {
    return collected('denner', [
      unwrap(
        createOffer({
          retailer: 'denner',
          productName,
          salePrice: unwrap(createMoney(1.5)),
          originalPrice: unwrap(createMoney(2)),
          validity: WEEK,
        }),
      ),
    ])
  },
})

const baseOptions = {
  cwd: tmpdir(), // no *-deals.json files here — the legacy path collects nothing
  now: new Date('2026-09-08T00:00:00Z'),
  runId: 'test-run',
  collectionMode: 'live' as const,
}

describe('a full run through the composition root stores what the fake sources returned — run.ts had zero tests', () => {
  it('writes the deal the fake source produced, through classification, taxonomy and storage', async () => {
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')] })

    const outcome = await runPipeline(deps, baseOptions)

    expect(outcome.status).toBe('ok')
    expect(deps.storage.storedDeals).toHaveLength(1)
    expect(deps.storage.storedDeals[0]?.store).toBe('denner')
    expect(deps.storage.storedDeals[0]?.productName).toBe('bio vollmilch 1l')
    expect(deps.storage.storedDeals[0]?.subCategory).toBe('dairy')
  })

  it('never touches storage when every source collects nothing — no data is a stop, not an empty write', async () => {
    const deps = fakeDeps({ sources: () => [] })

    const outcome = await runPipeline(deps, baseOptions)

    expect(outcome.status).toBe('no-data')
    expect(deps.storage.calls).toEqual([])
  })
})

describe('the root wires classifier, reflector, judge and enricher from env — nothing built inline', () => {
  it('builds no escalation path with no API keys, and makes no network call to decide that', async () => {
    const deps = createProductionDeps({})
    const classification = await deps.createClassificationDeps(() => {})

    expect(classification.tier1).toBeTruthy()
    expect(classification.cache).toBeTruthy()
    expect(classification.judge).toBeNull()
    expect(classification.reflector).toBeNull()
    expect(classification.enricher).toBeNull()
  })

  it('wires the OpenRouter judge from OPENROUTER_API_KEY alone — reflector and enricher still need the Google key', async () => {
    const deps = createProductionDeps({ OPENROUTER_API_KEY: 'test-key' })
    const classification = await deps.createClassificationDeps(() => {})

    expect(classification.judge).not.toBeNull()
    expect(classification.reflector).toBeNull()
    expect(classification.enricher).toBeNull()
  })
})

describe('live counts are read BEFORE storeDeals — a post-write count makes the sweep guard permissive', () => {
  it('calls activeCountsByWindow before storeDeals, every run', async () => {
    const deps = fakeDeps({ sources: () => [dennerOfferSource('Bio Vollmilch 1l')] })

    await runPipeline(deps, baseOptions)

    const countsIndex = deps.storage.calls.indexOf('activeCountsByWindow')
    const storeIndex = deps.storage.calls.indexOf('storeDeals')
    expect(countsIndex).toBeGreaterThanOrEqual(0)
    expect(storeIndex).toBeGreaterThan(countsIndex)
  })
})

describe('createProductionDeps wires the REAL adapters — the production wiring is what goes untested', () => {
  it('builds one real OfferSource per retailer, against a fake transport, not a hand-built fake', () => {
    const deps = createProductionDeps({}, { transport: stubTransport() })

    const sources = deps.sources({ kw: 37, year: 2026 })

    expect(sources).toHaveLength(RETAILERS.length)
    expect(sources.map((s) => s.retailer).sort()).toEqual([...RETAILERS].sort())
  })

  it('the real Spar adapter builds the requested week into the URL it asks the fake transport for', async () => {
    const { transport, urls } = recordingTransport()
    const deps = createProductionDeps({}, { transport })

    const sources = deps.sources({ kw: 37, year: 2026 })
    await sources.find((s) => s.retailer === 'spar')?.fetchOffers('2026-W37')

    expect(urls.some((u) => u.includes('kw37-2026'))).toBe(true)
  })
})

// ── A minimal Transport double: enough to build every source, none of it
// pretends to be a working network. Matches live-sources.test.ts's own shape
// so a "real wiring" test is asking the same question that file asks — just
// through composition.ts instead of calling createLiveSources directly.
function stubTransport(): Transport {
  return recordingTransport().transport
}

function recordingTransport(): { transport: Transport; urls: string[] } {
  const urls: string[] = []
  const transport: Transport = {
    fetchJson: async (u) => {
      urls.push(u)
      return {}
    },
    fetchPdfPages: async (u) => {
      urls.push(u)
      return { ok: false, reason: 'stub' }
    },
    fetchPdfText: async (u) => {
      urls.push(u)
      return { ok: false, reason: 'stub' }
    },
    fetchFlyerImages: async (u) => {
      urls.push(u)
      return { ok: false, reason: 'stub' }
    },
    ocr: async () => ({ pages: [], errors: [] }),
    dennerFetchPage: async (_id, page) => {
      urls.push(`denner:page${page}`)
      return {}
    },
    coopFetchPage: async (page) => {
      urls.push(`coop:page${page}`)
      return ''
    },
    volgFetchPage: async () => {
      urls.push('volg')
      return ''
    },
  }
  return { transport, urls }
}
