// port-guards — makes "a pipeline port never throws" true rather than expected.
//
// THE DEFECT THIS CLOSES: the graph called `deps.judge.judge(...)`,
// `deps.reflector.reflect(...)` and `deps.tier1.classify(...)` with no try/catch
// anywhere. CLAUDE.md says pipeline sources never throw — and every adapter we
// happen to own does catch internally — so the graph WORKED. It worked by
// depending on the politeness of its collaborators instead of on its own
// structure, which is the definition of an invariant that is really a comment.
//
// The cost of being wrong is not one product. By the time the judge runs, a
// cold-start run is ~800 products deep; one unhandled rejection there discards
// every outcome already computed and the run reports nothing.
//
// WHY A GUARD AND NOT A try/catch AT EACH CALL SITE:
//   Three try/catch blocks in classify-graph.ts would fix today's three calls
//   and protect nothing else. `buildClassifyGraph` wraps whatever it is handed,
//   so a port implementation that breaks the contract is contained by the graph
//   itself — no caller has to remember, and no FUTURE adapter can opt out.
//
// `guardClassifier` lives in `domain/classifier.ts` instead of here, beside the
// port it guards: infrastructure needs it too (resilient-classifier wraps an
// adapter with no try/catch of its own), and infrastructure must not import
// application. Judge and Reflector are declared in this layer, so their guards
// belong in this layer.
//
// WHAT A GUARD DOES NOT DO: it does not invent an answer. Each port already
// declares what "I could not do this" looks like, and the guard returns exactly
// that value — 'unavailable', null, Err. The graph's existing edges then handle
// it with no new branches, exactly as they handle an honest failure.

import type { Judge, Reflector } from './classify-graph'

/** Told about every contract breach. A swallowed defect is worse than a loud one. */
export type PortErrorLog = (message: string) => void

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A breach is a DEFECT in the port, not a normal failure, and it is reported
 * as one. Degrading quietly would trade a dead run for an undiagnosable one.
 */
function breach(port: string, method: string, error: unknown): string {
  return `port contract breached: ${port}.${method}() threw instead of returning a failure — ${reason(error)}`
}

/**
 * A Judge that returns 'unavailable' instead of throwing.
 *
 * 'unavailable' — never 'correct'. A judge that crashed did not approve
 * anything, and classify-deals counts `judgeUnavailable` precisely so a dead
 * judge is distinguishable from an approving one. Defaulting to approval would
 * ship unchecked products under a badge saying they were checked.
 */
export function guardJudge(inner: Judge, log: PortErrorLog): Judge {
  return {
    name: inner.name,

    async judge(request, answer) {
      try {
        return await inner.judge(request, answer)
      } catch (e) {
        log(breach(inner.name, 'judge', e))
        // tokens: 0 — a call that threw produced no billable usage we can trust.
        return { verdict: 'unavailable', tokens: 0 }
      }
    },
  }
}

/**
 * A Reflector that returns no revision instead of throwing.
 *
 * null, not the original answer: reflection only ever runs on an answer the
 * judge disputed, so "no revision" leaves the item uncertain and visible in the
 * review queue. That is the honest outcome when the two rungs disagree and the
 * tie-breaker is down.
 */
export function guardReflector(inner: Reflector, log: PortErrorLog): Reflector {
  return {
    async reflect(request, answer) {
      try {
        return await inner.reflect(request, answer)
      } catch (e) {
        log(breach('reflector', 'reflect', e))
        return { classification: null, tokens: 0 }
      }
    },
  }
}
