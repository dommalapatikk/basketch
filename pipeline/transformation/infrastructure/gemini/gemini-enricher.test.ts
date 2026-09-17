import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNoopGate } from '../../../test-support/gate'
import { createModelCallPolicy } from '../../domain/model-registry'
import { unwrap } from '../../../collection/domain/result'
import type { EnrichRequest } from '../enrich-prompt'
import { ModelHttpError, createModelGate } from '../model-gate'
import { createGeminiEnricher } from './gemini-enricher'

const item = (productName: string, subCategory: string, descriptor: string | null = null): EnrichRequest => ({
  request: { productName, descriptor, retailer: 'denner' },
  subCategory,
})

const make = (text: string, tokens = 50) =>
  createGeminiEnricher({ apiKey: 'k', model: 'gemini-test', gate: createNoopGate(), ask: async () => ({ text, tokens }) })

describe('extracting attributes', () => {
  it('returns a stated outcome, keyed by product name', async () => {
    const e = make('[{"i":0,"attributes":{"dairyType":"milk","fatPercent":3.5}}]')
    const { outcomes } = await e.enrich([item('Emmi Vollmilch 3.5% 1L', 'dairy')])
    expect(outcomes.get('Emmi Vollmilch 3.5% 1L')).toEqual({
      kind: 'stated',
      attributes: { dairyType: 'milk', fatPercent: 3.5 },
    })
  })

  it('drops a hallucinated field before it reaches the database', async () => {
    const e = make('[{"i":0,"attributes":{"fatPercent":3.5,"freshness":"very"}}]')
    const { outcomes } = await e.enrich([item('Emmi Milch', 'dairy')])
    expect(outcomes.get('Emmi Milch')).toEqual({ kind: 'stated', attributes: { fatPercent: 3.5 } })
  })

  /**
   * WP-P9 (D3), the defect this WP closes made concrete at the unit level.
   *
   * "Emmi Milch 1L" states no fat percentage — the never-infer rule in
   * practice. The OLD code dropped this as "not worth storing", which
   * `needsEnrichment` then read as still-owed forever. The outcome now
   * records `statedNothing` — a real, final answer.
   */
  it('records "statedNothing" for a product where nothing was stated — a real answer, not a drop', async () => {
    const e = make('[{"i":0,"attributes":{"fatPercent":null}}]')
    const { outcomes } = await e.enrich([item('Emmi Milch 1L', 'dairy')])
    expect(outcomes.get('Emmi Milch 1L')).toEqual({ kind: 'statedNothing' })
  })

  it('matches answers by echoed index, not by position', async () => {
    // A dropped item would otherwise shift every product's attributes onto its
    // neighbour — silently, and wrongly.
    const e = make('[{"i":1,"attributes":{"salted":true}}]')
    const { outcomes } = await e.enrich([item('Emmi Milch', 'dairy'), item('Butter gesalzen', 'dairy')])
    // Emmi Milch got no echoed answer at all — a content gap, recorded failed
    // so it is offered again, not assumed to have stated nothing.
    expect(outcomes.get('Emmi Milch')).toMatchObject({ kind: 'failed' })
    expect(outcomes.get('Butter gesalzen')).toEqual({ kind: 'stated', attributes: { salted: true } })
  })

  it('reports usage so enrichment counts against the run budget', async () => {
    const { tokens } = await make('[]', 321).enrich([item('x', 'dairy')])
    expect(tokens).toBe(321)
  })
})

describe('batching by sub-category', () => {
  it('sends one request per sub-category, not per product', async () => {
    let calls = 0
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      gate: createNoopGate(),
      ask: async () => {
        calls++
        return { text: '[]', tokens: 1 }
      },
    })
    await e.enrich([item('a', 'dairy'), item('b', 'dairy'), item('c', 'laundry')])
    expect(calls).toBe(2)
  })

  it('splits a large sub-category across batches', async () => {
    let calls = 0
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      batchSize: 5,
      gate: createNoopGate(),
      ask: async () => {
        calls++
        return { text: '[]', tokens: 1 }
      },
    })
    await e.enrich(Array.from({ length: 12 }, (_, i) => item(`p${i}`, 'dairy')))
    expect(calls).toBe(3)
  })
})

