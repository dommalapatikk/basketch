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
    // ⚠️ MATCH THE VIOLATED QUOTA, NOT THE WHOLE BODY. Google lists several
    // quotas in one 429, so a stray mention of a per-day one made us abandon a
    // run that only needed a 31-second pause. Measured live 2026-09-12, the
    // binding free-tier constraint is:
    //
    //   quotaId    GenerateRequestsPerMinutePerProjectPerModel-FreeTier
    //   value      15
    //   retryDelay 31s
    //
    // Raising ERROR_BODY_CHARS 200 -> 2000, needed to recover retryDelay, is
    // what let those extra quota names into this string. The asymmetry matters:
    // a per-minute limit misread as daily abandons a run that would have
    // finished; the reverse costs only a few retries.
    const perMinuteQuota = /perminute|per minute|requests per minute/i.test(message)
    const perDayQuota = /perday|per day|requests per day|daily/i.test(message)
    if (perDayQuota && !perMinuteQuota) return 'rate-limited-daily'
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

/**
 * The ceiling `rate-limited-short` obeys instead of `policy.maxDelayMs`.
 *
 * MEASURED 2026-09-14 (run 34833209176): Google's own `retryDelay` was 57s —
 * nearly double `DEFAULT_RETRY.maxDelayMs` (30s). `decideRetry` used to cap
 * every provider instruction at `maxDelayMs`, so a run backed off for 30s,
 * asked again, and got exactly the 429 it would have gotten by waiting the
 * full 57s in the first place. That is how a backfill of 1,107 products fired
 * ~250 requests in 20 seconds and got 255 of them refused.
 *
 * 90s, not "whatever Google asks": a provider that is lying, or a bug that
 * mis-parses a huge number, must still not stall a run indefinitely — a
 * SEPARATE ceiling, not the same one used for a guessed exponential backoff.
 */
export const PROVIDER_WAIT_CEILING_MS = 90_000

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
    // WP-P5 / RCA item 6: `rate-limited-short` is Google (or OpenRouter) TELLING
    // us exactly how long the bucket needs to refill — 57s was measured live on
    // 2026-09-14. Capping that at `policy.maxDelayMs` (30s, sized for a GUESSED
    // exponential backoff) doesn't shorten the wait, it just buys one more 429:
    // the bucket is not back until 57s regardless of what we do in the
    // meantime. `PROVIDER_WAIT_CEILING_MS` is a much longer, separate ceiling
    // that exists only to stop a run stalling indefinitely on a provider that
    // is lying or misconfigured — it is not a substitute guess.
    const ceiling = kind === 'rate-limited-short' ? PROVIDER_WAIT_CEILING_MS : policy.maxDelayMs
    return { retry: true, delayMs: Math.min(retryAfterMs, ceiling), attempt: attempt + 1 }
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

/**
 * Whole-run ceiling — THE ONE DEFINITION OF THE STEP TIMEOUT.
 *
 * Must equal `timeout_minutes` on the "Categorize and store (with retry)"
 * step in `pipeline.yml`. A second, uncoordinated number living only in the
 * workflow file is how a threshold silently drifts from the code that is
 * supposed to stay inside it — `alerts.ts`'s `run-slow` warning derives its
 * own threshold from this constant for the same reason (F6, code review of
 * the first WP-P3 submission) — see the config test in `config.test.ts`,
 * which reads the workflow file and asserts the full deadline inequality
 * below, not merely `RUN_DEADLINE_MS < RUN_TIMEOUT_MS`.
 *
 * 60, not 45 (F1 ruling, Tech Lead, 2026-09-16): raised alongside
 * `RUN_DEADLINE_MS` dropping to 28 — see that constant's comment for why 45
 * was unsafe. **After WP-P6 (judge concurrency) lands, this deadline must be
 * RE-DERIVED from the same inequality with re-measured constants — 28 is not
 * a magic number, it is 60 minus three OTHER measured numbers, and P6 is
 * expected to shrink `MAX_CHUNK_MS` substantially.**
 */
export const RUN_TIMEOUT_MS = 60 * 60_000

