// offerToUnifiedDeal — feeds `Offer`s into the existing pipeline unchanged.
//
// WHY NOT REPLACE UnifiedDeal OUTRIGHT
// `run.ts` runs several steps after collection: grocery filter,
// classification, taxonomy aliasing, product resolution and storage. All of
// them speak `UnifiedDeal`. Rewriting every one in the same change as
// switching the data source would mean a cutover where, if anything broke,
// nobody could tell which half caused it.
//
// So `Offer` is mapped into `UnifiedDeal` for the shared path. Until WP-1d
// (ADR-IMG-1), the fields UnifiedDeal could not hold — priceBasis,
// CropRegion, integer rappen — were written by a SECOND pass keyed on a
// string built from (store, product_name, valid_from): see
// `dealStoreEnrichment` below and `storage/infrastructure/write-enrichment.ts`.
// That gave the ProductImage value object two owners, two keys and a
// cross-statement database CHECK, and every boundary between the two writes
// was a place a picture could silently become null (a held-back deal, a `|`
// in the product name, a Map-vs-dedupe mismatch over which offer "won").
//
// WP-1d moves the image onto `UnifiedDeal` itself (`image: ProductImage |
// null`), so it rides the SAME upsert as the price — no second write, no
// second key, no boundary to lose it at. `dealStoreEnrichment` still exists
// for what is left: rappen, price basis and the loyalty programme (WP-1e).

import type { UnifiedDeal } from '../../../shared/types'
import { toFrancs } from '../../collection/domain/money'
import type { Offer } from '../../collection/domain/offer'
import { isMemberOnly } from '../../collection/domain/price-basis'
import { isMinimumQuantity } from '../../collection/domain/quantity-requirement'

/** The natural key `deals` already enforces: unique_deal (store, product_name, valid_from). */
export function naturalKey(store: string, productName: string, validFrom: string): string {
  return `${store}|${productName}|${validFrom}`
}

export function offerToUnifiedDeal(offer: Offer): UnifiedDeal {
  return {
    store: offer.retailer,
    productName: offer.productName,
    salePrice: toFrancs(offer.salePrice),
    originalPrice: offer.originalPrice ? toFrancs(offer.originalPrice) : null,
    // The ALDI rule: no reference price means no discount. Never back-compute one.
    discountPercent: offer.discount?.percent ?? null,
    validFrom: offer.validity.from,
    validTo: offer.validity.to,
    // WP-1d (ADR-IMG-1): the WHOLE image travels through now — a source-url
    // or a CropRegion — because `dealToRow` writes all five image columns in
    // one statement. Nothing is dropped here any more.
    image: offer.image,
    sourceCategory: offer.sourceCategory,
    sourceUrl: offer.sourceUrl,
    // Unlike priceBasis/CropRegion/rappen, `minQuantity` (WP-C4) travels
    // through the MAIN write, not the enrichment pass: it is a plain
    // nullable number — the same shape as `quantity` above — so it fits
    // UnifiedDeal's flat shape with no loss. Routing it through the second
    // write instead would put it on the same natural key
    // (`store|productName|validFrom`) as every OTHER field the enrichment
    // pass carries, which is exactly the identity that does NOT distinguish
    // a multi-buy offer from its single-item sibling (see `offerKey` in
    // `collection/domain/offer.ts`) — a second, later-processed offer for
    // the same key would silently overwrite the first's enrichment in
    // memory, before either ever reaches the database.
    minQuantity: isMinimumQuantity(offer.quantityRequirement) ? offer.quantityRequirement.count : null,
  } as UnifiedDeal
}

/**
 * Columns that exist on `deals` but not on `UnifiedDeal`.
 *
 * WP-1d (ADR-IMG-1) moved the five image columns off this type and onto
 * `UnifiedDeal.image` — they ride the main upsert now. What is left (rappen,
 * price basis, loyalty programme) is WP-1e's turn.
 */
export type DealEnrichment = {
  readonly key: string
  readonly sale_price_rappen: number
  readonly original_price_rappen: number | null
  readonly price_basis: 'everyone' | 'member-only'
  readonly loyalty_programme: string | null
}

/**
 * The fields the main path drops, ready for the second write.
 *
 * Returns null when an offer has nothing extra to say — most Denner and Coop
 * offers, which have an everyone-price. Only the rows that need a second
 * write generate one.
 */
export function dealStoreEnrichment(offer: Offer): DealEnrichment | null {
  const member = isMemberOnly(offer.priceBasis)

  // Rappen are always worth writing: the domain models money as integers and
  // the NUMERIC columns are the lossy copy, not the other way round.
  return {
    key: naturalKey(offer.retailer, offer.productName, offer.validity.from),
    sale_price_rappen: offer.salePrice.rappen,
    original_price_rappen: offer.originalPrice?.rappen ?? null,
    price_basis: member ? 'member-only' : 'everyone',
    loyalty_programme: member ? offer.priceBasis.programme : null,
  }
}
