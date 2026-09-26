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
// (ADR-IMG-1) and WP-1e, the fields UnifiedDeal could not hold — priceBasis,
// CropRegion, integer rappen, the loyalty programme — were written by a
// SECOND pass (`dealStoreEnrichment`, `storage/infrastructure/write-enrichment.ts`)
// keyed on a string built from (store, product_name, valid_from). That gave
// every one of those values two owners, two keys and, for the image, a
// cross-statement database CHECK — and every boundary between the two
// writes was a place a value could silently be lost or misattributed (a
// held-back deal, a `|` in the product name, a Map-vs-dedupe mismatch over
// which offer "won" a natural-key collision).
//
// WP-1d moved the image onto `UnifiedDeal` (`image: ProductImage | null`).
// WP-1e (tech-lead cross-review §10.4, ARCH-X §2.5) finishes the job: rappen,
// price basis and the loyalty programme move onto `UnifiedDeal` too, and the
// second pass — `dealStoreEnrichment`, `DealEnrichment`,
// `storage/infrastructure/write-enrichment.ts` — is deleted outright. Every
// deal-shaped value now rides the SAME statement as the price, assembled
// once, written once.

import type { UnifiedDeal } from '../../../shared/types'
import { toFrancs } from '../../collection/domain/money'
import type { Offer } from '../../collection/domain/offer'
import { isMemberOnly } from '../../collection/domain/price-basis'
import { isMinimumQuantity } from '../../collection/domain/quantity-requirement'

export function offerToUnifiedDeal(offer: Offer): UnifiedDeal {
  const member = isMemberOnly(offer.priceBasis)

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
    // WP-1e: rappen are the domain's own integer form (`Money.rappen`), not
    // derived from the francs fields above — the NUMERIC columns are the
    // lossy copy, not the other way round.
    salePriceRappen: offer.salePrice.rappen,
    originalPriceRappen: offer.originalPrice?.rappen ?? null,
    // THE LIDL RULE. A member price that reached this point without naming
    // its programme would be rejected by the database — but createOffer
    // already forbids constructing one, so this is belt and braces.
    priceBasis: member ? 'member-only' : 'everyone',
    loyaltyProgramme: member ? offer.priceBasis.programme : null,
    sourceCategory: offer.sourceCategory,
    sourceUrl: offer.sourceUrl,
    // Unlike the fields above before WP-1e, `minQuantity` (WP-C4) always
    // travelled through the MAIN write: a plain nullable number — the same
    // shape as `quantity` above — that fits UnifiedDeal's flat shape with no
    // loss.
    minQuantity: isMinimumQuantity(offer.quantityRequirement) ? offer.quantityRequirement.count : null,
  } as UnifiedDeal
}