/**
 * Duration of ONE classification chunk (100 products: tier-1 batches, judge
 * escalations, enrichment) against the free tier's ~15 req/min pacing.
 *
 * N4 (code review, round 2): NOT a p99 — the first WP-P3 submission called it
 * one, but it is the MAX of four chunks actually observed on run
 * 34833209176 (attempt 2): 1042.9s, 1165.8s, 1064.7s, 313.4s. Four samples
 * cannot support a percentile claim, and nothing here BOUNDS a chunk — a 429
 * storm honouring `Retry-After` up to 90s per call (WP-P5's `ModelCallPolicy`)
 * can push a real chunk past this. `checkChunkDuration` below WARNS the
 * first time that happens instead of silently trusting a four-sample
 * observation forever.
 */
export const MAX_CHUNK_MS = 19.5 * 60_000

/**
 * The WRITE TAIL: everything AFTER the last classification chunk returns —
 * taxonomy resolution, product resolution, `storeDeals`, enrichment, v3
 * cutover (since retired, 2026-09-25), the sweep, expiring old deals,
 * `logRun`. THE PART THE FIRST
 * WP-P3 SUBMISSION LEFT OUT OF THE ARITHMETIC (code review F1): T1 bounds
 * the START of a classification chunk, never the process as a whole, so a
 * deadline placed with only `MAX_CHUNK_MS` of headroom can still let the
 * process overshoot `RUN_TIMEOUT_MS` by exactly this much.
 *
 * Measured against run 34833209176, attempt 2 (last classify chunk logged at
 * 11:41:38, "Pipeline complete" at 11:50:53 — 9m15s) and cross-checked
 * against run 34718508157. Logged as its own line every run
 * (`runTransform`'s "write tail" log) so this number stays measurable from a
 * normal run instead of rotting into folklore — WP-P7 will feed it into the
 * stored run metrics.
 *
 * N4: SCALES WITH DEAL COUNT, not fixed. 9m15s over that run's ~1,500 deals
 * ≈ 0.37s/deal. The live site was 1,213 deals when this constant was
 * measured and is 1,523 and rising — at 0.37s/deal, ~3,000 deals ≈ 18.5 min,
 * which alone would break the F1 inequality (28 + 19.5 + 18.5 + 2 = 68 > 60).
 * Re-derive this constant from a fresh measurement at the THEN-current deal
 * count, not from this comment — `checkWriteTailDuration` below WARNS when
 * a real run exceeds it, so drift is caught rather than assumed away.
 */
export const WRITE_TAIL_MS = 9.5 * 60_000

/** Headroom against measurement noise in `MAX_CHUNK_MS` and `WRITE_TAIL_MS`. */
export const SAFETY_MARGIN_MS = 2 * 60_000

/**
 * N4 (code review, round 2): both constants above are OBSERVATIONS, not
 * physical limits, and nothing forces them to stay true as the model's
 * latency, the retry policy or the deal count changes. Making them DYNAMIC
 * (re-measured and self-adjusting every run) is the wrong weight for a
 * threshold nobody should need to think about weekly — it would hide a real
 * regression behind a number that quietly absorbs it. A WARN, fired the
 * moment a real run exceeds what the constant claims, is the right weight:
 * loud enough that "the arithmetic behind the deadline no longer holds" is
 * read in the log the FIRST time it stops holding, cheap enough to ship
 * without a dashboard.
 */
const RUN_34833209176 = 'run 34833209176'

/** `null` when `chunkMs` is within `MAX_CHUNK_MS`; otherwise a log-ready warning naming both the constant and the run it was measured from. */
export function checkChunkDuration(chunkMs: number): string | null {
  if (chunkMs <= MAX_CHUNK_MS) return null
  return (
    `chunk took ${(chunkMs / 1000).toFixed(1)}s — longer than MAX_CHUNK_MS ` +
    `(${(MAX_CHUNK_MS / 1000).toFixed(1)}s, set from the max of four chunks on ${RUN_34833209176}). ` +
    'The arithmetic behind RUN_DEADLINE_MS no longer holds — re-measure and update the constant in transformation/domain/resilience.ts.'
  )
}

