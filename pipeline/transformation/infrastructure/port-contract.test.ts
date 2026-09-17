// THE SHARED PORT CONTRACT SUITE — every adapter must pass it.
//
// CLAUDE.md, Test-Driven Development, step 2: "Port contract test — one shared
// suite every adapter must pass." This is that suite for the transformation
// ports, and it exists because the graph was found calling judge(), reflect()
// and classify() with no try/catch anywhere. It worked only because all three
// adapters happened to catch internally — the system depended on a politeness
// nothing verified.
//
// The rule under test is CLAUDE.md's: "Pipeline sources never throw. They
// return a result." Every port here declares its own shape for "I could not do
// this", and under a hostile provider it must return THAT, not raise.
//
// ADDING A NEW ADAPTER? Add it to the table below. If it cannot pass, it is not
// finished. The graph guards itself regardless (see `domain/classifier.ts` and
// `application/port-guards.ts`), but a guard catching your adapter every run is
// a defect being masked, not a defect being handled.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOk } from '../../collection/domain/result'
import { createNoopGate } from '../../test-support/gate'
import { createClassification, createConfidence } from '../domain/classification'
import { guardClassifier } from '../domain/classifier'
import { unwrap } from '../../collection/domain/result'
import { createGeminiClassifier } from './gemini/gemini-classifier'
import { createGeminiEnricher } from './gemini/gemini-enricher'
import { createGeminiReflector, createOpenRouterJudge } from './gemini/gemini-judge'

const TAXONOMY = [{ category: 'dairy', subCategories: ['dairy', 'eggs'] }]
const request = { productName: 'Emmi Milch', descriptor: null, retailer: 'denner' }
const answer = unwrap(
  createClassification({
    category: 'dairy',
    subCategory: 'dairy',
    confidence: unwrap(createConfidence(0.9)),
    tier: 1,
    model: 'test',
  }),
)

/** Every way a provider can be hostile short of being polite about it. */
const HOSTILE_PROVIDERS: readonly { readonly name: string; readonly fetch: () => Promise<Response> }[] = [
  { name: 'the socket dies', fetch: () => Promise.reject(new Error('ECONNRESET')) },
  { name: 'a 500', fetch: async () => new Response('upstream exploded', { status: 500 }) },
  { name: 'a 429', fetch: async () => new Response('{"error":{"code":429}}', { status: 429 }) },
  { name: 'a 404 retired model', fetch: async () => new Response('no longer available', { status: 404 }) },
  { name: '200 with HTML instead of JSON', fetch: async () => new Response('<html>502 Bad Gateway</html>', { status: 200 }) },
  { name: '200 with an empty body', fetch: async () => new Response('', { status: 200 }) },
  { name: 'a non-Error thrown value', fetch: () => Promise.reject('just a string') },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(HOSTILE_PROVIDERS)('when the provider answers with $name', ({ fetch: hostile }) => {
  const stub = () => vi.stubGlobal('fetch', hostile)

  it('Classifier returns Err rather than throwing', async () => {
    stub()
    const port = createGeminiClassifier({ apiKey: 'k', model: 'm', tier: 1, taxonomy: TAXONOMY, gate: createNoopGate() })

    const r = await port.classify([request])

    expect(isOk(r)).toBe(false)
  })

  it('Judge returns a verdict of "unavailable" rather than throwing', async () => {
    stub()
    const port = createOpenRouterJudge({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, gate: createNoopGate() })

    const { verdict, tokens } = await port.judge(request, { category: 'dairy', subCategory: 'dairy' })

    // Never 'correct'. A judge that died approved nothing.
    expect(verdict).toBe('unavailable')
    expect(tokens).toBe(0)
  })

  it('Reflector returns no revision rather than throwing', async () => {
    stub()
    const port = createGeminiReflector({ apiKey: 'k', model: 'm', taxonomy: TAXONOMY, gate: createNoopGate() })

    const { classification } = await port.reflect(request, answer)

    expect(classification).toBeNull()
  })

  it('Enricher returns a failed outcome rather than throwing — enrichment never costs a category', async () => {
    stub()
    const port = createGeminiEnricher({ apiKey: 'k', model: 'm', gate: createNoopGate() })

    const { outcomes } = await port.enrich([{ request, subCategory: 'dairy' }])

    // WP-P9: a hostile provider must be RECORDED, not silently dropped — an
    // absent map entry is indistinguishable from "asked and got nothing",
    // which is exactly the defect this port contract now guards against.
    expect(outcomes.get(request.productName)).toMatchObject({ kind: 'failed' })
  })
})

// guardClassifier is itself a Classifier, so the same contract binds it —
// including when the adapter it decorates is the one breaking the rules.
// (F6, code review: this used to go through resilientClassifier, deleted
// once it shrank to a one-line call to guardClassifier and nothing else.)
describe('a decorator is a port implementation too', () => {
  it('returns Err when the classifier it wraps throws instead of returning', async () => {
    const logged: string[] = []
    const port = guardClassifier(
      {
        name: 'rude-model',
        tier: 1,
        batchSize: 25,
        async classify(): Promise<never> {
          throw new Error('ECONNRESET')
        },
      },
      (m) => logged.push(m),
    )

    const r = await port.classify([request])

    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('ECONNRESET')
    // The guard logs the breach it caught, rather than a silent swallow —
    // WP-P5 moved rate/retry/circuit into ModelGate, but the port-contract
    // guard (a throw must come back as Err) still lives here.
    expect(logged.some((m) => m.includes('port contract breached'))).toBe(true)
  })
})
