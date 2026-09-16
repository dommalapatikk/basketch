// resilientClassifier — the port-contract guard, applied to a Classifier.
//
// WP-P5 (RCA item 6): rate limiting, retry and the circuit breaker used to
// live HERE, as a decorator private to this one port. That was correct only
// as long as the classifier was the only caller of its model — the day the
// reflector and the enricher started calling the SAME Gemini model directly
// (`gemini-judge.ts`, `gemini-enricher.ts`), Google's per-(project, model)
// quota was shared by three callers while the rate limiter was shared by
// none of them. A backfill of 1,107 products fired ~250 requests in 20
// seconds and got 255 of them refused.
//
// That logic is RETIRED into `ModelGate` (`model-gate.ts`), built once per
// (provider, model) by the composition root and injected into `postJson` at
// every call site for that model — classifier, reflector and enricher alike.
// What is left here is `guardClassifier` (`domain/classifier.ts`): turning a
// port that THROWS into one that returns the Err its own contract promises.
// That guard has nothing to do with quota and stays a decorator on this one
// port, because only the classifier is called through this file.

import type { Classifier } from '../domain/classifier'
import { guardClassifier } from '../domain/classifier'

export type ResilientDeps = {
  inner: Classifier
  log?: (message: string) => void
}

export function resilientClassifier(deps: ResilientDeps): Classifier {
  const log = deps.log ?? (() => {})
  return guardClassifier(deps.inner, log)
}
