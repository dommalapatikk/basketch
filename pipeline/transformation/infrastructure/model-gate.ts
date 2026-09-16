// ModelGate — one quota gate per (provider, model). WP-P5 / RCA item 6.
//
// THE DEFECT THIS CLOSES, measured on run 34833209176:
//
//   classifier   rate-limited by `resilientClassifier`, state private to
//                that ONE instance
//   reflector    called `postJson` directly. No limiter at all.
//   enricher     called `postJson` directly. No limiter at all.
//
// All three are the SAME Gemini project and the SAME model, so Google counts
// every call from all three against ONE 15-requests-per-minute bucket. The
// quota's scope is (project, model); the old limiter's scope was "one port
// instance". Nothing forced the two to match, and a backfill of 1,107
// products fired ~250 requests in 20 seconds and got 255 of them refused —
// `backfilled 0/100` logged as if nothing had gone wrong.
//
// THE FIX: one `ModelGate`, built ONCE per (provider, model) by the
// composition root, injected into `postJson` at every call site for that
// model. `model-http.test.ts` already fails the build if any infrastructure
// file calls `fetch` directly; making the gate a REQUIRED argument of
// `postJson` turns "every model call shares its model's quota" into a
// property of the code, in the same choke point that already carries the
// timeout.
//
// BOUNDARY (Tech Lead ruling, D1): this gate owns TRANSPORT and QUOTA only —
// rate, the provider's own Retry-After/retryDelay, the circuit breaker and an
// in-flight limit. It never inspects a response BODY for content (truncation,
// an unparseable answer, missing indices) — those stay in each adapter, which
// is the only place that knows what a valid answer looks like.
//
// SEAM FOR WP-P6 (judge concurrency): raise `ModelSpec.maxInFlight` for the
// judge model in `model-registry.ts`. Nothing else changes — the semaphore
// below already admits up to `policy.maxInFlight` concurrent attempts.
//
// SEAM FOR WP-P8 (spend): add a `settle`/`authorise` step around `attempt()`
// inside `request()`, using the same acquire → attempt → release shape the
// rate and in-flight checks already use. The `ModelHttpError` thrown by a
// failed attempt already carries `status`, which P8's spend policy needs to
// distinguish "no charge" (network failure) from "charged, refused" (a paid
// call that still consumed budget).

import type { ModelCallPolicy } from '../domain/model-registry'
import {
  CIRCUIT_CLOSED,
  type CircuitState,
  type FailureKind,
  FRESH_RATE_STATE,
  type RateState,
  checkRate,
  classifyFailure,
  decideRetry,
  recordFailure,
  recordSuccess,
} from '../domain/resilience'

/**
 * Carries what the domain needs to CLASSIFY a failed model call — the HTTP
 * status and the provider's own retry instruction — instead of making every
 * caller regex a message string it did not construct. Thrown only by
 * `model-http.ts`'s `postJson`, and read only by this gate; nothing else
 * needs to know the shape.
 */
export class ModelHttpError extends Error {
  readonly status: number | null
  readonly retryAfterMs: number | null

