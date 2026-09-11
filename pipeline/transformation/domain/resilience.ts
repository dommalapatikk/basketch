// Resilience — rate limits, retries, timeouts and the circuit breaker.
//
// Every policy here comes from something that actually happened on 2026-09-10:
//
//   429 RESOURCE_EXHAUSTED   gemini-3.5-flash is capped at 20 requests PER DAY
//                            on the free tier. We burned it in one bake-off and
//                            then "measured" a model that was refusing to answer,
//                            producing scores of 0.713 and 0.352 that meant
//                            nothing. A per-minute backoff cannot fix a per-day
//                            cap — the run must recognise the difference.
//   873 seconds              nemotron-3.5-lightning took 14 minutes for 65
//                            products. Without a timeout a weekly run can hang
//                            past the GitHub Actions job limit.
//   fetch failed             a transient network error killed a whole batch and
//                            its retry, silently costing 25 products.
//
// No sleeping inside the domain: this module DECIDES, the adapter waits.

import type { Result } from '../../collection/domain/result'
import { err, ok } from '../../collection/domain/result'

// ── Failure classification ───────────────────────────────────────────────────

export type FailureKind =
  /** Transient: network blip, 5xx. Retrying shortly is reasonable. */
  | 'transient'
  /** Rate limited, recoverable within this run. */
  | 'rate-limited-short'
  /** Quota exhausted for the day. Retrying THIS RUN is pointless. */
  | 'rate-limited-daily'
  /** The model no longer exists or was retired. Retrying never helps. */
  | 'model-gone'
  /** Bad request, bad key. Our fault; retrying repeats it. */
  | 'permanent'

/**
 * Classifies a provider failure from its status and message.
 *
 * The important distinction is short vs daily rate limiting. Treating a daily
 * cap as a transient error means retrying 500 times and reporting a model as
 * inaccurate when it was simply refusing to speak.
 */
export function classifyFailure(status: number | null, message: string): FailureKind {
  const m = message.toLowerCase()

  if (status === 429 || m.includes('resource_exhausted') || m.includes('rate limit')) {
    // Google names the quota in the error body; a per-day quota is unrecoverable
    // within a run no matter how long we back off.
    if (/perday|per day|requests per day|daily/i.test(message)) return 'rate-limited-daily'
    return 'rate-limited-short'
  }

  if (status === 404 || m.includes('no longer available') || m.includes('not found')) return 'model-gone'
  if (status === 401 || status === 403) return 'permanent'
  if (status !== null && status >= 500) return 'transient'
  if (m.includes('fetch failed') || m.includes('econnreset') || m.includes('etimedout') || m.includes('timeout')) {
    return 'transient'
  }
  if (status !== null && status >= 400) return 'permanent'
  return 'transient'
}

// ── Retry policy ─────────────────────────────────────────────────────────────

export type RetryPolicy = {
  /** TOTAL calls, including the first. maxAttempts: 3 means 3 calls, not 1 + 3. */
  readonly maxAttempts: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
}

export type RetryDecision =
  | { readonly retry: true; readonly delayMs: number; readonly attempt: number }
  | { readonly retry: false; readonly reason: string }

/**
 * Whether to retry, and how long to wait.
 *
 * `retryAfterMs` is the provider's own instruction (Google sends `retryDelay`,
 * OpenRouter a `Retry-After` header). It always wins over our guess — guessing
 * shorter is how a 429 becomes a ban.
 *
 * Jitter is deterministic, derived from the attempt number, so tests stay
 * reproducible and the domain stays free of Math.random.
 */
export function decideRetry(
  kind: FailureKind,
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY,
  retryAfterMs: number | null = null,
): RetryDecision {
  if (kind === 'model-gone') return { retry: false, reason: 'model no longer available — retrying cannot help' }
  if (kind === 'permanent') return { retry: false, reason: 'permanent failure — retrying repeats it' }
  if (kind === 'rate-limited-daily') {
    return { retry: false, reason: 'daily quota exhausted — no delay recovers this within the run' }
  }
  // `attempt` is zero-based and counts calls ALREADY made, so the last
  // permitted retry starts from attempt = maxAttempts - 1.
  if (attempt >= policy.maxAttempts - 1) {
    return { retry: false, reason: `exhausted ${policy.maxAttempts} attempts` }
  }

  if (retryAfterMs !== null && retryAfterMs > 0) {
    return { retry: true, delayMs: Math.min(retryAfterMs, policy.maxDelayMs), attempt: attempt + 1 }
  }

  const exponential = policy.baseDelayMs * 2 ** attempt
  // ±12.5%, derived from the attempt so repeated runs behave identically.
  const jitter = (exponential / 8) * (attempt % 2 === 0 ? 1 : -1)
  return { retry: true, delayMs: Math.min(Math.round(exponential + jitter), policy.maxDelayMs), attempt: attempt + 1 }
}

