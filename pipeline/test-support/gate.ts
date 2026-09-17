// test-support/gate.ts — a `ModelGate` that adds no pacing, no retry and no
// circuit, for tests that need to satisfy `postJson`'s now-mandatory `gate`
// argument without exercising quota behaviour at all.
//
// WP-P5 made `gate` required on every model call (`model-http.ts`), which is
// the point — but most adapter tests inject their own `fetchJson`/`ask`
// override and never reach `postJson` in the first place. This helper exists
// only for the handful that deliberately exercise the DEFAULT network path
// (`gemini-classifier.test.ts`'s "the default network path is bounded",
// `model-probe.test.ts`, `model-http.test.ts` itself) and want the gate out
// of the way while they assert on something else — a stalled socket, a 429
// body, a missing header.

import type { ModelGate } from '../transformation/infrastructure/model-gate'

export function createNoopGate(key = 'test:noop'): ModelGate {
  return {
    key,
    request: (attempt) => attempt(),
    // Free-tier shape: no money, so nothing to report (WP-P8).
    spendSnapshot: () => null,
  }
}
