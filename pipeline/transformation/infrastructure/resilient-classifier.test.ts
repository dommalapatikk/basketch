import { describe, expect, it } from 'vitest'
import { err, isOk, ok, unwrap } from '../../collection/domain/result'
import { createClassification, createConfidence } from '../domain/classification'
import type { ClassificationOutcome, Classifier } from '../domain/classifier'
import { CIRCUIT_THRESHOLD, KNOWN_LIMITS } from '../domain/resilience'
import { resilientClassifier } from './resilient-classifier'

const req = (productName: string) => ({ productName, descriptor: null, retailer: 'denner' })

const cls = () =>
  unwrap(createClassification({ category: 'dairy', subCategory: 'dairy', confidence: unwrap(createConfidence(0.9)), tier: 1, model: 'm' }))

/** Returns the scripted results in order, then succeeds forever. */
function scripted(script: (string | 'ok')[], name = 'gemini-3.5-flash-lite'): { inner: Classifier; calls: () => number } {
  let i = 0
  return {
    calls: () => i,
    inner: {
      name,
      tier: 1,
      batchSize: 25,
      async classify(batch) {
        const step = script[i++] ?? 'ok'
        if (step === 'ok') {
          return ok(batch.map((request): ClassificationOutcome => ({ ok: true, request, classification: cls() })))
        }
        return err(step)
      },
    },
  }
}

const slept: number[] = []
/**
 * A clock that advances when we sleep, as a real one does. A FROZEN clock makes
 * the per-minute window never reset, which is how the circuit-breaker test
 * originally spun for 8.7 seconds.
 */
const make = (inner: Classifier, log?: (m: string) => void) => {
  slept.length = 0
  let clock = 1_000_000
  return resilientClassifier({
    inner,
    sleep: async (ms) => {
      slept.push(ms)
      clock += ms
    },
    now: () => clock,
    log,
  })
}

describe('retrying a transient failure', () => {
  it('recovers from a 503 on the second attempt', async () => {
    // Before this decorator the Gemini adapter had NO retry: one 503 killed a
    // whole batch of 25 products.
    const s = scripted(['HTTP 503 service unavailable', 'ok'])
    const r = await make(s.inner).classify([req('Milch')])
    expect(isOk(r)).toBe(true)
    expect(s.calls()).toBe(2)
    expect(slept.length).toBe(1)
  })

  it('recovers from a network blip', async () => {
    const s = scripted(['provider-unavailable: fetch failed', 'ok'])
    expect(isOk(await make(s.inner).classify([req('Milch')]))).toBe(true)
  })

  it('gives up after the attempt limit rather than looping', async () => {
    const s = scripted(['HTTP 503', 'HTTP 503', 'HTTP 503', 'HTTP 503', 'HTTP 503'])
    const r = await make(s.inner).classify([req('Milch')])
    expect(isOk(r)).toBe(false)
    expect(s.calls()).toBe(3) // maxAttempts: 3 means THREE calls, not 1 + 3
  })

  it('backs off further each attempt', async () => {
    const s = scripted(['HTTP 503', 'HTTP 503', 'ok'])
    await make(s.inner).classify([req('Milch')])
    expect(slept[1]).toBeGreaterThan(slept[0] as number)
  })
})

describe('the failures that retrying cannot fix', () => {
  it('does not retry a DAILY quota — no backoff recovers it within a run', async () => {
    // gemini-3.5-flash is 20 requests PER DAY. Sleeping through the job would
    // burn the whole run on a model that will not answer again today.
    const s = scripted(['429 Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier'])
    const r = await make(s.inner).classify([req('Milch')])
    expect(isOk(r)).toBe(false)
    expect(s.calls()).toBe(1)
    expect(slept.length).toBe(0)
  })

  it('does not retry a retired model', async () => {
    const s = scripted(['HTTP 404 This model is no longer available to new users'])
    const r = await make(s.inner).classify([req('Milch')])
    expect(isOk(r)).toBe(false)
    expect(s.calls()).toBe(1)
  })

  it('does not retry a bad api key', async () => {
    const s = scripted(['HTTP 401 invalid key'])
    await make(s.inner).classify([req('Milch')])
    expect(s.calls()).toBe(1)
  })
})

describe("obeying the provider's own Retry-After", () => {
  it('waits exactly as instructed rather than guessing', async () => {
    // Guessing shorter than instructed is how a 429 becomes a ban.
    const s = scripted(['429 rate limit, "retryDelay": "37s"', 'ok'])
    await make(s.inner).classify([req('Milch')])
    expect(slept[0]).toBe(30_000) // capped at maxDelayMs
  })
})

describe('the circuit breaker', () => {
  it('opens after repeated failures and stops calling the provider', async () => {
    // Without this, 72 batches x 3 retries = 216 pointless calls against a dead
    // provider, and a rate limit earned for nothing.
    const alwaysDown: Classifier = {
      name: 'down',
      tier: 1,
      batchSize: 25,
      async classify() {
        return err('HTTP 503')
      },
    }
    const c = make(alwaysDown)
    for (let i = 0; i < CIRCUIT_THRESHOLD; i++) await c.classify([req(`p${i}`)])

    const r = await c.classify([req('after')])
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('circuit-open')
  })

  it('opens immediately on a daily quota, without waiting for five failures', async () => {
    const s = scripted(['429 requests per day exceeded'])
    const c = make(s.inner)
    await c.classify([req('a')])
    const r = await c.classify([req('b')])
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('circuit-open')
  })

  it('resets after a success', async () => {
    const s = scripted(['HTTP 503', 'ok', 'HTTP 503', 'ok'])
    const c = make(s.inner)
    expect(isOk(await c.classify([req('a')]))).toBe(true)
    expect(isOk(await c.classify([req('b')]))).toBe(true)
  })
})

describe('rate limiting', () => {
  it('knows the real per-model limits measured against a live key', () => {
    expect(KNOWN_LIMITS['gemini-3.5-flash']?.requestsPerDay).toBe(20)
    expect(KNOWN_LIMITS['gemini-3.5-flash-lite']?.requestsPerDay).toBe(1000)
  })

  it('passes an empty batch straight through without spending a slot', async () => {
    const s = scripted(['ok'])
    await make(s.inner).classify([])
    expect(slept.length).toBe(0)
  })
})

describe('logging', () => {
  it('says why it is waiting, so a slow run is explicable', async () => {
    const lines: string[] = []
    const s = scripted(['HTTP 503', 'ok'])
    await make(s.inner, (m) => lines.push(m)).classify([req('Milch')])
    expect(lines.join(' ')).toContain('retrying')
  })
})
