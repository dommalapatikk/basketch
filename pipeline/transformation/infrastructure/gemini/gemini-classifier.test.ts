import { describe, expect, it } from 'vitest'
import { isOk } from '../../../collection/domain/result'
import { buildPrompt, createGeminiClassifier, extractAnswers } from './gemini-classifier'
import type { TaxonomyEntry } from './gemini-classifier'

const TAXONOMY: TaxonomyEntry[] = [
  { category: 'dairy', subCategories: ['dairy', 'eggs'] },
  { category: 'pantry-canned', subCategories: ['canned', 'condiments'] },
  { category: 'snacks-sweets', subCategories: ['snacks', 'chocolate'] },
]

const req = (productName: string, descriptor: string | null = null) => ({
  productName,
  descriptor,
  retailer: 'denner',
})

/** A canned Gemini response wrapping whatever text the model "returned". */
const reply = (text: string, tokens = 100) => async () => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { totalTokenCount: tokens },
})

const make = (fetchJson: (url: string, body: string) => Promise<unknown>, onUsage?: (n: number) => void) =>
  createGeminiClassifier({
    apiKey: 'test',
    model: 'gemini-test',
    tier: 1,
    taxonomy: TAXONOMY,
    fetchJson,
    onUsage,
  })

describe('buildPrompt', () => {
  it('lists every category with its allowed sub-categories', () => {
    const p = buildPrompt(TAXONOMY, [req('Milch')])
    expect(p).toContain('dairy: dairy, eggs')
    expect(p).toContain('pantry-canned: canned, condiments')
  })

  it('numbers products so answers can be matched back by index', () => {
    const p = buildPrompt(TAXONOMY, [req('Milch'), req('Brot')])
    expect(p).toContain('0. Milch')
    expect(p).toContain('1. Brot')
  })

  it('includes the retailer descriptor when there is one', () => {
    const p = buildPrompt(TAXONOMY, [req('Chickenballs', 'paniert, 400 g')])
    expect(p).toContain('Chickenballs — paniert, 400 g')
  })

  it('forbids inventing categories and forbids "other"', () => {
    const p = buildPrompt(TAXONOMY, [req('x')])
    expect(p).toMatch(/never invent/i)
    expect(p).toMatch(/"other" is not permitted/i)
  })

  it('tells the model not to assume typical values — the never-infer rule', () => {
    expect(buildPrompt(TAXONOMY, [req('x')])).toMatch(/do not assume typical values/i)
  })
})

describe('extractAnswers', () => {
  it('parses a bare JSON array', () => {
    expect(extractAnswers('[{"i":0,"category":"dairy"}]')).toEqual([{ i: 0, category: 'dairy' }])
  })

  it('parses through markdown fences — models add them unprompted', () => {
    expect(extractAnswers('```json\n[{"i":0,"category":"dairy"}]\n```')).toEqual([{ i: 0, category: 'dairy' }])
  })

  it('parses through surrounding prose', () => {
    expect(extractAnswers('Here you go:\n[{"i":0,"category":"dairy"}]\nHope that helps!')).toEqual([
      { i: 0, category: 'dairy' },
    ])
  })

  it('returns null for unparseable output rather than throwing', () => {
    expect(extractAnswers('I cannot help with that.')).toBeNull()
    expect(extractAnswers('[{broken')).toBeNull()
  })
})

describe('classify — the happy path', () => {
  it('returns one classification per product', async () => {
    const c = make(reply('[{"i":0,"category":"dairy","subCategory":"dairy","confidence":0.95}]'))
    const r = await c.classify([req('Emmi Milch')])
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    const first = r.value[0]
    expect(first?.ok).toBe(true)
    if (first?.ok) {
      expect(first.classification.category).toBe('dairy')
      expect(first.classification.model).toBe('gemini-test')
      expect(first.classification.tier).toBe(1)
    }
  })

  it('reports token usage for the run budget', async () => {
    let tokens = 0
    const c = make(reply('[{"i":0,"category":"dairy","subCategory":"dairy","confidence":1}]', 4242), (n) => {
      tokens += n
    })
    await c.classify([req('Milch')])
    expect(tokens).toBe(4242)
  })

  it('sends temperature 0 — the same product must classify identically every run', async () => {
    let sent = ''
    const c = make(async (_url, body) => {
      sent = body
      return { candidates: [{ content: { parts: [{ text: '[]' }] } }] }
    })
    await c.classify([req('Milch')])
    expect(JSON.parse(sent).generationConfig.temperature).toBe(0)
  })

  it('returns an empty result for an empty batch without calling the provider', async () => {
    let called = false
    const c = make(async () => {
      called = true
      return {}
    })
    const r = await c.classify([])
    expect(isOk(r) && r.value.length).toBe(0)
    expect(called).toBe(false)
  })
})

