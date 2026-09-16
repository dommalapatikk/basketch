// composition.test.ts — the ONE place the real dependencies are built.
//
// Infrastructure-layer test: `composition.ts` legitimately constructs a real
// Supabase client (via `store.ts`/`product-resolve.ts`), so — same pattern as
// `store.test.ts` and `product-resolve.test.ts` — `@supabase/supabase-js` is
// mocked before anything imports it. `run-pipeline.test.ts` (application
// layer) needs no such mock; that split is the point of WP-P2's F1 fix.

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }))

import { RETAILERS } from './collection/domain/offer'
import { unwrap } from './collection/domain/result'
import type { Transport } from './collection/infrastructure/live-sources'
import { createProductionDeps } from './composition'
import { createClassification, createConfidence } from './transformation/domain/classification'

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

describe('classifier, reflector and enricher share ONE Gemini quota — backfill fired ~250 requests in 20s and got 255×429 (run 34833209176)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('paces across all three REAL adapters, wired exactly as composition.ts wires them', async () => {
    // Every model call succeeds instantly — the point is to count REQUESTS,
    // not to exercise any one adapter's parsing.
    let fetchCalls = 0
    vi.stubGlobal('fetch', async () => {
      fetchCalls++
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }), { status: 200 })
    })

    let clockMs = 0
    const sleeps: number[] = []
    const deps = createProductionDeps(
      { GOOGLE_AI_API_KEY: 'test-key' },
      {
        modelClock: {
          now: () => clockMs,
          sleep: async (ms) => {
            sleeps.push(ms)
            clockMs += ms
          },
        },
      },
    )
    const runLog: string[] = []
    const classification = await deps.createClassificationDeps((m) => runLog.push(m))
    expect(classification.reflector).not.toBeNull()
    expect(classification.enricher).not.toBeNull()

    const req = { productName: 'Emmi Milch', descriptor: null, retailer: 'denner' }
    const answer = unwrap(
      createClassification({ category: 'dairy', subCategory: 'dairy', confidence: unwrap(createConfidence(0.9)), tier: 1, model: 'test' }),
    )

    // 5 classifier calls + 1 reflector call + 8 enricher calls = 14, one over
    // checkRate's paced ceiling (floor(15 * 0.9) = 13). If the three callers
    // had their own limiter (today's bug), none of them would ever see the
    // other two, and none would pace — exactly what let a backfill fire
    // ~250 requests in 20 seconds. One shared gate must pace exactly once.
    for (let i = 0; i < 5; i++) await classification.tier1.classify([req])
    await classification.reflector?.reflect(req, answer)
    for (let i = 0; i < 8; i++) {
      await classification.enricher?.enrich([{ request: req, subCategory: `sub-${i}` }])
    }

    expect(fetchCalls).toBe(15) // 14 model calls + 1 startup probe (its own, separate gate)
    expect(sleeps).toHaveLength(1)
    expect(sleeps[0]).toBeGreaterThan(0)

    // F1 (code review): the gate's own pacing line must reach the RUN's log,
    // not the gate's silent default (`() => {}`). Before this fix a run
    // could sleep minutes honouring a Retry-After and the Categorize log
    // would show nothing between two chunk summaries.
    expect(runLog.some((m) => m.includes('waiting'))).toBe(true)
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
