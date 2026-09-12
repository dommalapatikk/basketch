import { describe, expect, it } from 'vitest'
import { isOk } from '../../collection/domain/result'
import {
  CIRCUIT_CLOSED,
  CIRCUIT_THRESHOLD,
  DEFAULT_RETRY,
  FRESH_RATE_STATE,
  KNOWN_LIMITS,
  checkRate,
  classifyFailure,
  decideRetry,
  parseRetryAfter,
  recordFailure,
  recordSuccess,
  withinLatencyBudget,
} from './resilience'

describe('classifyFailure — the distinction that cost us a bake-off', () => {
  it('separates a DAILY quota from a short rate limit', () => {
    // gemini-3.5-flash is 20 requests per DAY. Backing off cannot recover it,
    // and treating it as transient made us "measure" a model that was refusing
    // to answer — producing scores of 0.713 and 0.352 that meant nothing.
    expect(
      classifyFailure(429, 'Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier'),
    ).toBe('rate-limited-daily')
    expect(classifyFailure(429, 'Too many requests, slow down')).toBe('rate-limited-short')
  })

  it('recognises a retired model', () => {
    expect(classifyFailure(404, 'This model models/gemini-2.5-flash-lite is no longer available to new users')).toBe('model-gone')
  })

  it('treats auth failures as permanent', () => {
    expect(classifyFailure(401, 'invalid api key')).toBe('permanent')
    expect(classifyFailure(403, 'forbidden')).toBe('permanent')
  })

  it('treats 5xx and network errors as transient', () => {
    expect(classifyFailure(503, 'service unavailable')).toBe('transient')
    expect(classifyFailure(null, 'fetch failed')).toBe('transient')
    expect(classifyFailure(null, 'ECONNRESET')).toBe('transient')
  })
})

