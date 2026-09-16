// composition.test.ts — the ONE place the real dependencies are built.
//
// Infrastructure-layer test: `composition.ts` legitimately constructs a real
// Supabase client (via `store.ts`/`product-resolve.ts`), so — same pattern as
// `store.test.ts` and `product-resolve.test.ts` — `@supabase/supabase-js` is
// mocked before anything imports it. `run-pipeline.test.ts` (application
// layer) needs no such mock; that split is the point of WP-P2's F1 fix.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }))

import { RETAILERS } from './collection/domain/offer'
import type { Transport } from './collection/infrastructure/live-sources'
import { createProductionDeps } from './composition'

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
