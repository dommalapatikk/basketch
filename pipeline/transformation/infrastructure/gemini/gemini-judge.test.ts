import { afterEach, describe, expect, it, vi } from 'vitest'
import { unwrap } from '../../../collection/domain/result'
import { createClassification, createConfidence } from '../../domain/classification'
import { createGeminiReflector, createOpenRouterJudge } from './gemini-judge'

const TAXONOMY = [
  { category: 'dairy', subCategories: ['dairy', 'eggs'] },
  { category: 'pantry-canned', subCategories: ['canned', 'condiments'] },
]

const req = { productName: 'Mmmh Oliven mit Käse', descriptor: 'entsteint, 150 g', retailer: 'denner' }

const cls = (category: string, subCategory: string, conf = 0.6) =>
  unwrap(createClassification({ category, subCategory, confidence: unwrap(createConfidence(conf)), tier: 1, model: 'gemini' }))

const reply = (text: string, tokens = 40) => async () => ({ text, tokens })

describe('the judge never sets a category — it rates trust', () => {
  const make = (text: string) =>
    createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY, ask: reply(text) })

  it('reads a "correct" verdict', async () => {
    const r = await make('{"i":0,"verdict":"correct","category":"pantry-canned","confidence":0.9}').judge(req, {
      category: 'pantry-canned',
      subCategory: 'canned',
    })
    expect(r.verdict).toBe('correct')
  })

  it('accepts "defensible" — many products sit legitimately between categories', async () => {
    const r = await make('{"verdict":"defensible"}').judge(req, { category: 'ready-meals-frozen', subCategory: 'ready-meals' })
    expect(r.verdict).toBe('defensible')
  })

  it('reads a "wrong" verdict — the only thing that triggers escalation', async () => {
    const r = await make('{"verdict":"wrong","category":"pantry-canned"}').judge(req, { category: 'dairy', subCategory: 'dairy' })
    expect(r.verdict).toBe('wrong')
  })

  it('reports usage so the run budget sees it', async () => {
    const j = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, ask: reply('{"verdict":"correct"}', 137) })
    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).tokens).toBe(137)
  })
})

describe('a judge that misbehaves must not escalate everything', () => {
  it('returns "unavailable", NOT "wrong", for an unparseable answer', async () => {
    // Reading garbage as disapproval would escalate every product the moment
    // the judge changed its output format.
    const j = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, ask: reply('I cannot help with that.') })
    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).verdict).toBe('unavailable')
  })

  it('returns "unavailable" for an unrecognised verdict word', async () => {
    const j = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, ask: reply('{"verdict":"maybe"}') })
    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).verdict).toBe('unavailable')
  })

  it('returns "unavailable" when the provider is down — classification still stands', async () => {
    const j = createOpenRouterJudge({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      ask: async () => {
        throw new Error('HTTP 429')
      },
    })
    const r = await j.judge(req, { category: 'dairy', subCategory: 'dairy' })
    expect(r.verdict).toBe('unavailable')
    expect(r.tokens).toBe(0)
  })
})

describe('the reflector', () => {
  const make = (text: string) =>
    createGeminiReflector({ apiKey: 'k', model: 'gemini-3.5-flash-lite', taxonomy: TAXONOMY, ask: reply(text) })

  it('returns a revised classification, marked tier 2', async () => {
    const r = await make('{"i":0,"category":"pantry-canned","subCategory":"canned","confidence":0.88,"reasoning":"jarred olives are preserved"}')
      .reflect(req, cls('dairy', 'dairy'))
    expect(r.classification?.category).toBe('pantry-canned')
    expect(r.classification?.tier).toBe(2)
  })

  it('can hold its ground — returning the same answer is a valid outcome', async () => {
    // When reflection agrees with itself against a judge that disputed it, the
    // graph flags the product rather than picking a winner.
    const r = await make('{"category":"dairy","subCategory":"dairy","confidence":0.7}').reflect(req, cls('dairy', 'dairy'))
    expect(r.classification?.category).toBe('dairy')
  })

  it('returns null when the revision names a category that does not exist', async () => {
    // A reflection producing junk is no reflection. The graph then treats the
    // item as unresolved instead of accepting it.
    const r = await make('{"category":"tinned-goods","subCategory":"canned","confidence":0.9}').reflect(req, cls('dairy', 'dairy'))
    expect(r.classification).toBeNull()
  })

  it('returns null for an unparseable response', async () => {
    expect((await make('no json here').reflect(req, cls('dairy', 'dairy'))).classification).toBeNull()
  })

  it('returns null rather than throwing when the provider fails', async () => {
    const r = createGeminiReflector({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      ask: async () => {
        throw new Error('ECONNRESET')
      },
    })
    expect((await r.reflect(req, cls('dairy', 'dairy'))).classification).toBeNull()
  })

  it('reports usage so escalation counts against the budget', async () => {
    const r = await createGeminiReflector({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      ask: reply('{"category":"dairy","subCategory":"dairy","confidence":0.8}', 210),
    }).reflect(req, cls('dairy', 'dairy'))
    expect(r.tokens).toBe(210)
  })
})

// The judge and the reflector each make ONE sequential model call per escalated
// product. Node's fetch has no default timeout, so a stalled socket in either
// stalls the whole classification chain behind it. These cover the DEFAULT
// network paths (no `ask` injected) — the paths run.ts actually uses.
describe('the default network paths are bounded', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the OpenRouter judge sends an abort signal', async () => {
    let seen: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init.signal
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }), { status: 200 })
    })

    const v = await createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY }).judge(req, {
      category: 'dairy',
      subCategory: 'dairy',
    })

    expect(seen).toBeInstanceOf(AbortSignal)
    expect(v.verdict).toBe('correct')
  })

  it('the Gemini reflector sends an abort signal', async () => {
    let seen: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init.signal
      const text = '{"category":"dairy","subCategory":"dairy","confidence":0.8}'
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
    })

    const r = await createGeminiReflector({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY }).reflect(req, cls('dairy', 'dairy'))

    expect(seen).toBeInstanceOf(AbortSignal)
    expect(r.classification?.category).toBe('dairy')
  })
})
