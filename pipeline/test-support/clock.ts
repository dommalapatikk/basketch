// test-support/clock.ts — one injectable clock, shared by every test that
// needs to pin `now()` without waiting on the wall clock.
//
// F9 (code review of the first WP-P3 submission): `statefulClock` used to be
// defined twice (classify-deals.test.ts, run-pipeline.test.ts), and its
// script was consumed positionally by however many `now()` calls production
// code happened to make — `runPipeline`'s `startTime`, each chunk's deadline
// check, `finishRun`'s alert evaluation, in whatever order they occur.
// Inserting one `clock()` call anywhere in `run-pipeline.ts` or
// `classify-deals.ts` would silently shift every later value to mean
// something the test never intended, and the test would keep passing.
//
// This version cannot do that silently: it THROWS once its script is
// exhausted, rather than repeating the last value forever. A shifted-but-not-
// exhausted script is still possible in principle — no positional script can
// rule that out — but every call site below documents, by a named local
// constant, which phase of the run each scripted value stands for, so a
// reviewer reading the test sees the intent, not just an array of numbers.

/**
 * Returns each value in `values` once, in order. Throws once exhausted,
 * rather than silently repeating the last value — a test whose production
 * code started calling `now()` one time more than expected should fail
 * loudly, not keep passing on a stale number.
 */
export function statefulClock(values: readonly number[]): () => number {
  let i = 0
  return () => {
    if (i >= values.length) {
      throw new Error(
        `statefulClock exhausted after ${values.length} scripted value(s) — production code called now() more ` +
          'times than this test scripted. That is exactly the silent-drift failure this helper exists to catch: ' +
          'update the script to name the new call, do not just add a value.',
      )
    }
    return values[i++]!
  }
}