/** Parses `Retry-After` (seconds or HTTP date) and Google's `retryDelay` ("37s"). */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null
  const trimmed = value.trim()

  const googleStyle = trimmed.match(/^(\d+(?:\.\d+)?)s$/)
  if (googleStyle?.[1]) return Math.round(Number(googleStyle[1]) * 1000)

  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)

  const date = Date.parse(trimmed)
  if (Number.isFinite(date)) return Math.max(0, date - nowMs)

  return null
}

// ── Rate limiting ────────────────────────────────────────────────────────────

export type RateLimit = {
  readonly requestsPerMinute: number
  /** null when the provider publishes no daily cap. */
  readonly requestsPerDay: number | null
}

/** Measured 2026-09-10 against a real key. */
export const KNOWN_LIMITS: Record<string, RateLimit> = {
  'gemini-3.5-flash-lite': { requestsPerMinute: 15, requestsPerDay: 1000 },
  // 20/day, verified from the quota name in the 429 body. Unusable as a rung.
  'gemini-3.5-flash': { requestsPerMinute: 10, requestsPerDay: 20 },
  'openrouter-free': { requestsPerMinute: 20, requestsPerDay: 50 },
  'openrouter-paid': { requestsPerMinute: 20, requestsPerDay: 1000 },
}

export type RateState = {
  readonly requestsThisMinute: number
  readonly requestsToday: number
  readonly windowStartMs: number
}

export const FRESH_RATE_STATE: RateState = { requestsThisMinute: 0, requestsToday: 0, windowStartMs: 0 }

export type RateDecision =
  | { readonly proceed: true; readonly state: RateState }
  | { readonly proceed: false; readonly waitMs: number; readonly reason: string }

/**
 * Whether a request may go now.
 *
 * Deliberately pessimistic: it paces to 90% of the published limit. Discovering
 * the true ceiling by hitting it costs the whole run, as it did today.
 */
export function checkRate(limit: RateLimit, state: RateState, nowMs: number): RateDecision {
  const minuteElapsed = nowMs - state.windowStartMs >= 60_000
  const thisMinute = minuteElapsed ? 0 : state.requestsThisMinute
  const windowStart = minuteElapsed ? nowMs : state.windowStartMs

  if (limit.requestsPerDay !== null && state.requestsToday >= limit.requestsPerDay) {
    return { proceed: false, waitMs: -1, reason: `daily cap reached (${limit.requestsPerDay})` }
  }

  const perMinuteCeiling = Math.max(1, Math.floor(limit.requestsPerMinute * 0.9))
  if (thisMinute >= perMinuteCeiling) {
    return { proceed: false, waitMs: Math.max(0, 60_000 - (nowMs - windowStart)), reason: 'per-minute cap reached' }
  }

  return {
    proceed: true,
    state: { requestsThisMinute: thisMinute + 1, requestsToday: state.requestsToday + 1, windowStartMs: windowStart },
  }
}

// ── Circuit breaker ──────────────────────────────────────────────────────────

export type CircuitState = {
  readonly consecutiveFailures: number
  readonly open: boolean
  readonly reason: string | null
}

export const CIRCUIT_CLOSED: CircuitState = { consecutiveFailures: 0, open: false, reason: null }

/** Consecutive failures before we stop calling a provider for the rest of a run. */
export const CIRCUIT_THRESHOLD = 5

/**
 * A provider failing five times running is down, not unlucky.
 *
 * Without this, 72 batches each retry 3 times against a dead provider: 216
 * pointless calls, a run that takes an hour, and a rate limit earned for nothing.
 */
export function recordFailure(circuit: CircuitState, kind: FailureKind): CircuitState {
  if (kind === 'model-gone' || kind === 'permanent' || kind === 'rate-limited-daily') {
    return { consecutiveFailures: circuit.consecutiveFailures + 1, open: true, reason: kind }
  }
  const next = circuit.consecutiveFailures + 1
  return next >= CIRCUIT_THRESHOLD
    ? { consecutiveFailures: next, open: true, reason: `${next} consecutive failures` }
    : { consecutiveFailures: next, open: false, reason: null }
}

export function recordSuccess(): CircuitState {
  return CIRCUIT_CLOSED
}

// ── Latency ──────────────────────────────────────────────────────────────────

/**
 * Per-request timeout.
 *
 * nemotron-3.5-lightning took 873s for 65 products. A GitHub Actions job is
 * capped at 6 hours; a weekly run that hangs is a run that never reports.
 */
export const REQUEST_TIMEOUT_MS = 60_000

/** Whole-run ceiling, well under the Actions job limit. */
export const RUN_TIMEOUT_MS = 45 * 60_000

export type LatencyBudget = { readonly elapsedMs: number; readonly limitMs: number }

export function withinLatencyBudget(b: LatencyBudget): Result<true> {
  if (b.elapsedMs >= b.limitMs) {
    return err(`run exceeded its latency budget: ${Math.round(b.elapsedMs / 1000)}s of ${Math.round(b.limitMs / 1000)}s`)
  }
  return ok(true)
}
