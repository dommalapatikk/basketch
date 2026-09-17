import { afterEach, describe, expect, it, vi } from 'vitest'
import { unwrap } from '../../../collection/domain/result'
import { createNoopGate } from '../../../test-support/gate'
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
    createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY, gate: createNoopGate(), ask: reply(text) })

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
    const j = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, gate: createNoopGate(), ask: reply('{"verdict":"correct"}', 137) })
    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).tokens).toBe(137)
  })
})

describe('a judge that misbehaves must not escalate everything', () => {
  it('returns "unavailable", NOT "wrong", for an unparseable answer', async () => {
    // Reading garbage as disapproval would escalate every product the moment
    // the judge changed its output format.
    const j = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, gate: createNoopGate(), ask: reply('I cannot help with that.') })
    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).verdict).toBe('unavailable')
  })

  // WP-P8 review: max_tokens (2,000) is an unmeasured guess — AP-11's 291-row
  // re-benchmark was not run. If it is too low the judge returns truncated or
  // empty content at full price, and the only trace was an aggregate "judge
  // unavailable for N products", indistinguishable from a dead provider. The
  // token count next to the cap is what tells the two apart.
  it('says how many tokens an unparseable verdict burned, and names the cap when it hit it', async () => {
    const lines: string[] = []
    const j = createOpenRouterJudge({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      gate: createNoopGate(),
      maxOutputTokens: 2_000,
      log: (m) => lines.push(m),
      ask: reply('{"verdict":"corr', 2_000),
    })

    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).verdict).toBe('unavailable')
    expect(lines.join('\n')).toContain('2000 tokens')
    expect(lines.join('\n')).toContain('HIT THE CAP')
  })

  it('does not cry cap when the judge simply answered in an odd shape', async () => {
    const lines: string[] = []
    const j = createOpenRouterJudge({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      gate: createNoopGate(),
      maxOutputTokens: 2_000,
      log: (m) => lines.push(m),
      ask: reply('I cannot help with that.', 12),
    })

    await j.judge(req, { category: 'dairy', subCategory: 'dairy' })
    expect(lines.join('\n')).toContain('12 tokens')
    expect(lines.join('\n')).not.toContain('HIT THE CAP')
  })

  it('returns "unavailable" for an unrecognised verdict word', async () => {
    const j = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, gate: createNoopGate(), ask: reply('{"verdict":"maybe"}') })
    expect((await j.judge(req, { category: 'dairy', subCategory: 'dairy' })).verdict).toBe('unavailable')
  })

  it('returns "unavailable" when the provider is down — classification still stands', async () => {
    const j = createOpenRouterJudge({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY, gate: createNoopGate(),
      ask: async () => {
        throw new Error('HTTP 429')
      },
    })
    const r = await j.judge(req, { category: 'dairy', subCategory: 'dairy' })
    expect(r.verdict).toBe('unavailable')
    expect(r.tokens).toBe(0)
  })

  it('logs a judge failure too — same defect class as the reflector, fixed for consistency', async () => {
    const lines: string[] = []
    const j = createOpenRouterJudge({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      gate: createNoopGate(),
      log: (m) => lines.push(m),
      ask: async () => {
        throw new Error('HTTP 402: out of credit')
      },
    })
    await j.judge(req, { category: 'dairy', subCategory: 'dairy' })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('judge')
  })
})

describe('the reflector', () => {
  const make = (text: string) =>
    createGeminiReflector({ apiKey: 'k', model: 'gemini-3.5-flash-lite', taxonomy: TAXONOMY, gate: createNoopGate(), ask: reply(text) })

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
      taxonomy: TAXONOMY, gate: createNoopGate(),
      ask: async () => {
        throw new Error('ECONNRESET')
      },
    })
    expect((await r.reflect(req, cls('dairy', 'dairy'))).classification).toBeNull()
  })

  it('logs a reflector failure instead of swallowing it (RCA item 6.2 step 4)', async () => {
    // THE DEFECT: this catch used to return { classification: null, tokens: 0 }
    // with no log call at all, so the reflector's own 429s were invisible —
    // the probable-but-unproven cause of enrichment starting with an
    // already-drained bucket.
    const lines: string[] = []
    const r = createGeminiReflector({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY,
      gate: createNoopGate(),
      log: (m) => lines.push(m),
      ask: async () => {
        throw new Error('HTTP 429: rate limited')
      },
    })
    await r.reflect(req, cls('dairy', 'dairy'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('reflect')
    expect(lines[0]).toContain('429')
  })

  it('reports usage so escalation counts against the budget', async () => {
    const r = await createGeminiReflector({
      apiKey: 'k',
      model: 'm',
      taxonomy: TAXONOMY, gate: createNoopGate(),
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

    const v = await createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY, gate: createNoopGate() }).judge(req, {
      category: 'dairy',
      subCategory: 'dairy',
    })

    expect(seen).toBeInstanceOf(AbortSignal)
    expect(v.verdict).toBe('correct')
  })

  // WP-P8 (RCA item 5): "the only max_tokens in the codebase was the unused
  // probe's 5" — the JUDGE, the one call that actually spends money, had
  // none at all. Asserting the request BODY, not just that a value was
  // passed somewhere.
  it('sends max_tokens on every judge call', async () => {
    let seenBody: string | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seenBody = init.body as string
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }), { status: 200 })
    })

    await createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY, gate: createNoopGate(), maxOutputTokens: 1_234 }).judge(
      req,
      { category: 'dairy', subCategory: 'dairy' },
    )

    const parsed = JSON.parse(seenBody ?? '{}')
    expect(parsed.max_tokens).toBe(1_234)
  })

  it('falls back to DEFAULT_JUDGE_MAX_OUTPUT_TOKENS when the caller supplies none', async () => {
    let seenBody: string | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seenBody = init.body as string
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }), { status: 200 })
    })

    await createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY, gate: createNoopGate() }).judge(req, {
      category: 'dairy',
      subCategory: 'dairy',
    })

    expect(JSON.parse(seenBody ?? '{}').max_tokens).toBe(2_000)
  })

  it('sends reasoning.effort only when the caller opts in — unset by default so AP-11 stays undecided by this WP', async () => {
    let seenBody: string | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seenBody = init.body as string
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"correct"}' } }] }), { status: 200 })
    })

    await createOpenRouterJudge({ apiKey: 'k', model: 'openai/gpt-5-nano', taxonomy: TAXONOMY, gate: createNoopGate() }).judge(req, {
      category: 'dairy',
      subCategory: 'dairy',
    })
    expect(JSON.parse(seenBody ?? '{}').reasoning).toBeUndefined()

    await createOpenRouterJudge({
      apiKey: 'k',
      model: 'openai/gpt-5-nano',
      taxonomy: TAXONOMY,
      gate: createNoopGate(),
      reasoningEffort: 'low',
    }).judge(req, { category: 'dairy', subCategory: 'dairy' })
    expect(JSON.parse(seenBody ?? '{}').reasoning).toEqual({ effort: 'low' })
  })

  it('the Gemini reflector sends an abort signal', async () => {
    let seen: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init.signal
      const text = '{"category":"dairy","subCategory":"dairy","confidence":0.8}'
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
    })

    const r = await createGeminiReflector({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, gate: createNoopGate() }).reflect(req, cls('dairy', 'dairy'))

    expect(seen).toBeInstanceOf(AbortSignal)
    expect(r.classification?.category).toBe('dairy')
  })
})
