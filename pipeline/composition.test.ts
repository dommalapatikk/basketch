// composition.test.ts — the ONE place the real dependencies are built.
//
// Infrastructure-layer test: `composition.ts` legitimately constructs a real
// Supabase client (via `store.ts`/`product-resolve.ts`), so — same pattern as
// `store.test.ts` and `product-resolve.test.ts` — `@supabase/supabase-js` is
// mocked before anything imports it. `run-pipeline.test.ts` (application
// layer) needs no such mock; that split is the point of WP-P2's F1 fix.

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UsdMicros } from './transformation/domain/spend'
import type { SpendAccountReading } from './transformation/infrastructure/openrouter-spend-account'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }))

import { RETAILERS } from './collection/domain/offer'
import { ok, unwrap } from './collection/domain/result'
import type { Transport } from './collection/infrastructure/live-sources'
import { createProductionDeps } from './composition'
import { buildClassifyGraph } from './transformation/application/classify-graph'
import { createClassification, createConfidence } from './transformation/domain/classification'
import type { ClassificationOutcome, ClassificationRequest, Classifier } from './transformation/domain/classifier'
import { FREE_TIER_BUDGET, ZERO_SPEND } from './transformation/domain/guardrails'

describe('the root wires classifier, reflector, judge and enricher from env — nothing built inline', () => {
  it('builds no escalation path with no API keys, and makes no network call to decide that', async () => {
    const deps = createProductionDeps({})
    const classification = await deps.createClassificationDeps(() => {})

    expect(classification.tier1).toBeTruthy()
    expect(classification.cache).toBeTruthy()
    expect(classification.judge).toBeNull()
    expect(classification.reflector).toBeNull()
    expect(classification.enricher).toBeNull()
    // WP-P7: nothing paid was ever possible (no key at all) — guarded by
    // construction, and nothing was ever reserved to report.
    expect(classification.judgeSpend.guarded).toBe(true)
    expect(classification.judgeSpend.spendSnapshot()).toBeNull()
  })

  // WP-P8 (AP-10) changed this rule: an OPENROUTER_API_KEY is no longer
  // enough on its own. The key must also have a provider-side credit limit we
  // can read, because the ledger derives what it may spend from what actually
  // remains. Money fails closed; classification carries on without the judge.
  const account = (reading: SpendAccountReading) => ({ remaining: async () => reading })

  it('wires the OpenRouter judge when the key has a readable credit limit — reflector and enricher still need the Google key', async () => {
    // WP-P7 code review, F3: remainingMicros and limitMicros are DIFFERENT
    // here on purpose (a partially-spent month) — a fixture where they
    // happen to be equal cannot tell "carries the real limit" apart from
    // "carries remaining twice".
    const deps = createProductionDeps(
      { OPENROUTER_API_KEY: 'test-key' },
      { spendAccount: account({ kind: 'capped', remainingMicros: 3_000_000 as UsdMicros, limitMicros: 5_000_000 as UsdMicros }) },
    )
    const classification = await deps.createClassificationDeps(() => {})

    expect(classification.judge).not.toBeNull()
    expect(classification.reflector).toBeNull()
    expect(classification.enricher).toBeNull()
    // WP-P7: a confirmed provider-side cap is a GUARDED account, and nothing
    // has been spent yet at the point classification deps are built.
    expect(classification.judgeSpend.guarded).toBe(true)
    // WP-P7 code review, F3: carries both remainingMicros (what the GATE
    // refuses reservations against) and limitMicros (the whole monthly
    // allowance spendNearCeiling is calibrated against) — not just one.
    expect(classification.judgeSpend.spendSnapshot()).toEqual({ spentMicros: 0, remainingMicros: 3_000_000, limitMicros: 5_000_000 })
  })

  it('runs WITHOUT the judge when the key has no credit limit — AP-10, money fails closed', async () => {
    const deps = createProductionDeps(
      { OPENROUTER_API_KEY: 'test-key' },
      { spendAccount: account({ kind: 'uncapped' }) },
    )
    const classification = await deps.createClassificationDeps(() => {})

    expect(classification.judge).toBeNull()
    // WP-P7 (RCA item 2 review): `guarded` was computed here and never read
    // again — this is the exact value `alerts.ts`'s `spend-unguarded` rule
    // needs, and it had no producer until this WP wired it into judgeSpend.
    expect(classification.judgeSpend.guarded).toBe(false)
  })

  it('runs WITHOUT the judge when the spend account cannot be read — never guesses what is left', async () => {
    const deps = createProductionDeps(
      { OPENROUTER_API_KEY: 'test-key' },
      { spendAccount: account({ kind: 'unreadable', reason: 'HTTP 500' }) },
    )
    const classification = await deps.createClassificationDeps(() => {})

    expect(classification.judge).toBeNull()
    expect(classification.judgeSpend.guarded).toBe(false)
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

/**
 * WP-P6: bounded judge concurrency, wired exactly as composition.ts wires
 * it — the REAL `createOpenRouterJudge` behind the REAL `createModelGate`,
 * not a hand-built fake `Judge`. Judged sequentially at ~10.3s each, a
 * 100-product miss set took ~1,000s (`docs/rca/2026-09-15-tech-lead-items-6-9.md`
 * §9.1). This test uses a small product count (16, below the gate's paced
 * 18 req/min ceiling) so it measures the IN-FLIGHT bound alone, not the
 * rate limiter — at production scale (100 products, `maxInFlight: 4` on
 * `model-registry.ts`'s `JUDGE_CHAIN[0]`) the paced ceiling binds first, so
 * the real-world win is ~3x (~330s), not 4x — see that spec's own comment
 * for the corrected arithmetic.
 */
describe('judges at most 4 at once through the gate — 100 sequential judgements took ~1,000s', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('bounds concurrent OpenRouter calls to maxInFlight and finishes in a fraction of sequential time', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const CALL_DELAY_MS = 25

    vi.stubGlobal('fetch', async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((resolve) => setTimeout(resolve, CALL_DELAY_MS))
      concurrent--
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }), { status: 200 })
    })

    // 16 disputed products — below the paced per-minute ceiling
    // (floor(20 * 0.9) = 18), so the gate's RATE limiter never intervenes
    // and this test measures the IN-FLIGHT bound alone, not a mix of two
    // mechanisms.
    const PRODUCT_COUNT = 16
    // WP-P8 (AP-10): a judge is only built when the key's remaining monthly
    // allowance can actually be read, so this test has to say what it is —
    // without it the judge is (correctly) refused and there is no concurrency
    // left to measure. Generous, because the subject here is the in-flight
    // bound, not the ledger.
    const deps = createProductionDeps(
      { OPENROUTER_API_KEY: 'test-key' },
      {
        spendAccount: {
          remaining: async () => ({
            kind: 'capped' as const,
            remainingMicros: 5_000_000 as UsdMicros,
            limitMicros: 5_000_000 as UsdMicros,
          }),
        },
      },
    )
    const classification = await deps.createClassificationDeps(() => {})
    expect(classification.judge).not.toBeNull()

    const tier1: Classifier = {
      name: 'fake-tier1',
      tier: 1,
      batchSize: PRODUCT_COUNT,
      async classify(batch) {
        return ok(
          batch.map(
            (request): ClassificationOutcome => ({
              ok: true,
              request,
              classification: unwrap(
                createClassification({ category: 'dairy', subCategory: 'dairy', confidence: unwrap(createConfidence(0.9)), tier: 1, model: 'fake' }),
              ),
            }),
          ),
        )
      },
    }

    const graph = buildClassifyGraph({ tier1, judge: classification.judge, reflector: null, budget: FREE_TIER_BUDGET })
    const names = Array.from({ length: PRODUCT_COUNT }, (_, i) => `Product ${i}`)
    const pending: ClassificationRequest[] = names.map((productName) => ({ productName, descriptor: null, retailer: 'denner' }))

    const startedAt = Date.now()
    const final = (await graph.invoke({ pending, outcomes: [], disputed: [], budget: ZERO_SPEND, halted: null })) as {
      outcomes: { status: string }[]
    }
    const elapsedMs = Date.now() - startedAt

    expect(final.outcomes).toHaveLength(PRODUCT_COUNT)
    expect(maxConcurrent).toBeLessThanOrEqual(4)
    // Genuinely concurrent, not sequential — sequential would never exceed 1.
    expect(maxConcurrent).toBeGreaterThan(1)
    // 16 calls sequentially would take >= 16 * 25ms = 400ms. Bounded to 4 in
    // flight, 4 waves of ~25ms each is ~100ms. A generous ceiling keeps this
    // from flaking on a loaded CI runner while still catching a regression
    // to sequential (which would take 4x as long).
    expect(elapsedMs).toBeLessThan(300)

    // WP-P7: `judgeSpend.spendSnapshot()` reads the SAME gate the judge
    // itself just called through — every one of the 16 calls above spent
    // something (the fake response carries no `usage`, so each settles at
    // its own worst case, never at 0), so this must be strictly positive,
    // not a disconnected second reading of zero.
    const spend = classification.judgeSpend.spendSnapshot()
    expect(spend).not.toBeNull()
    expect(spend!.spentMicros).toBeGreaterThan(0)
    expect(spend!.spentMicros).toBeLessThanOrEqual(spend!.remainingMicros)
    expect(spend!.limitMicros).toBe(5_000_000)
  })
})

describe('createProductionDeps wires the REAL adapters — the production wiring is what goes untested', () => {
  it('builds one real OfferSource per retailer, against a fake transport, not a hand-built fake', () => {
    const deps = createProductionDeps({}, { transport: stubTransport() })

    const sources = deps.sources()

    expect(sources).toHaveLength(RETAILERS.length)
    expect(sources.map((s) => s.retailer).sort()).toEqual([...RETAILERS].sort())
  })

  it('the real Spar adapter builds the EDITION it is handed into the URL it asks the fake transport for', async () => {
    const { transport, urls } = recordingTransport()
    const deps = createProductionDeps({}, { transport })

    const sources = deps.sources()
    const spar = sources.find((s) => s.retailer === 'spar')!
    // WP-J1 (D5): through editionFor, exactly as collectOffers itself would
    // call it — not a hand-picked week string.
    const sparEdition = spar.editionFor(new Date('2026-09-14'))
    await spar.fetchOffers(sparEdition)

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
