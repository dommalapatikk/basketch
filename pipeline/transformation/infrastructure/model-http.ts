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
// WHAT IT DELIBERATELY IS NOT: no retry, no rate limiting, no circuit breaker.
// Those already exist, decided in `resilience.ts` and applied in
// `resilient-classifier.ts`. This is one primitive — a bounded POST — not a
// client library.

import { ERROR_BODY_CHARS, REQUEST_TIMEOUT_MS } from '../domain/resilience'

export type PostJsonOptions = {
  readonly url: string
  /** Already-serialised JSON. Serialisation is the adapter's business; bounding the call is ours. */
  readonly body: string
  readonly headers?: Readonly<Record<string, string>>
  /** Defaults to REQUEST_TIMEOUT_MS. There is deliberately no way to ask for "no timeout". */
  readonly timeoutMs?: number
  /** Injected only by tests. Production always uses the global fetch. */
  readonly fetchImpl?: typeof fetch
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
 * Two guarantees the callers depend on:
 *
 *   1. The rejection message for a stall contains "timeout", which
 *      `classifyFailure` maps to `transient`, which `decideRetry` retries. The
 *      abort path therefore needs no new retry code — it joins the one that
 *      already exists. (`model-http.test.ts` asserts that end to end.)
 *   2. A non-2xx message carries ERROR_BODY_CHARS of the body, far enough in for
 *      Google's `retryDelay` and its `PerDay` quota id to survive.
 */
export async function postJson(options: PostJsonOptions): Promise<unknown> {
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
    throw new Error(`HTTP ${res.status}: ${body.slice(0, ERROR_BODY_CHARS)}`)
  }

  try {
    return await res.json()
  } catch (e) {
    throw abortAware(e, signal, timeoutMs)
  }
}

/**
 * Rewrites an abort into a message the resilience domain can classify.
 *
 * We own this signal and nothing else can abort it, so `signal.aborted` is a
 * sufficient test — no dependence on the wording of Node's DOMException, which
 * is not ours to rely on.
 */
function abortAware(error: unknown, signal: AbortSignal, timeoutMs: number): Error {
  if (signal.aborted) return new Error(`timeout: no response within ${timeoutMs}ms`)
  return error instanceof Error ? error : new Error(String(error))
}
