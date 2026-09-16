// run-pipeline.test.ts — the test seam `run.ts` never had.
//
// HANDOVER.md §4: every recurring defect in this codebase is "a correct unit
// that nothing wires up." That happened because `main()` in run.ts was a
// 700-line unexported function — nothing could build it with a fake source, a
// fake cache or a fake judge and watch what came out. These tests go through
// `runPipeline` (or `finishRun` directly for the exit-mapping baseline),
// never only a hand-built fake in isolation.
//
// NO SUPABASE MOCK: this file imports only `run-pipeline.ts` (application
// layer) and hand-built fakes. Code review of WP-P2 (F1) found that
// `run-pipeline.ts` transitively constructed a real Supabase client at import
// time via `./store` — proved by this file needing `vi.mock('@supabase/supabase-js')`
// just to load. That import is now `../shared/types` (normalizeProductName)
// and `storage/domain/product-key.ts` (productLookupKey), both pure. The
// composition-root tests that legitimately DO need Supabase construction
// (because that is composition.ts's whole job) live in composition.test.ts,
// with the mock — the same pattern store.test.ts already uses for
// infrastructure-layer tests.

import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { createOffer } from './collection/domain/offer'
import { createMoney } from './collection/domain/money'
import { collected } from './collection/domain/offer-source'
import type { OfferSource } from './collection/domain/offer-source'
import { ok, unwrap } from './collection/domain/result'
import { createValidityPeriod } from './collection/domain/validity-period'
import { createInMemoryCache } from './transformation/domain/classification-cache'
import { createClassification, createConfidence } from './transformation/domain/classification'
import type { ClassificationOutcome, Classifier } from './transformation/domain/classifier'
import type { ClassificationDeps, PipelineDeps, StorageDeps } from './run-pipeline'
import { finishRun, runPipeline } from './run-pipeline'
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

/** Records every call, in order, and every deal `storeDeals` actually received. `overrides` replaces individual methods for one test's scenario (e.g. a storage shortfall). */
function fakeStorage(overrides: Partial<StorageDeps> = {}): StorageDeps & { readonly calls: string[]; readonly storedDeals: Deal[] } {
  const calls: string[] = []
  const storedDeals: Deal[] = []

  const defaults: StorageDeps = {
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

  return { calls, storedDeals, ...defaults, ...overrides }
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

function fakeDeps(overrides: Partial<Omit<PipelineDeps, 'storage'>> = {}, storage = fakeStorage()): FakeDeps {
  return {
    sources: () => [],
    createClassificationDeps: async () => fakeClassificationDeps(),
    revalidate: async () => {},
    ...overrides,
    storage,
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

// ── F3: lock today's PipelineOutcome contract before WP-P3 rewrites the exit
// mapping. `run.ts` itself has no test — it unconditionally calls `shell()`
// as a module-load side effect, so importing it would run the pipeline for
// real. Testing `finishRun` (the function that DECIDES the outcome) and
// `runPipeline`'s 'no-data'/'ok' paths above covers the same contract without
// restructuring the shell.
describe('the PipelineOutcome contract every exit-code mapping depends on', () => {
  it('produces "ok" and calls revalidate — the only status a non-zero exit is not mapped from', async () => {
    const deps = fakeDeps()
    const outcome = await finishRun(deps, { runId: 'r', stats: statsOf(10), resolvedLength: 10, storedCount: 10, durationMs: 1 })

    expect(outcome).toEqual({ status: 'ok', storedCount: 10 })
  })

  it('produces "storage-shortfall" when stored deals fall below 80% of resolved, and does NOT call revalidate', async () => {
    const revalidate = spy()
    const deps = fakeDeps({ revalidate: revalidate.fn })

    const outcome = await finishRun(deps, { runId: 'r', stats: statsOf(10), resolvedLength: 10, storedCount: 1, durationMs: 1 })

    expect(outcome).toEqual({ status: 'storage-shortfall' })
    expect(revalidate.calls).toBe(0)
  })

  it('produces "alert-failed" when a critical alert fires, and does NOT call revalidate', async () => {
    const revalidate = spy()
    const deps = fakeDeps({ revalidate: revalidate.fn })
    // A stale-run clock: `finishedAtMs` reads first (T), `nowMs` reads second
    // (T + 9 days) — past STALE_RUN_MS (8 days), the only alert this function
    // can currently reach (every other field it keys on is hardcoded null —
    // see the comment on `evaluateAlertsStep`).
    const staleClock = statefulClock([1_000, 1_000 + 9 * 24 * 60 * 60 * 1000])

    const outcome = await finishRun(deps, { runId: 'r', stats: statsOf(10), resolvedLength: 10, storedCount: 10, durationMs: 1, now: staleClock })

    expect(outcome).toEqual({ status: 'alert-failed' })
    expect(revalidate.calls).toBe(0)
  })
})

/** A minimal `ClassifyDealsResult['stats']` shape — only `total`/`cacheHits` are read by the alert snapshot. */
function statsOf(total: number): Parameters<typeof finishRun>[1]['stats'] {
  return {
    total,
    cacheHits: 0,
    classified: total,
    uncertain: 0,
    rejected: 0,
    blocked: 0,
    heldBack: 0,
    judgeUnavailable: 0,
    deferred: 0,
    isColdStart: false,
  }
}

/** Returns each value in `values` once, in order, then repeats the last — enough to simulate time passing between two back-to-back `now()` reads. */
function statefulClock(values: readonly number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]!
}

function spy(): { fn: () => Promise<void>; calls: number } {
  const state = { calls: 0 }
  return { fn: async () => { state.calls += 1 }, get calls() { return state.calls } }
}
