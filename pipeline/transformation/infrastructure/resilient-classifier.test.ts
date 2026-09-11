import { describe, expect, it } from 'vitest'
import { err, isOk, ok, unwrap } from '../../collection/domain/result'
import { createClassification, createConfidence } from '../domain/classification'
import type { ClassificationOutcome, Classifier } from '../domain/classifier'
import { CIRCUIT_THRESHOLD, ERROR_BODY_CHARS, KNOWN_LIMITS } from '../domain/resilience'
import { GOOGLE_429_BODY, GOOGLE_429_PER_MINUTE_BODY } from '../__fixtures__/google-429'
import { resilientClassifier } from './resilient-classifier'

const req = (productName: string) => ({ productName, descriptor: null, retailer: 'denner' })

/** Exactly what gemini-classifier hands back for a failed response, truncation and all. */
const adapterError = (responseBody: string) =>
  `provider-unavailable: HTTP 429: ${responseBody.slice(0, ERROR_BODY_CHARS)}`

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

  // REGRESSION. The test above passes a hand-written 35-character error string,
  // so it never noticed that the adapter truncated the real body at 200 chars
  // and threw retryDelay away before this code could ever see it. These two use
  // the error string the adapter ACTUALLY produces.
  it('obeys retryDelay in a real Google 429 body, not just a tidy one', async () => {
    const s = scripted([adapterError(GOOGLE_429_PER_MINUTE_BODY), 'ok'])
    await make(s.inner).classify([req('Milch')])

    // 37s capped to maxDelayMs. Truncated at 200 this was the ~1s exponential
    // guess instead — five times too short, against a provider that had just
    // told us how long to wait.
    expect(slept[0]).toBe(30_000)
  })

  it('reads a real per-day cap as unrecoverable instead of retrying it', async () => {
    const s = scripted([adapterError(GOOGLE_429_BODY), 'ok'])
    const r = await make(s.inner).classify([req('Milch')])

    // "PerDay" sits ~460 chars in, so the 200-char cut hid it and we burned the
    // retry budget on a cap no backoff recovers inside a run.
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.error).toContain('rate-limited-daily')
    expect(s.calls()).toBe(1)
    expect(slept).toEqual([])
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

describe('a port failure is a value, not an exception', () => {
  /**
   * THE WIDEST HOLE FOUND ON 2026-09-11.
   *
   * This wrapper exists to absorb provider failure — rate limits, backoff, the
   * circuit breaker. But `inner.classify` was called unguarded, so a classifier
   * that THROWS escapes past classifyFailure, recordFailure and the breaker
   * entirely. The layer built to absorb provider failure was bypassed by the
   * commonest form of provider failure.
   *
   * It was masked only because createGeminiClassifier catches internally and
   * returns `err`. The wrapper was depending on an adapter's politeness.
   *
   * A throw is not a new state here — `err` already exists in the return type.
   * It is an existing state arriving by the wrong mechanism.
   */
  const throwing: Classifier = {
    name: 'throwing',
    tier: 1,
    batchSize: 25,
    async classify() {
      throw new Error('ECONNRESET')
    },
  }

  const req = [{ productName: 'Emmi Milch', descriptor: null, retailer: 'denner' }]

  it('returns a failure instead of taking the run down', async () => {
    const c = resilientClassifier({ inner: throwing, sleep: async () => {} })
    const res = await c.classify(req as never)
    expect(isOk(res)).toBe(false)
  })

  it('names the thrown error so a CI log can explain the failure', async () => {
    const c = resilientClassifier({ inner: throwing, sleep: async () => {} })
    const res = await c.classify(req as never)
    expect(isOk(res)).toBe(false)
    if (!isOk(res)) expect(res.error).toMatch(/ECONNRESET/)
  })

  it('feeds the throw through the breaker rather than around it', async () => {
    // The half that matters. A crash that skips recordFailure leaves the
    // circuit permanently closed over a dead provider, so the run keeps
    // hammering it. Five consecutive failures must still open it.
    //
    // Uses `make`, not a bare construction: retrying a throw three times per
    // call burns rate slots, and with a FROZEN clock the per-minute window never
    // reopens, so the limiter answers before the breaker ever gets to. That is
    // the trap this file's `make` helper was written to avoid.
    const c = make(throwing)
    for (let i = 0; i < 6; i++) await c.classify(req as never)
    const last = await c.classify(req as never)
    // Unconditional FIRST. With the assertion inside `if (!isOk(last))` the
    // whole test passed with ZERO assertions executed whenever the breaker
    // failed to open — which is the one outcome it exists to rule out.
    expect(isOk(last)).toBe(false)
    if (!isOk(last)) expect(last.error).toMatch(/circuit|open/i)
  })
})
