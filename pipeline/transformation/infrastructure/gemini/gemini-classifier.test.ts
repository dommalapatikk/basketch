import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOk } from '../../../collection/domain/result'
import { createNoopGate } from '../../../test-support/gate'
import { GOOGLE_429_BODY } from '../../__fixtures__/google-429'
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
    gate: createNoopGate(),
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

})

/**
 * D4 content guards (WP-P6, `docs/rca/2026-09-15-final-plan.md`).
 *
 * THE DEFECT THIS CLOSES: a truncated or unparseable response used to be a
 * whole-BATCH `Err('source-changed: …')`. `resilientClassifier` (deleted,
 * WP-P5 F6) then read that as `'transient'` and retried the IDENTICAL
 * prompt three times — pointless for a response cut off by a token limit,
 * since temperature 0 truncates the same way every time — and five such
 * batches opened the circuit for the rest of the run.
 *
 * Both guards below resolve to `Ok`, never `Err`: they are CONTENT
 * failures, decided entirely inside this adapter, and D1's boundary keeps
 * them there — `model-gate.ts`'s circuit only ever sees what `postJson`
 * THROWS, and neither guard throws or returns an Err. A batch that is
 * truncated or unparseable on every single call still classifies as `Ok`,
 * which is the structural proof it can never open the shared circuit.
 */
describe('content guards — MAX_TOKENS truncation is bisected, not retried identically (D4)', () => {
  /** A Gemini reply cut off by the output token limit. */
  const maxTokensReply = (text = '[{"i":0,"cat') => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'MAX_TOKENS' }],
  })

  /** Product count sent in ONE prompt body — every line of the numbered list. */
  const productCount = (body: string): number => {
    const text: string = JSON.parse(body).contents[0].parts[0].text
    return (text.match(/^\d+\. /gm) ?? []).length
  }

  it('a MAX_TOKENS batch is split and retried, never three identical calls, never opens the circuit', async () => {
    // Every single call — original and every bisected half — comes back
    // truncated, so this exercises the full 25 → 13 → 7 depth.
    const bodies: string[] = []
    const c = make(async (_url, body) => {
      bodies.push(body)
      return maxTokensReply()
    })

    const batch = Array.from({ length: 25 }, (_, i) => req(`Product ${i}`))
    const r = await c.classify(batch)

    // Never an Err — a truncated batch is a content failure, handled here,
    // not a whole-call failure the gate/circuit ever sees.
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return

    // Every one of the 25 original products still has an outcome — never
    // silently dropped by the split.
    expect(r.value).toHaveLength(25)
    expect(r.value.every((o) => !o.ok)).toBe(true)
    expect(r.value.every((o) => !o.ok && o.reason === 'output-truncated')).toBe(true)

    // 1 (size 25) + 2 (bisect 1: 13, 12) + 4 (bisect 2: 7, 6, 6, 6) = 7 calls.
    // Bisection stops at depth 2 — 25 → 13 → 7 — never a third split.
    expect(bodies).toHaveLength(7)

    // No two calls sent the IDENTICAL prompt — the old bug retried the same
    // 25-item body three times running.
    expect(new Set(bodies).size).toBe(bodies.length)

    const sizes = bodies.map(productCount)
    expect(sizes.sort((a, b) => b - a)).toEqual([25, 13, 12, 7, 6, 6, 6])
  })

  it('recovers once a bisected half is small enough to answer in full', async () => {
    const c = make(async (_url, body) => {
      const size = productCount(body)
      // The full 25 truncates; every half of 13 or smaller answers cleanly.
      if (size > 13) return maxTokensReply()
      const answers = Array.from({ length: size }, (_, i) => `{"i":${i},"category":"dairy","subCategory":"dairy","confidence":0.9}`)
      return { candidates: [{ content: { parts: [{ text: `[${answers.join(',')}]` }] } }] }
    })

    const batch = Array.from({ length: 25 }, (_, i) => req(`Product ${i}`))
    const r = await c.classify(batch)

    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value).toHaveLength(25)
    expect(r.value.every((o) => o.ok)).toBe(true)
  })

  it('a batch whose answers skip indices reports the missing products with a reason', async () => {
    // The response is complete (no MAX_TOKENS) but the model simply forgot
    // index 2 of 4 — a genuinely different failure from truncation.
    const c = make(reply('[{"i":0,"category":"dairy","subCategory":"dairy","confidence":0.9},{"i":1,"category":"dairy","subCategory":"dairy","confidence":0.9},{"i":3,"category":"dairy","subCategory":"dairy","confidence":0.9}]'))
    const r = await c.classify([req('A'), req('B'), req('C'), req('D')])
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value).toHaveLength(4)
    const missing = r.value[2]
    expect(missing?.ok).toBe(false)
    if (missing && !missing.ok) {
      expect(missing.reason).toBe('no-answer')
      expect(missing.detail).toContain('no entry')
    }
    // The other three are unaffected — one missing index never costs its neighbours.
    expect(r.value.filter((o) => o.ok)).toHaveLength(3)
  })
})

describe('content guards — an unparseable-but-complete response is retried once (D4)', () => {
  it('gets exactly one retry, not three identical calls', async () => {
    let calls = 0
    const c = make(async () => {
      calls++
      return { candidates: [{ content: { parts: [{ text: 'I cannot help with that.' }] } }] }
    })
    const r = await c.classify([req('Milch')])
    expect(calls).toBe(2)
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    const outcome = r.value[0]
    expect(outcome?.ok).toBe(false)
    if (outcome && !outcome.ok) {
      expect(outcome.reason).toBe('unparseable')
      expect(outcome.detail).toContain('one retry')
    }
  })

  it('recovers if the retry comes back parseable — the provider is not fully deterministic in practice', async () => {
    let calls = 0
    const c = make(async () => {
      calls++
      if (calls === 1) return { candidates: [{ content: { parts: [{ text: 'garbled output' }] } }] }
      return { candidates: [{ content: { parts: [{ text: '[{"i":0,"category":"dairy","subCategory":"dairy","confidence":0.9}]' }] } }] }
    })
    const r = await c.classify([req('Milch')])
    expect(calls).toBe(2)
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value[0]?.ok).toBe(true)
  })
})

// A chunk of 100 products makes ~59 SEQUENTIAL model calls. One stalled socket
// blocks every call behind it, and Node's fetch has no default timeout — it
// waits on the OS TCP timeout, 120s+. These tests cover the DEFAULT network
// path (no fetchJson injected), which is the path run.ts actually uses.
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

    const c = createGeminiClassifier({ apiKey: 'k', model: 'gemini-test', tier: 1, taxonomy: TAXONOMY, gate: createNoopGate() })
    await c.classify([req('Milch')])

    expect(seen).toBeInstanceOf(AbortSignal)
  })

  it('keeps enough of a 429 body for the provider’s own retryDelay to survive', async () => {
    // Google buries retryDelay in error.details[].RetryInfo, ~700 chars in.
    // Truncating at 200 threw it away, so resilient-classifier always fell back
    // to a guessed exponential backoff instead of obeying the provider.
    vi.stubGlobal('fetch', async () => new Response(GOOGLE_429_BODY, { status: 429 }))

    const c = createGeminiClassifier({ apiKey: 'k', model: 'gemini-test', tier: 1, taxonomy: TAXONOMY, gate: createNoopGate() })
    const r = await c.classify([req('Milch')])

    expect(isOk(r)).toBe(false)
    if (!isOk(r)) {
      expect(r.error).toContain('retryDelay')
      expect(r.error).toMatch(/retryDelay["\s:]+([\d.]+s)/)
    }
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