describe('classify — the model misbehaving', () => {
  it('rejects a category that is not in the taxonomy', async () => {
    const c = make(reply('[{"i":0,"category":"tinned-goods","subCategory":"canned","confidence":0.9}]'))
    const r = await c.classify([req('Pelati')])
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value[0]?.ok).toBe(false)
    if (!r.value[0]?.ok) expect(r.value[0]?.reason).toBe('invalid-category')
  })

  it('rejects a sub-category belonging to a different category', async () => {
    const c = make(reply('[{"i":0,"category":"dairy","subCategory":"chocolate","confidence":0.9}]'))
    const r = await c.classify([req('Milch')])
    if (!isOk(r)) return
    expect(r.value[0]?.ok).toBe(false)
  })

  it('rejects "other" — D1 holds even when the model insists', async () => {
    const c = make(reply('[{"i":0,"category":"other","subCategory":"other","confidence":0.9}]'))
    const r = await c.classify([req('???')])
    if (!isOk(r)) return
    expect(r.value[0]?.ok).toBe(false)
  })

  it('matches answers by echoed index, not by position', async () => {
    // The model answers out of order and skips index 1 entirely.
    const c = make(reply('[{"i":2,"category":"dairy","subCategory":"dairy","confidence":0.9},{"i":0,"category":"snacks-sweets","subCategory":"chocolate","confidence":0.8}]'))
    const r = await c.classify([req('Schoggi'), req('Unknown'), req('Milch')])
    if (!isOk(r)) return

    // Position 0 must get ITS answer, not the first one in the array.
    expect(r.value[0]?.ok && r.value[0].classification.category).toBe('snacks-sweets')
    // Position 1 was skipped — reported as unanswered, not silently mislabelled.
    expect(r.value[1]?.ok).toBe(false)
    expect(r.value[2]?.ok && r.value[2].classification.category).toBe('dairy')
  })

  it('reports a failure per item without failing the whole batch', async () => {
    const c = make(reply('[{"i":0,"category":"dairy","subCategory":"dairy","confidence":0.9},{"i":1,"category":"nonsense","subCategory":"x","confidence":0.9}]'))
    const r = await c.classify([req('Milch'), req('???')])
    if (!isOk(r)) return
    expect(r.value[0]?.ok).toBe(true)
    expect(r.value[1]?.ok).toBe(false)
  })

  it('rejects an out-of-range confidence', async () => {
    const c = make(reply('[{"i":0,"category":"dairy","subCategory":"dairy","confidence":1.7}]'))
    const r = await c.classify([req('Milch')])
    if (!isOk(r)) return
    expect(r.value[0]?.ok).toBe(false)
  })
})

describe('classify — the provider misbehaving', () => {
  it('returns an error result when the request throws — never throws itself', async () => {
    const c = make(async () => {
      throw new Error('ECONNRESET')
    })
    const r = await c.classify([req('Milch')])
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('provider-unavailable')
  })

  it('surfaces a Google API error payload', async () => {
    const c = make(async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }))
    const r = await c.classify([req('Milch')])
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('RESOURCE_EXHAUSTED')
  })

  it('fails loudly when the response is not parseable', async () => {
    const c = make(reply('I am unable to assist with that request.'))
    const r = await c.classify([req('Milch')])
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('source-changed')
  })
})

describe('extractAnswers — provider shape differences (found live 2026-09-10)', () => {
  it('parses an object wrapping the array — providers forced into json_object mode', () => {
    expect(extractAnswers('{"results":[{"i":0,"category":"dairy"}]}')).toEqual([{ i: 0, category: 'dairy' }])
  })

  it('parses whatever the wrapper key is called', () => {
    expect(extractAnswers('{"products":[{"i":1,"category":"bakery"}]}')).toEqual([{ i: 1, category: 'bakery' }])
  })

  it('parses a lone answer object as a one-item batch', () => {
    // nemotron returned exactly this when response_format forced an object:
    // the model dropped the array brackets rather than break the constraint.
    expect(extractAnswers('{"i":0,"category":"dairy"}')).toEqual([{ i: 0, category: 'dairy' }])
  })

  it('defaults a missing index to 0 on a lone object', () => {
    expect(extractAnswers('{"category":"dairy","subCategory":"dairy"}')?.[0]?.i).toBe(0)
  })

  it('still prefers a bare array when both shapes could match', () => {
    expect(extractAnswers('[{"i":0,"category":"bakery"}]')).toEqual([{ i: 0, category: 'bakery' }])
  })

  it('returns null for an object with no answers in it', () => {
    expect(extractAnswers('{"error":"I cannot help"}')).toBeNull()
  })
})
