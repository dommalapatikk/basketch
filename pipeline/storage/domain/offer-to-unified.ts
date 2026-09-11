// offerToUnifiedDeal — feeds `Offer`s into the existing pipeline unchanged.
//
// WHY NOT REPLACE UnifiedDeal OUTRIGHT
// `run.ts` runs seven steps after collection: grocery filter, classification,
// taxonomy aliasing, product resolution, storage, the v3 concept layer and the
// revalidate ping. All of them speak `UnifiedDeal`. Rewriting every one in the
// same change as switching the data source would mean a cutover where, if
// anything broke, nobody could tell which half caused it.
//
// So `Offer` is mapped into `UnifiedDeal` for the shared path, and the fields
// UnifiedDeal cannot hold — priceBasis, CropRegion, integer rappen, published
// attributes — are written by a second pass keyed on the natural key. Two
// writes, but every existing behaviour is preserved and each half fails
// independently.
//
// This mapper is LOSSY BY DESIGN, and the loss is recovered by
// `dealStoreEnrichment` below. If you add a field to `Offer`, add it there too.

import type { UnifiedDeal } from '../../../shared/types'
import { toFrancs } from '../../collection/domain/money'
import type { Offer } from '../../collection/domain/offer'
import { isMemberOnly } from '../../collection/domain/price-basis'

/** The natural key `deals` already enforces: unique_deal (store, product_name, valid_from). */
export function naturalKey(store: string, productName: string, validFrom: string): string {
  return `${store}|${productName}|${validFrom}`
}

export function offerToUnifiedDeal(offer: Offer): UnifiedDeal {
  const image = offer.image

  return {
    store: offer.retailer,
    productName: offer.productName,
    salePrice: toFrancs(offer.salePrice),
    originalPrice: offer.originalPrice ? toFrancs(offer.originalPrice) : null,
    // The ALDI rule: no reference price means no discount. Never back-compute one.
    discountPercent: offer.discount?.percent ?? null,
    validFrom: offer.validity.from,
    validTo: offer.validity.to,
    // A CropRegion has no single url, so it cannot travel through UnifiedDeal.
    // It is written by the enrichment pass instead.
    imageUrl: image?.kind === 'source-url' ? image.url : null,
    sourceCategory: offer.sourceCategory,
    sourceUrl: offer.sourceUrl,
  } as UnifiedDeal
}

/** Columns that exist on `deals` but not on `UnifiedDeal`. */
export type DealEnrichment = {
  readonly key: string
  readonly sale_price_rappen: number
  readonly original_price_rappen: number | null
  readonly price_basis: 'everyone' | 'member-only'
  readonly loyalty_programme: string | null
  readonly page_image_url: string | null
  readonly crop_x: number | null
  readonly crop_y: number | null
  readonly crop_w: number | null
  readonly crop_h: number | null
}

/**
 * The fields the main path drops, ready for the second write.
 *
 * Returns null when an offer has nothing extra to say — most Denner and Coop
 * offers, which have a plain image url and an everyone-price. Only the rows that
 * need a second write generate one.
 */
export function dealStoreEnrichment(offer: Offer): DealEnrichment | null {
  const crop = offer.image?.kind === 'crop-region' ? offer.image.region : null
  const member = isMemberOnly(offer.priceBasis)

  // Rappen are always worth writing: the domain models money as integers and
  // the NUMERIC columns are the lossy copy, not the other way round.
  return {
    key: naturalKey(offer.retailer, offer.productName, offer.validity.from),
    sale_price_rappen: offer.salePrice.rappen,
    original_price_rappen: offer.originalPrice?.rappen ?? null,
    price_basis: member ? 'member-only' : 'everyone',
    loyalty_programme: member ? offer.priceBasis.programme : null,
    page_image_url: crop?.pageImageUrl ?? null,
    crop_x: crop?.x ?? null,
    crop_y: crop?.y ?? null,
    crop_w: crop?.width ?? null,
    crop_h: crop?.height ?? null,
  }
}
