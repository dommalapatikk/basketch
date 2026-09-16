// model-http — the ONE place this pipeline is allowed to call a model over HTTP.
//
// THE DEFECT THIS CLOSES: `REQUEST_TIMEOUT_MS` was defined in resilience.ts with
// a comment explaining that nemotron-3.5-lightning took 873s for 65 products —
// and then imported by nothing. All four model fetches passed no `signal`, and
// Node's fetch has NO default timeout: a stalled socket waits on the OS TCP
// timeout, 120s+. A chunk of 100 products makes ~59 SEQUENTIAL calls, so one
// stalled call blocks everything behind it. That is how a 45-minute CI step
// ends without reporting.
//
// WHY A SEAM RATHER THAN FOUR `signal:` LINES:
//   A `signal:` repeated at every call site is a convention. The next adapter
//   omits it and nothing notices until a Thursday 05:00 run hangs. Routing every
//   call through one function makes "no model call runs unbounded" a property of
//   the codebase instead of a habit — and `model-http.test.ts` fails the build if
//   any file under infrastructure/ calls `fetch` directly.
//
//   This is not speculative abstraction. It is the SIXTH occurrence of the same
//   five lines: model-probe.ts had already hand-rolled the AbortController dance
//   twice, verbatim, with its own truncation constant. Fowler's Rule of Three
//   said extract three occurrences ago.
//
// WP-P5 (RCA item 6): `gate` is now a REQUIRED argument, for exactly the reason
// the timeout above is not optional. The classifier, the reflector and the
// enricher all call this same model — the same (project, model) quota Google
// enforces — but the rate limiter used to live as a decorator around ONE of
// the three (`resilient-classifier.ts`), with state private to that instance.
// The other two called this function directly, unpaced. A backfill of 1,107
// products fired ~250 requests in 20 seconds and got 255 of them refused.
// Making the gate impossible to omit here — the single choke point every
// model call already passes through — turns "every caller of a model shares
// that model's quota" into a property of the code, not a habit any one
// adapter has to remember.
//
// WHAT IT DELIBERATELY IS NOT: a client library. Retry, pacing and the circuit
// breaker are DECIDED in `resilience.ts` (pure) and EXECUTED by the injected
// `ModelGate` (`model-gate.ts`) — this function performs exactly one HTTP
// attempt per call the gate makes and reports what happened.

import { ERROR_BODY_CHARS, REQUEST_TIMEOUT_MS, parseRetryAfter } from '../domain/resilience'
import { ModelHttpError, type ModelGate } from './model-gate'

export type { ModelHttpError } from './model-gate'

export type PostJsonOptions = {
  readonly url: string
  /** Already-serialised JSON. Serialisation is the adapter's business; bounding the call is ours. */
  readonly body: string
  readonly headers?: Readonly<Record<string, string>>
  /** Defaults to REQUEST_TIMEOUT_MS. There is deliberately no way to ask for "no timeout". */
  readonly timeoutMs?: number
  /** Injected only by tests. Production always uses the global fetch. */
  readonly fetchImpl?: typeof fetch
  /**
   * REQUIRED. Every model call is paced, retried and circuit-broken by the
   * (provider, model) gate the composition root built for it — see the file
   * header. There is deliberately no default: a call with no gate is exactly
   * the bug this closes.
   */
  readonly gate: ModelGate
}

/**
 * POSTs JSON to a model endpoint and returns the parsed response.
 *
 * THROWS rather than returning a Result, on purpose. Every caller is already an
 * adapter that catches and converts to its own failure shape — `Result.err` for
 * the classifier, `verdict: 'unavailable'` for the judge, a logged skip for the
 * enricher, `available: false` for the probe. The rule "pipeline sources never
 * throw" is about those adapters, and it still holds: this is the layer beneath
 * them, and nothing above an adapter ever sees this throw.
 *
 * Retried, paced and circuit-broken by `options.gate` — see `model-gate.ts`.
 * The thrown error is always a `ModelHttpError`, carrying the HTTP status and
 * the provider's own retry instruction (its `Retry-After` header, or Google's
 * `retryDelay` embedded in the body) as STRUCTURED fields, not just text a
 * caller has to regex back out.
 */
