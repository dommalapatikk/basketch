// OfferSource — the port every retailer adapter implements.
//
// The domain defines this interface; infrastructure implements it. Adapters live
// under infrastructure/ and are anti-corruption layers: retailer vocabulary
// (insteadPriceText, _tracking_item_category2, prd_page, refiningId, spreads.json)
// dies inside the adapter and never reaches this file.
//
// This module must never import an HTTP client, a PDF library or Supabase.

import type { Offer, Retailer } from './offer'

/** ISO week identifier, e.g. '2026-W37'. */
export type IsoWeek = string

/**
 * WHY this is not just `Offer[]`:
 *
 * The old pipeline followed "sources return an array or empty, never throw".
 * That is how the categorisation failure hid for months — a source that parsed
 * nothing returned [] and the run was recorded as a success. Empty is no longer
 * allowed to mean fine.
 */
export type CollectionFailureReason =
  /** Network error, non-2xx, timeout. The source could not be reached. */
  | 'source-unavailable'
  /** Fetched fine but parsed nothing usable — the source changed shape. */
  | 'source-changed'
  /** Parsed far fewer offers than this source normally yields. */
  | 'below-expected-yield'

export type CollectionWarning = {
  readonly message: string
  /** Item that was dropped, where one can be identified. */
  readonly item?: string
}

export type CollectionResult =
  | {
      readonly ok: true
      readonly retailer: Retailer
      readonly offers: readonly Offer[]
      /** Items dropped during parsing. An empty array means a clean run. */
      readonly warnings: readonly CollectionWarning[]
    }
  | {
      readonly ok: false
      readonly retailer: Retailer
      readonly reason: CollectionFailureReason
      readonly detail: string
    }

export type OfferSource = {
  readonly retailer: Retailer
  /**
   * Fewest offers a healthy run should produce. Anything below this is
   * `below-expected-yield`, not a quiet success.
   */
  readonly expectedMinimumOffers: number
  fetchOffers(week: IsoWeek): Promise<CollectionResult>
}

export function collected(
  retailer: Retailer,
  offers: readonly Offer[],
  warnings: readonly CollectionWarning[] = [],
): CollectionResult {
  return { ok: true, retailer, offers, warnings }
}

export function collectionFailed(
  retailer: Retailer,
  reason: CollectionFailureReason,
  detail: string,
): CollectionResult {
  return { ok: false, retailer, reason, detail }
}

/**
 * Applies the yield floor. Adapters call this instead of returning a suspiciously
 * short list — Coop returning 3 offers when it normally yields ~200 is a failure.
 */
export function collectedWithYieldCheck(
  source: Pick<OfferSource, 'retailer' | 'expectedMinimumOffers'>,
  offers: readonly Offer[],
  warnings: readonly CollectionWarning[] = [],
): CollectionResult {
  if (offers.length === 0) {
    return collectionFailed(source.retailer, 'source-changed', 'parsed 0 offers — the source has probably changed shape')
  }
  if (offers.length < source.expectedMinimumOffers) {
    return collectionFailed(
      source.retailer,
      'below-expected-yield',
      `parsed ${offers.length} offers, expected at least ${source.expectedMinimumOffers}`,
    )
  }
  return collected(source.retailer, offers, warnings)
}
