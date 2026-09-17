// OfferSource — the port every retailer adapter implements.
//
// The domain defines this interface; infrastructure implements it. Adapters live
// under infrastructure/ and are anti-corruption layers: retailer vocabulary
// (insteadPriceText, _tracking_item_category2, prd_page, refiningId, spreads.json)
// dies inside the adapter and never reaches this file.
//
// This module must never import an HTTP client, a PDF library or Supabase.

import type { Edition } from './edition'
import type { Offer, Retailer } from './offer'
import { isDisplayTruncated } from '../../../shared/types'

/**
 * Re-exported, not redefined — `IsoWeek` is a value object owned by
 * `iso-week.ts` (WP-J1). It still belongs to this port's own vocabulary (the
 * "which week is this run's trace/telemetry labelled with" field on
 * `Telemetry`/`RunTrace`), so callers that only need that keep importing it
 * from here without every one of them being rewired to a second import.
 */
export type { IsoWeek } from './iso-week'

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
  /**
   * The item the warning is about, where one can be identified. NOT always a
   * dropped item: a Coop card that falls back to its truncated h3 (WP-C3)
   * carries a warning here while its offer is still published.
   */
  readonly item?: string
}

export type CollectionResult =
  | {
      readonly ok: true
      readonly retailer: Retailer
      readonly offers: readonly Offer[]
      /**
       * Per-item notices raised during parsing. NOT all dropped items: since
       * WP-C3 a warning can accompany an offer that was still published (a
       * Coop card whose title attribute didn't extend its truncated h3, and
       * so fell back to that h3, with a warning — the offer is kept). An
       * empty array means nothing needed a note, not that nothing happened.
       */
      readonly warnings: readonly CollectionWarning[]
      /**
       * True when more than `DISPLAY_TRUNCATED_NAME_DEGRADED_SHARE` of the
       * offers carry a display-truncated name (WP-C3 / HANDOVER item 8). A
       * real-world-unit guard, per HANDOVER §5: expressed as a share of
       * offers, not an internal artefact. Set by `collected()`, so every
       * source that goes through it — not only Coop — is covered if its
       * markup ever starts truncating too.
       */
      readonly degraded: boolean
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
  /**
   * The publication IN EFFECT on `date` — WHICH publication this source would
   * fetch if asked right now. Upcoming publications are not pre-fetched (D5).
   *
   * This exists so the caller (WP-J2's fetch ledger) can know which
   * publication it is about to ask for BEFORE calling `fetchOffers` — the
   * enforcement point for "never refetch a publication" needs that fact
   * first, not read back out of the fetch afterwards. Calendar knowledge
   * (which weekday this retailer's week starts on) stays inside the adapter
   * that implements this; the port only requires every adapter can answer it.
   */
  editionFor(date: Date): Edition
  fetchOffers(edition: Edition): Promise<CollectionResult>
}

/** More than this share of display-truncated names makes a source degraded. */
export const DISPLAY_TRUNCATED_NAME_DEGRADED_SHARE = 0.05

function truncatedNameShare(offers: readonly Offer[]): number {
  if (offers.length === 0) return 0
  const truncated = offers.filter((o) => isDisplayTruncated(o.productName)).length
  return truncated / offers.length
}

export function collected(
  retailer: Retailer,
  offers: readonly Offer[],
  warnings: readonly CollectionWarning[] = [],
): CollectionResult {
  return {
    ok: true,
    retailer,
    offers,
    warnings,
    degraded: truncatedNameShare(offers) > DISPLAY_TRUNCATED_NAME_DEGRADED_SHARE,
  }
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