export async function postJson(options: PostJsonOptions): Promise<unknown> {
  if (!options.gate) {
    // A runtime guard, not just a type one: `PostJsonOptions.gate` is
    // required in TypeScript, but a caller that bypasses the type checker (or
    // a future adapter someone writes in a hurry) must still be stopped here,
    // not 40 minutes into an ungated run.
    throw new Error(
      'postJson: a gate is required — every model call must be paced, retried and circuit-broken by a ' +
        'ModelGate (WP-P5). Build one in the composition root (one per provider+model) and pass it as `gate`.',
    )
  }

  return options.gate.request(() => attemptOnce(options))
}

async function attemptOnce(options: PostJsonOptions): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const doFetch = options.fetchImpl ?? fetch

  // AbortSignal.timeout over a manual AbortController + setTimeout: its timer is
  // unref'd, so it cannot hold the Node process open, and there is no
  // clearTimeout to forget. The signal also aborts the response BODY stream, so
  // the bound covers a provider that sends headers and then stalls mid-answer —
  // which a Promise.race around the fetch would not.
  const signal = AbortSignal.timeout(timeoutMs)

  let res: Response
  try {
    res = await doFetch(options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body,
      signal,
    })
  } catch (e) {
    throw abortAware(e, signal, timeoutMs)
  }

  if (!res.ok) {
    let body: string
    try {
      body = await res.text()
    } catch (e) {
      throw abortAware(e, signal, timeoutMs)
    }
    const snippet = body.slice(0, ERROR_BODY_CHARS)
    throw new ModelHttpError(`HTTP ${res.status}: ${snippet}`, res.status, retryAfterMsFrom(res, snippet))
  }

  try {
    return await res.json()
  } catch (e) {
    throw abortAware(e, signal, timeoutMs)
  }
}

/**
 * Reads how long the provider itself asked us to wait — OpenRouter's
 * `Retry-After` header, or Google's `retryDelay` embedded in the JSON error
 * body — so `decideRetry`'s "the provider's own instruction always wins"
 * rule has something real to read.
 *
 * THE DEFECT THIS CLOSES: `Retry-After` was dropped entirely — `postJson`
 * threw only `HTTP ${status}: ${body}`, discarding every response header. For
 * OpenRouter, whose retry instruction is ONLY in the header, never the body,
 * it could not be read at all.
 */
function retryAfterMsFrom(res: Response, bodySnippet: string): number | null {
  const header = parseRetryAfter(res.headers.get('retry-after'), Date.now())
  if (header !== null) return header

  // Google's shape: `"retryDelay": "37s"`, ~700-900 chars into the body —
  // within ERROR_BODY_CHARS but past where a 200-char truncation used to cut.
  const googleStyle = bodySnippet.match(/retryDelay["\s:]+([\d.]+s)/)?.[1] ?? null
  return parseRetryAfter(googleStyle, Date.now())
}

/**
 * Rewrites an abort or a network failure into a `ModelHttpError` the gate can
 * classify — status null, retryAfterMs null: neither is HTTP-shaped.
 *
 * We own this signal and nothing else can abort it, so `signal.aborted` is a
 * sufficient test — no dependence on the wording of Node's DOMException, which
 * is not ours to rely on.
 */
function abortAware(error: unknown, signal: AbortSignal, timeoutMs: number): ModelHttpError {
  if (signal.aborted) return new ModelHttpError(`timeout: no response within ${timeoutMs}ms`, null, null)
  const message = error instanceof Error ? error.message : String(error)
  return new ModelHttpError(message, null, null)
}

/**
 * A LOG-LENGTH summary of a thrown error — the first line, cut short.
 *
 * WP-P5 (RCA item 6): every 429 used to be logged with its full body, up to
 * ERROR_BODY_CHARS (2,000) — 89% of one run's Categorize job log was this one
 * failure's JSON, and the line that mattered (which phase, how many
 * rate-limited) was buried under it. `ModelGate` already retries internally,
 * so an adapter's own catch block only ever sees the FINAL outcome, not one
 * line per attempt — this keeps that one line short enough to read.
 */
export function summariseError(e: unknown, maxChars = 160): string {
  const message = e instanceof Error ? e.message : String(e)
  const firstLine = message.split('\n')[0] ?? message
  return firstLine.length > maxChars ? `${firstLine.slice(0, maxChars)}…` : firstLine
}