describe('decideRetry', () => {
  it('never retries a retired model', () => {
    const d = decideRetry('model-gone', 0)
    expect(d.retry).toBe(false)
    if (!d.retry) expect(d.reason).toContain('no longer available')
  })

  it('never retries a daily quota within the run', () => {
    expect(decideRetry('rate-limited-daily', 0).retry).toBe(false)
  })

  it('retries a transient failure with growing delay', () => {
    const a = decideRetry('transient', 0)
    const b = decideRetry('transient', 1)
    expect(a.retry && b.retry).toBe(true)
    if (a.retry && b.retry) expect(b.delayMs).toBeGreaterThan(a.delayMs)
  })

  it("obeys the provider's own Retry-After over our guess", () => {
    // Guessing shorter than instructed is how a 429 becomes a ban.
    const d = decideRetry('rate-limited-short', 0, DEFAULT_RETRY, 25_000)
    expect(d.retry && d.delayMs).toBe(25_000)
  })

  it('caps the delay so a run cannot stall indefinitely', () => {
    const d = decideRetry('transient', 0, DEFAULT_RETRY, 10 * 60_000)
    expect(d.retry && d.delayMs).toBe(DEFAULT_RETRY.maxDelayMs)
  })

  it('stops after the attempt limit', () => {
    expect(decideRetry('transient', DEFAULT_RETRY.maxAttempts).retry).toBe(false)
  })

  it('is deterministic — same inputs, same delay', () => {
    // attempt 1 still retries under maxAttempts: 3; attempt 2 is the last call.
    expect(decideRetry('transient', 1)).toEqual(decideRetry('transient', 1))
  })

  it('maxAttempts means TOTAL calls, not retries after the first', () => {
    // The name says attempts; the behaviour used to be retries, producing 4
    // calls for maxAttempts: 3.
    expect(decideRetry('transient', 0).retry).toBe(true)
    expect(decideRetry('transient', 1).retry).toBe(true)
    expect(decideRetry('transient', 2).retry).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it("reads Google's retryDelay format", () => {
    expect(parseRetryAfter('37s', 0)).toBe(37_000)
  })

  it('reads plain seconds', () => {
    expect(parseRetryAfter('30', 0)).toBe(30_000)
  })

  it('reads an HTTP date', () => {
    const now = Date.parse('2026-09-10T12:00:00Z')
    expect(parseRetryAfter('Thu, 10 Sep 2026 12:00:30 GMT', now)).toBe(30_000)
  })

  it('returns null for nonsense rather than guessing', () => {
    expect(parseRetryAfter(null, 0)).toBeNull()
    expect(parseRetryAfter('soon', 0)).toBeNull()
  })
})

describe('checkRate — pace to 90%, never discover the ceiling by hitting it', () => {
  const limit = KNOWN_LIMITS['gemini-3.5-flash-lite']!

  it('allows a request when well under the limit', () => {
    expect(checkRate(limit, FRESH_RATE_STATE, 1000).proceed).toBe(true)
  })

  it('holds back before the published per-minute limit', () => {
    const ceiling = Math.floor(limit.requestsPerMinute * 0.9)
    const d = checkRate(limit, { requestsThisMinute: ceiling, requestsToday: 0, windowStartMs: 1000 }, 2000)
    expect(d.proceed).toBe(false)
    if (!d.proceed) expect(d.reason).toContain('per-minute')
  })

  it('refuses outright at the daily cap — no wait recovers it', () => {
    const d = checkRate(limit, { requestsThisMinute: 0, requestsToday: 1000, windowStartMs: 0 }, 1000)
    expect(d.proceed).toBe(false)
    if (!d.proceed) expect(d.waitMs).toBe(-1)
  })

  it('resets the per-minute window after 60s', () => {
    const d = checkRate(limit, { requestsThisMinute: 99, requestsToday: 1, windowStartMs: 0 }, 61_000)
    expect(d.proceed).toBe(true)
    if (d.proceed) expect(d.state.requestsThisMinute).toBe(1)
  })

  it('knows gemini-3.5-flash is 20/day — unusable as a pipeline rung', () => {
    expect(KNOWN_LIMITS['gemini-3.5-flash']?.requestsPerDay).toBe(20)
  })
})

describe('circuit breaker', () => {
  it('opens immediately on an unrecoverable failure', () => {
    expect(recordFailure(CIRCUIT_CLOSED, 'model-gone').open).toBe(true)
    expect(recordFailure(CIRCUIT_CLOSED, 'rate-limited-daily').open).toBe(true)
    expect(recordFailure(CIRCUIT_CLOSED, 'permanent').open).toBe(true)
  })

  it('tolerates transient failures until the threshold', () => {
    let c = CIRCUIT_CLOSED
    for (let i = 0; i < CIRCUIT_THRESHOLD - 1; i++) c = recordFailure(c, 'transient')
    expect(c.open).toBe(false)
    c = recordFailure(c, 'transient')
    expect(c.open).toBe(true)
  })

  it('resets on success', () => {
    let c = CIRCUIT_CLOSED
    c = recordFailure(c, 'transient')
    c = recordFailure(c, 'transient')
    expect(recordSuccess().consecutiveFailures).toBe(0)
  })
})

describe('latency budget', () => {
  it('permits a run inside its budget', () => {
    expect(isOk(withinLatencyBudget({ elapsedMs: 60_000, limitMs: 45 * 60_000 }))).toBe(true)
  })

  it('stops a run that would hang past the CI job limit', () => {
    // nemotron-3.5-lightning took 873s for 65 products. A hung run never reports.
    const r = withinLatencyBudget({ elapsedMs: 46 * 60_000, limitMs: 45 * 60_000 })
    expect(isOk(r)).toBe(false)
  })
})

describe('a per-minute limit is not a per-day limit', () => {
  /**
   * MEASURED against the live API, 2026-09-12:
   *
   *   quotaId    = GenerateRequestsPerMinutePerProjectPerModel-FreeTier
   *   value      = 15
   *   retryDelay = 31s
   *
   * The free tier's binding constraint is 15 requests per MINUTE, recoverable
   * in half a minute. Our runs reported "daily quota exhausted — no delay
   * recovers this within the run" and abandoned seven of eight chunks, while a
   * burst of 16 calls a moment later succeeded.
   *
   * Getting this wrong is expensive in one direction only: a per-minute limit
   * misread as daily abandons a run that would have finished after a pause.
   * The reverse merely wastes a few retries.
   */
  it('reads Google\'s per-minute violation as short, not daily', () => {
    const body =
      'HTTP 429: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. ' +
      'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",' +
      '"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure",' +
      '"violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests",' +
      '"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaValue":"15"}]},' +
      '{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"31s"}]}}'
    expect(classifyFailure(429, body)).toBe('rate-limited-short')
  })

  it('still reads a genuine per-day violation as daily', () => {
    const body =
      'HTTP 429: {"error":{"status":"RESOURCE_EXHAUSTED","details":[{"violations":[' +
      '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"200"}]}]}}'
    expect(classifyFailure(429, body)).toBe('rate-limited-daily')
  })

  it('does not call a per-minute limit daily just because "PerDay" appears elsewhere', () => {
    // Google lists several quotas in one body. Matching the word anywhere in
    // the payload would abandon a run that only needed to wait 31 seconds.
    const body =
      'HTTP 429: {"error":{"details":[{"violations":[' +
      '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaValue":"15"}]},' +
      '{"note":"see also GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}'
    expect(classifyFailure(429, body)).toBe('rate-limited-short')
  })
})