describe('failure costs metadata, never the product', () => {
  it('records every item of a failed batch as failed, so the next run still owes them', async () => {
    let call = 0
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      gate: createNoopGate(),
      ask: async () => {
        call++
        if (call === 1) throw new Error('HTTP 429')
        return { text: '[{"i":0,"attributes":{"detergentForm":"gel"}}]', tokens: 10 }
      },
    })
    const { outcomes } = await e.enrich([item('Butter', 'dairy'), item('Dash', 'laundry')])
    // The dairy batch failed — recorded, not silently dropped.
    expect(outcomes.get('Butter')).toMatchObject({ kind: 'failed' })
    // The laundry one still produced a real result.
    expect(outcomes.get('Dash')).toEqual({ kind: 'stated', attributes: { detergentForm: 'gel' } })
  })

  /**
   * THE OTHER HALF OF D3. `rateLimited` distinguishes the fixable, expected
   * case (429) from any other failure, so `stats.enrichment.rateLimited` can
   * report it separately — without the application layer regexing a message
   * string. Read from the SAME `classifyFailure` the shared `ModelGate` uses,
   * which is how a 429 actually reaches an adapter's catch block in
   * production: `ModelGate.request` throws a `ModelHttpError` carrying the
   * real HTTP status as a structured field, not embedded only in the message.
   */
  it('marks a 429 as rate-limited, so the run can tell it apart from an unparseable response', async () => {
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      gate: createNoopGate(),
      ask: async () => {
        throw new ModelHttpError('rate-limited-short: HTTP 429: quota exceeded', 429, 57_000)
      },
    })
    const { outcomes } = await e.enrich([item('Butter', 'dairy')])
    expect(outcomes.get('Butter')).toMatchObject({ kind: 'failed', rateLimited: true })
  })

  it('does not mark an ordinary failure as rate-limited', async () => {
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      gate: createNoopGate(),
      ask: async () => {
        throw new Error('HTTP 400: bad request')
      },
    })
    const { outcomes } = await e.enrich([item('Butter', 'dairy')])
    expect(outcomes.get('Butter')).toMatchObject({ kind: 'failed', rateLimited: false })
  })

  it('logs ONE short summary line per phase, not a 2KB body per failure (WP-P5)', async () => {
    const lines: string[] = []
    const hugeBody = `HTTP 429: ${'x'.repeat(2_000)}`
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      gate: createNoopGate(),
      log: (m) => lines.push(m),
      ask: async () => {
        throw new Error(hugeBody)
      },
    })
    await e.enrich([item('Butter', 'dairy')])

    expect(lines).toHaveLength(1)
    expect(lines[0]?.length).toBeLessThan(250)
  })

  it('records failed, not silently zero, for an unparseable response', async () => {
    const { outcomes } = await make('I cannot help with that').enrich([item('Emmi Milch', 'dairy')])
    expect(outcomes.get('Emmi Milch')).toMatchObject({ kind: 'failed', reason: 'unparseable response', rateLimited: false })
  })

  it('does nothing for an empty input', async () => {
    let called = false
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      gate: createNoopGate(),
      ask: async () => {
        called = true
        return { text: '[]', tokens: 0 }
      },
    })
    const { outcomes, tokens } = await e.enrich([])
    expect(outcomes.size).toBe(0)
    expect(tokens).toBe(0)
    expect(called).toBe(false)
  })
})

describe('the fields that make comparison correct', () => {
  it('extracts a meat price basis from the retailer descriptor', async () => {
    // "per 100 g" is in Denner's nameSubline, not the product name. Comparing a
    // per-100g price with a per-kg one is wrong by a factor of ten.
    const e = make('[{"i":0,"attributes":{"priceBasis":"per-100g","animal":"pork","leanness":"mager"}}]')
    const { outcomes } = await e.enrich([
      item('Denner Schweinsnierstück', 'meat', 'am Stück, mager, ca. 900 g, per 100 g'),
    ])
    expect(outcomes.get('Denner Schweinsnierstück')).toMatchObject({ attributes: { priceBasis: 'per-100g' } })
  })

  it('extracts detergent wash loads', async () => {
    const e = make('[{"i":0,"attributes":{"washLoads":100,"detergentForm":"gel"}}]')
    const { outcomes } = await e.enrich([item('Persil Gel Color 100 Waschgänge', 'laundry')])
    expect(outcomes.get('Persil Gel Color 100 Waschgänge')).toEqual({
      kind: 'stated',
      attributes: { washLoads: 100, detergentForm: 'gel' },
    })
  })
})

// Enrichment is optional metadata, but it still makes ~1 sequential model call
// per sub-category. Node's fetch has no default timeout, so one stalled socket
// here delays every classification chunk behind it. This covers the DEFAULT
// network path (no `ask` injected) — the path run.ts actually uses.
describe('the default network path is bounded', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends an abort signal, so a stalled provider cannot hang the run', async () => {
    let seen: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init.signal
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }), { status: 200 })
    })

    await createGeminiEnricher({ apiKey: 'k', model: 'gemini-test', gate: createNoopGate() }).enrich([item('Emmi Milch', 'dairy')])

    expect(seen).toBeInstanceOf(AbortSignal)
  })

  it('still costs the product only its attributes when the call fails', async () => {
    // The standing rule: enrichment must never cost a product its category.
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }))

    const { outcomes } = await createGeminiEnricher({ apiKey: 'k', model: 'gemini-test', gate: createNoopGate() }).enrich([
      item('Emmi Milch', 'dairy'),
    ])

    expect(outcomes.get('Emmi Milch')).toMatchObject({ kind: 'failed' })
  })
})

/**
 * WP-P9: proves the backfill's calls now PACE through the shared gate rather
 * than bursting — the structural half of item 6 WP-P5 already fixed, verified
 * here end-to-end through this adapter rather than trusted by construction.
 *
 * Measured defect (run 34833209176): ~250 requests fired in 20 seconds with
 * NO gate at all, 255 refused. A gate that paces to 90% of a tiny per-minute
 * limit must make a caller who asks for many sub-category batches actually
 * WAIT — proven here by a fake `sleep` that records every call.
 */
describe('enrichment paces through the shared gate rather than bursting (WP-P9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits between calls once the gate rate limit is reached, instead of firing every request back to back', async () => {
    let now = 0
    const waits: number[] = []
    const gate = createModelGate(
      unwrap(createModelCallPolicy({
        id: 'gemini-test',
        provider: 'google',
        measuredMacroF1: null,
        measuredOn: null,
        requestsPerDay: null,
        // Small enough that 5 sub-categories (5 HTTP calls) cannot all fit in
        // one window at 90% pacing — one wait is enough to prove pacing fired.
        requestsPerMinute: 2,
        maxInFlight: 1,
      })),
      {
        now: () => now,
        sleep: async (ms) => {
          waits.push(ms)
          now += ms
        },
      },
    )

    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }), { status: 200 }),
    )

    const e = createGeminiEnricher({ apiKey: 'k', model: 'gemini-test', gate })
    // 5 distinct sub-categories ⇒ 5 sequential HTTP calls through the SAME gate.
    await e.enrich(['dairy', 'laundry', 'meat', 'beer', 'wine'].map((sub) => item(`p-${sub}`, sub)))

    expect(waits.length).toBeGreaterThan(0)
  })
})
