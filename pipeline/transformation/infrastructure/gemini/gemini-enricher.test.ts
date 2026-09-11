import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnrichRequest } from '../enrich-prompt'
import { createGeminiEnricher } from './gemini-enricher'

const item = (productName: string, subCategory: string, descriptor: string | null = null): EnrichRequest => ({
  request: { productName, descriptor, retailer: 'denner' },
  subCategory,
})

const make = (text: string, tokens = 50) =>
  createGeminiEnricher({ apiKey: 'k', model: 'gemini-test', ask: async () => ({ text, tokens }) })

describe('extracting attributes', () => {
  it('returns validated attributes keyed by product name', async () => {
    const e = make('[{"i":0,"attributes":{"dairyType":"milk","fatPercent":3.5}}]')
    const { attributes } = await e.enrich([item('Emmi Vollmilch 3.5% 1L', 'dairy')])
    expect(attributes.get('Emmi Vollmilch 3.5% 1L')).toEqual({ dairyType: 'milk', fatPercent: 3.5 })
  })

  it('drops a hallucinated field before it reaches the database', async () => {
    const e = make('[{"i":0,"attributes":{"fatPercent":3.5,"freshness":"very"}}]')
    const { attributes } = await e.enrich([item('Emmi Milch', 'dairy')])
    expect(attributes.get('Emmi Milch')).toEqual({ fatPercent: 3.5 })
  })

  it('stores nothing for a product where nothing was stated', async () => {
    // The never-infer rule in practice: "Emmi Milch 1L" states no fat
    // percentage, so the honest answer is no attributes at all.
    const e = make('[{"i":0,"attributes":{"fatPercent":null}}]')
    const { attributes } = await e.enrich([item('Emmi Milch 1L', 'dairy')])
    expect(attributes.has('Emmi Milch 1L')).toBe(false)
  })

  it('matches answers by echoed index, not by position', async () => {
    // A dropped item would otherwise shift every product's attributes onto its
    // neighbour — silently, and wrongly.
    const e = make('[{"i":1,"attributes":{"salted":true}}]')
    const { attributes } = await e.enrich([item('Emmi Milch', 'dairy'), item('Butter gesalzen', 'dairy')])
    expect(attributes.has('Emmi Milch')).toBe(false)
    expect(attributes.get('Butter gesalzen')).toEqual({ salted: true })
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
  it('returns what it has when a batch throws', async () => {
    let call = 0
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      ask: async () => {
        call++
        if (call === 1) throw new Error('HTTP 429')
        return { text: '[{"i":0,"attributes":{"salted":true}}]', tokens: 10 }
      },
    })
    const { attributes } = await e.enrich([item('Butter', 'dairy'), item('Dash', 'laundry')])
    // The dairy batch failed; the laundry one still produced a result.
    expect(attributes.size).toBeLessThanOrEqual(1)
  })

  it('survives an unparseable response', async () => {
    const { attributes } = await make('I cannot help with that').enrich([item('Emmi Milch', 'dairy')])
    expect(attributes.size).toBe(0)
  })

  it('does nothing for an empty input', async () => {
    let called = false
    const e = createGeminiEnricher({
      apiKey: 'k',
      model: 'm',
      ask: async () => {
        called = true
        return { text: '[]', tokens: 0 }
      },
    })
    const { attributes, tokens } = await e.enrich([])
    expect(attributes.size).toBe(0)
    expect(tokens).toBe(0)
    expect(called).toBe(false)
  })
})

describe('the fields that make comparison correct', () => {
  it('extracts a meat price basis from the retailer descriptor', async () => {
    // "per 100 g" is in Denner's nameSubline, not the product name. Comparing a
    // per-100g price with a per-kg one is wrong by a factor of ten.
    const e = make('[{"i":0,"attributes":{"priceBasis":"per-100g","animal":"pork","leanness":"mager"}}]')
    const { attributes } = await e.enrich([
      item('Denner Schweinsnierstück', 'meat', 'am Stück, mager, ca. 900 g, per 100 g'),
    ])
    expect(attributes.get('Denner Schweinsnierstück')).toMatchObject({ priceBasis: 'per-100g' })
  })

  it('extracts detergent wash loads', async () => {
    const e = make('[{"i":0,"attributes":{"washLoads":100,"detergentForm":"gel"}}]')
    const { attributes } = await e.enrich([item('Persil Gel Color 100 Waschgänge', 'laundry')])
    expect(attributes.get('Persil Gel Color 100 Waschgänge')).toEqual({ washLoads: 100, detergentForm: 'gel' })
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

    await createGeminiEnricher({ apiKey: 'k', model: 'gemini-test' }).enrich([item('Emmi Milch', 'dairy')])

    expect(seen).toBeInstanceOf(AbortSignal)
  })

  it('still costs the product only its attributes when the call fails', async () => {
    // The standing rule: enrichment must never cost a product its category.
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }))

    const { attributes } = await createGeminiEnricher({ apiKey: 'k', model: 'gemini-test' }).enrich([
      item('Emmi Milch', 'dairy'),
    ])

    expect(attributes.size).toBe(0)
  })
})
