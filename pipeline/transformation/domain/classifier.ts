// Classifier — the port every model adapter implements.
//
// The domain defines this; infrastructure implements it. Swapping Gemini for
// gpt-5-nano after the bake-off is one file in infrastructure/, and nothing
// above this line notices.
//
// Same contract as the collection ports: never throw, return a result, and never
// let empty pass as success.

import { type Result, err } from '../../collection/domain/result'
import type { Classification, ClassificationTier } from './classification'

/**
 * What the classifier is given.
 *
 * `descriptor` is the retailer's own free-text line where one exists — Denner's
 * nameSubline, Lidl's description. It is genuine published context ('paniert,
 * 400 g'), not something we inferred, so passing it costs nothing and raises
 * accuracy on exactly the products a bare name cannot resolve.
 */
export type ClassificationRequest = {
  readonly productName: string
  readonly descriptor: string | null
  readonly retailer: string
}

/** One item's outcome. A failure for one item never fails the batch. */
export type ClassificationOutcome =
  | { readonly ok: true; readonly request: ClassificationRequest; readonly classification: Classification }
  | { readonly ok: false; readonly request: ClassificationRequest; readonly reason: ClassificationFailure; readonly detail: string }

export type ClassificationFailure =
  /** The model named a category or sub-category that is not in the taxonomy. */
  | 'invalid-category'
  /** The model returned nothing usable for this item. */
  | 'no-answer'
  /** Provider error, timeout, rate limit. */
  | 'provider-unavailable'
  /** The run's token or call budget is exhausted. */
  | 'budget-exhausted'
  /**
   * WP-P6 / D4. The response was cut off by the output token limit
   * (`finishReason: 'MAX_TOKENS'`). Retrying the IDENTICAL batch at
   * temperature 0 truncates identically — this is a CONTENT failure, not a
   * transient one, so the adapter sends a SMALLER batch instead of asking
   * the same question again. Reached only after bisection is exhausted
   * (25 → 13 → 7, at most two splits) and the remaining products are held
   * back with this reason recorded rather than dropped silently.
   */
  | 'output-truncated'
  /**
   * WP-P6 / D4. The response was NOT truncated, but its text did not parse
   * as JSON — even after one retry of the identical batch. Unlike
   * truncation, this is retried once unbisected: the project has measured
   * this provider as non-deterministic in practice even at temperature 0
   * (HANDOVER.md: 16 parse errors one run, 18 the next), so a same-size
   * retry can genuinely come back different.
   */
  | 'unparseable'

export type Classifier = {
  /** Model identifier, recorded on every classification for traceability. */
  readonly name: string
  readonly tier: ClassificationTier
  /** Items per request. Batching amortises the category list across the batch. */
  readonly batchSize: number

  /**
   * Classify a batch.
   *
   * Returns one outcome per request, in the same order. An Err result means the
   * whole call failed (provider down, budget gone) — not that items were
   * individually unclassifiable, which is reported per item.
   */
  classify(batch: readonly ClassificationRequest[]): Promise<Result<readonly ClassificationOutcome[]>>
}

/**
 * Turns any Classifier into one that honours the "never throw" half of its own
 * contract.
 *
 * It lives beside the port, not beside a caller, because EVERY caller needs it:
 * `composition.ts` wraps an adapter with it directly and `buildClassifyGraph`
 * wraps that again, and neither had a try/catch of its own. A contract stated
 * only in this file's header is a comment; this makes it a property.
 *
 * The fallback is the port's own declared failure value — Err — so callers need
 * no new branch. An Err already means "the whole call failed", which is exactly
 * what a thrown exception was trying to say.
 */
export function guardClassifier(inner: Classifier, log: (message: string) => void): Classifier {
  return {
    name: inner.name,
    tier: inner.tier,
    batchSize: inner.batchSize,

    async classify(batch: readonly ClassificationRequest[]): Promise<Result<readonly ClassificationOutcome[]>> {
      try {
        return await inner.classify(batch)
      } catch (e) {
        // A breach is a DEFECT in the adapter, not a normal failure. Reported,
        // never swallowed — degrading quietly trades a dead run for an
        // undiagnosable one.
        const message = `port contract breached: ${inner.name}.classify() threw instead of returning a failure — ${
          e instanceof Error ? e.message : String(e)
        }`
        log(message)
        return err(message)
      }
    },
  }
}
