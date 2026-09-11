// resilientClassifier — rate limiting, retry and a circuit breaker, applied.
//
// THE GAP THIS CLOSES: `resilience.ts` was written with 25 tests and then
// called by nothing. The Gemini adapter had NO retry of any kind — a single 429
// failed a whole batch of 25 products, and we hit 429s repeatedly on 2026-09-10
// while measuring models.
//
// A DECORATOR, not a change to each adapter. Both Gemini and OpenRouter get the
// same behaviour, and the retry logic stays testable without a network.
//
// WHAT IT KNOWS THAT A GENERIC RETRY DOES NOT:
//
//   daily quota      gemini-3.5-flash is 20 requests PER DAY. No backoff
//                    recovers that within a run, so it stops instead of
//                    sleeping through the whole job.
//   retired model    404 "no longer available" — retrying never helps.
//   Retry-After      the provider's own instruction always beats our guess.
//                    Guessing shorter is how a 429 becomes a ban.

import { type Result, isOk } from '../../collection/domain/result'
import type { ClassificationOutcome, ClassificationRequest, Classifier } from '../domain/classifier'
import {
  CIRCUIT_CLOSED,
  type CircuitState,
  DEFAULT_RETRY,
  FRESH_RATE_STATE,
  KNOWN_LIMITS,
  type RateLimit,
  type RateState,
  type RetryPolicy,
  checkRate,
  classifyFailure,
  decideRetry,
  parseRetryAfter,
  recordFailure,
  recordSuccess,
} from '../domain/resilience'

export type ResilientDeps = {
  inner: Classifier
  limit?: RateLimit
  policy?: RetryPolicy
  /** Injected so tests never actually wait. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (message: string) => void
}

/** Pulls an HTTP status out of an adapter's error string. */
function statusFrom(error: string): number | null {
  const m = error.match(/HTTP (\d{3})|"code":\s*(\d{3})|\b(\d{3})\b/)
  const raw = m?.[1] ?? m?.[2] ?? m?.[3]
  const n = raw ? Number(raw) : Number.NaN
  return n >= 100 && n < 600 ? n : null
}

export function resilientClassifier(deps: ResilientDeps): Classifier {
  const inner = deps.inner
  const limit = deps.limit ?? KNOWN_LIMITS[inner.name] ?? { requestsPerMinute: 15, requestsPerDay: 1000 }
  const policy = deps.policy ?? DEFAULT_RETRY
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? (() => {})

  // State lives across calls within one run — a per-call limiter would never
  // see the rate it is supposed to limit.
  let rate: RateState = FRESH_RATE_STATE
  let circuit: CircuitState = CIRCUIT_CLOSED

  return {
    name: inner.name,
    tier: inner.tier,
    batchSize: inner.batchSize,

    async classify(batch: readonly ClassificationRequest[]): Promise<Result<readonly ClassificationOutcome[]>> {
      if (batch.length === 0) return inner.classify(batch)

      // A provider that has failed five times running is down, not unlucky.
      // Without this, 72 batches x 3 retries = 216 pointless calls against a
      // dead provider, and a rate limit earned for nothing.
      if (circuit.open) {
        return { ok: false, error: `circuit-open: ${circuit.reason}` }
      }

      // Bounded so a frozen or slow clock cannot spin: each wait is one tick,
      // and a limiter that never opens fails loudly instead of hanging.
      let rateWaits = 0
      const MAX_RATE_WAITS = 5

      for (let attempt = 0; ; ) {
        const gate = checkRate(limit, rate, now())
        if (!gate.proceed) {
          if (gate.waitMs < 0) {
            // Daily cap. Sleeping cannot recover it inside this run.
            circuit = recordFailure(circuit, 'rate-limited-daily')
            return { ok: false, error: `rate-limited-daily: ${gate.reason}` }
          }
          if (++rateWaits > MAX_RATE_WAITS) {
            return { ok: false, error: `rate-limited: ${gate.reason}, still blocked after ${MAX_RATE_WAITS} waits` }
          }
          log(`${inner.name}: ${gate.reason}, waiting ${Math.round(gate.waitMs / 1000)}s`)
          await sleep(gate.waitMs)
          continue
        }
        rate = gate.state

        const result = await inner.classify(batch)
        if (isOk(result)) {
          circuit = recordSuccess()
          return result
        }

        const kind = classifyFailure(statusFrom(result.error), result.error)
        const retryAfter = parseRetryAfter(result.error.match(/retryDelay["\s:]+([\d.]+s)/)?.[1] ?? null, now())
        const decision = decideRetry(kind, attempt, policy, retryAfter)

        if (!decision.retry) {
          circuit = recordFailure(circuit, kind)
          log(`${inner.name}: giving up after attempt ${attempt + 1} — ${decision.reason}`)
          return { ok: false, error: `${kind}: ${result.error}` }
        }

        log(`${inner.name}: ${kind}, retrying in ${Math.round(decision.delayMs / 1000)}s (attempt ${decision.attempt})`)
        await sleep(decision.delayMs)
        attempt = decision.attempt
      }
    },
  }
}