  constructor(message: string, status: number | null, retryAfterMs: number | null) {
    super(message)
    this.name = 'ModelHttpError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export type ModelGate = {
  /** `${provider}:${modelId}` — for logging and tests, never parsed. */
  readonly key: string
  /**
   * Runs `attempt` under this gate's pacing, retry and circuit policy.
   *
   * `attempt` performs ONE HTTP call and either resolves or throws (a
   * `ModelHttpError` when the failure is HTTP-shaped; any other Error for a
   * network-level failure). `request` may call `attempt` more than once —
   * that is the retry loop this replaces in `resilientClassifier` — and
   * resolves or rejects exactly once with the final outcome.
   */
  request<T>(attempt: () => Promise<T>): Promise<T>
}

export type ModelGateDeps = {
  /** Injected so tests never actually wait. */
  readonly sleep?: (ms: number) => Promise<void>
  readonly now?: () => number
  readonly log?: (message: string) => void
}

/** Bounded so a frozen or misbehaving clock cannot spin forever on a per-minute wait. */
const MAX_RATE_WAITS = 5

function statusAndRetryAfter(e: unknown): { status: number | null; retryAfterMs: number | null } {
  if (e instanceof ModelHttpError) return { status: e.status, retryAfterMs: e.retryAfterMs }
  return { status: null, retryAfterMs: null }
}

/**
 * A failure that says something about THIS REQUEST'S CONTENT, not about the
 * provider or the key — never counted toward the shared circuit.
 *
 * F2 (code review): the circuit is now shared by every caller of a model, so
 * its blast radius changed with this WP. Verified live: one
 * `ModelHttpError('HTTP 400', 400, null)` from the enricher — Gemini's
 * INVALID_ARGUMENT on an oversized prompt, reachable from the enricher's
 * variable-size batches — opened the circuit and every LATER classifier call
 * rejected `circuit-open` for the rest of the run. Before WP-P5 that same 400
 * was a logged skip costing one batch's metadata; sharing the circuit turned
 * a content complaint about one request into a run-wide outage.
 *
 * 401/403 (bad key, forbidden) and 404 (model retired) stay circuit-opening —
 * those ARE model-wide: every future call with the same key or the same
 * model id will fail identically, which is exactly what the circuit exists
 * to stop paying for. 400 is different: Gemini's own docs name it
 * INVALID_ARGUMENT, and the classifier's batches are a fixed size (25) while
 * the enricher's vary — the shape most likely to trip it is a request, not
 * the provider.
 *
 * A full content/transport split (D4: truncation bisected and retried,
 * neither counting toward the circuit) is WP-P6's job — the classifier
 * already reads `finishReason` for that. This is the narrow, P5-scoped
 * exception the shared circuit's new blast radius requires immediately.
 */
function isRequestContentFailure(kind: FailureKind, status: number | null): boolean {
  return kind === 'permanent' && status === 400
}

/**
 * Builds ONE gate for ONE (provider, model) pair.
 *
 * State — the rate window, the circuit and the in-flight count — lives across
 * every call made through this gate instance, for as long as the composition
 * root keeps it alive (one run). A per-call gate would never see the quota it
 * is supposed to share.
 */
export function createModelGate(policy: ModelCallPolicy, deps: ModelGateDeps = {}): ModelGate {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? (() => {})
  const key = `${policy.provider}:${policy.modelId}`

  let rate: RateState = FRESH_RATE_STATE
  let circuit: CircuitState = CIRCUIT_CLOSED
  let inFlight = 0
  const waiters: (() => void)[] = []

  // A simple counting semaphore. maxInFlight: 1 keeps today's sequential
  // behaviour true BY CONSTRUCTION — a second caller (say, backfill starting
  // while a classification chunk is still in flight) queues here instead of
  // racing the first for the same 60s window.
  async function acquireSlot(): Promise<void> {
    if (inFlight < policy.maxInFlight) {
      inFlight++
      return
    }
    await new Promise<void>((resolve) => waiters.push(resolve))
    inFlight++
  }

  function releaseSlot(): void {
    inFlight--
    const next = waiters.shift()
    if (next) next()
  }

  return {
    key,

    async request<T>(attempt: () => Promise<T>): Promise<T> {
      if (circuit.open) {
        throw new Error(`circuit-open: ${circuit.reason ?? 'unknown'}`)
      }

      for (let callAttempt = 0; ; ) {
        // ── pacing ──────────────────────────────────────────────────────────
        let rateWaits = 0
        for (;;) {
          const decision = checkRate({ requestsPerMinute: policy.requestsPerMinute, requestsPerDay: policy.requestsPerDay }, rate, now())
          if (decision.proceed) {
            rate = decision.state
            break
          }
          if (decision.waitMs < 0) {
            circuit = recordFailure(circuit, 'rate-limited-daily')
            throw new Error(`rate-limited-daily: ${decision.reason}`)
          }
          if (++rateWaits > MAX_RATE_WAITS) {
            throw new Error(`rate-limited: ${decision.reason}, still blocked after ${MAX_RATE_WAITS} waits`)
          }
          log(`${key}: ${decision.reason}, waiting ${Math.round(decision.waitMs / 1000)}s`)
          await sleep(decision.waitMs)
        }

        // ── in-flight limit ─────────────────────────────────────────────────
        await acquireSlot()

        try {
          const result = await attempt()
          circuit = recordSuccess()
          return result
        } catch (e) {
          const { status, retryAfterMs } = statusAndRetryAfter(e)
          const message = e instanceof Error ? e.message : String(e)
          const kind = classifyFailure(status, message)
          const decision = decideRetry(kind, callAttempt, policy.retry, retryAfterMs)

          if (!decision.retry) {
            const contentFailure = isRequestContentFailure(kind, status)
            if (!contentFailure) circuit = recordFailure(circuit, kind)
            log(
              `${key}: giving up after attempt ${callAttempt + 1} — ${decision.reason}` +
                (contentFailure ? ' (content failure — this request only, not counted toward the circuit)' : ''),
            )
            // Prefixed with `kind`, same convention resilientClassifier used —
            // callers (and tests) grep the message for 'rate-limited-daily',
            // 'circuit-open' and friends without needing the structured fields.
            throw new ModelHttpError(`${kind}: ${message}`, status, retryAfterMs)
          }

          log(`${key}: ${kind}, retrying in ${Math.round(decision.delayMs / 1000)}s (attempt ${decision.attempt})`)
          await sleep(decision.delayMs)
          callAttempt = decision.attempt
        } finally {
          releaseSlot()
        }
      }
    },
  }
}