/** `null` when `writeTailMs` is within `WRITE_TAIL_MS`; otherwise a log-ready warning naming both the constant and the run it was measured from. */
export function checkWriteTailDuration(writeTailMs: number): string | null {
  if (writeTailMs <= WRITE_TAIL_MS) return null
  return (
    `write tail took ${(writeTailMs / 1000).toFixed(1)}s — longer than WRITE_TAIL_MS ` +
    `(${(WRITE_TAIL_MS / 1000).toFixed(1)}s, set from ${RUN_34833209176}, attempt 2, at ~1,500 deals). ` +
    'The arithmetic behind RUN_DEADLINE_MS no longer holds — re-measure and update the constant in transformation/domain/resilience.ts.'
  )
}

/**
 * In-process deadline (WP-P3 / RCA T1): stop starting new classification
 * chunks after this long, so the process can persist what it has and exit
 * ON PURPOSE — with a chosen code — before `RUN_TIMEOUT_MS` kills it from
 * outside.
 *
 * This is not cosmetic. Verified against nick-fields/retry's own source
 * (`index.ts:91-120, 147`): a process killed by the external `timeout_minutes`
 * is SIGTERM'd, its `exit` handler returns early for that signal
 * (`index.ts:96-98`), and `exit` is never set — it stays 0. `retry_on_exit_code:
 * 75` then requires `75 === exit` to retry (`index.ts:147`); 0 never matches,
 * so an externally-killed run is NOT retried, it just fails. Calling
 * `process.exit(75)` ourselves, before that line is crossed, is the only way
 * `retry_on_exit_code` ever fires for a slow run.
 *
 * THE INVARIANT (F1 ruling): `RUN_DEADLINE_MS + MAX_CHUNK_MS + WRITE_TAIL_MS +
 * SAFETY_MARGIN_MS ≤ RUN_TIMEOUT_MS`. Not "leaves N minutes for the write
 * pipeline" as prose — `config.test.ts` asserts this exact sum, because a
 * threshold at the kill line can never be observed, and prose that merely
 * SOUNDS like it leaves room is exactly what let 35 (of the old 45) miss the
 * write tail entirely: 28 + 19.5 + 9.5 + 2 = 59 ≤ 60.
 */
export const RUN_DEADLINE_MS = 28 * 60_000

export type DeadlineCheck = { readonly withinDeadline: true } | { readonly withinDeadline: false; readonly reason: string }

/**
 * Pure: given "now" and the deadline, are we still inside the budget?
 *
 * No `Date.now()` in here — the caller supplies both, so a test can pin any
 * point in the run without waiting on the wall clock (the same pattern
 * `finishRun`'s injected `now` already established).
 */
export function checkDeadline(nowMs: number, deadlineAtMs: number): DeadlineCheck {
  if (nowMs >= deadlineAtMs) {
    return { withinDeadline: false, reason: `run deadline of ${new Date(deadlineAtMs).toISOString()} reached` }
  }
  return { withinDeadline: true }
}

/**
 * How much of a failed response body to keep in the error message.
 *
 * This is not cosmetic. Everything above that decides WHAT TO DO NEXT is parsed
 * back out of that string, and Google puts it a long way in:
 *
 *   ~char 460   quotaId "...PerDayPerProjectPerModel-FreeTier"  → rate-limited-daily
 *   ~char 900   error.details[].RetryInfo.retryDelay "37s"      → the provider's own instruction
 *
 * The adapters truncated at 200, so `classifyFailure` never saw "PerDay" and
 * `resilientClassifier`'s retryDelay regex never matched. Every 429 was read as
 * a generic short rate limit and backed off on a guess — directly contradicting
 * "the provider's own instruction always beats our guess" above. 2000 clears
 * both fields with room for Google to add another details[] entry.
 */
export const ERROR_BODY_CHARS = 2_000

export type LatencyBudget = { readonly elapsedMs: number; readonly limitMs: number }

export function withinLatencyBudget(b: LatencyBudget): Result<true> {
  if (b.elapsedMs >= b.limitMs) {
    return err(`run exceeded its latency budget: ${Math.round(b.elapsedMs / 1000)}s of ${Math.round(b.limitMs / 1000)}s`)
  }
  return ok(true)
}
