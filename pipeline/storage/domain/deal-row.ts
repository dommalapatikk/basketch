// DealRow — the translation from `Offer` to a database row.
//
// This is component 3's anti-corruption layer, pointing the other way: where an
// adapter translates a retailer's vocabulary INTO the domain, this translates
// the domain OUT into the `deals` table's vocabulary.
//
// THREE THINGS THAT WERE BEING THROWN AWAY, verified against the live schema:
//
//   priceBasis    LIDL reports the Lidl Plus price with no flag. The adapter
//                 cross-checks the PDF and drops ~117 offers a week because of
//                 it — and the survivors were written with no record of the
//                 basis at all. Enforced in the domain, discarded on write.
//   CropRegion    {pageImageUrl, x, y, w, h} for Spar/Aldi/Migros. Lost
//                 entirely, so those three retailers had no images.
//   Money         integer rappen, converted to NUMERIC and back for no reason.
//
// AND THE SHAPE THAT SURPRISED ME (live schema, 2026-09-10):
//   deals.category      holds the TOP-LEVEL group: fresh | long-life | non-food
//   deals.sub_category  holds the BROWSE category: dairy, meat-fish, ...
// Not what the names suggest. Sampled 1,000 rows: all category='fresh', with
// sub_category in {dairy: 830, bread: 170}.

import { BROWSE_CATEGORIES } from '../../../shared/types'
import type { Offer } from '../../collection/domain/offer'
import { toFrancs } from '../../collection/domain/money'
import { isMemberOnly } from '../../collection/domain/price-basis'

/** Exactly the columns this layer writes. */
export type DealRow = {
  store: string
  product_name: string
  /** Top-level group. NULL when the classifier was not confident (D3). */
  category: string | null
  sub_category: string | null
  sale_price: number
  original_price: number | null
  discount_percent: number
  sale_price_rappen: number
  original_price_rappen: number | null
  valid_from: string
  valid_to: string | null
  image_url: string | null
  page_image_url: string | null
  crop_x: number | null
  crop_y: number | null
  crop_w: number | null
  crop_h: number | null
  price_basis: 'everyone' | 'member-only'
  loyalty_programme: string | null
  source_category: string | null
  source_url: string | null
  storage: string | null
  attributes: Record<string, unknown>
  taxonomy_confidence: number
  is_uncertain: boolean
  classification_key: string | null
  run_id: string | null
  is_active: boolean
}

export type Classified = {
  /** Browse category id, or null when uncertain. */
  readonly category: string | null
  readonly subCategory: string | null
  readonly confidence: number
  readonly isUncertain: boolean
  readonly attributes?: Record<string, unknown>
  readonly storage?: string | null
  readonly classificationKey?: string | null
}

/**
 * Maps a browse category to its top-level group.
 *
 * `deals.category` has a CHECK constraint allowing only the three groups, so
 * writing a browse id there fails — which is exactly how I discovered the
 * column meanings were the reverse of what their names suggest.
 */
export function topCategoryFor(browseCategory: string | null): string | null {
  if (!browseCategory) return null
  return BROWSE_CATEGORIES.find((c) => c.id === browseCategory)?.topCategory ?? null
}

export function offerToRow(offer: Offer, classified: Classified, runId: string): DealRow {
  const saleRappen = offer.salePrice.rappen
  const originalRappen = offer.originalPrice?.rappen ?? null

  // ProductImage is exactly one of SourceUrl | CropRegion — a domain invariant,
  // and now a database one too. Writing both would render two images.
  //
  // Note the domain names them width/height while the table uses crop_w/crop_h;
  // this is the only place that difference exists.
  const image = offer.image
  const crop = image?.kind === 'crop-region' ? image.region : null
  const sourceUrl = image?.kind === 'source-url' ? image.url : null

  return {
    store: offer.retailer,
    product_name: offer.productName,

    category: topCategoryFor(classified.category),
    sub_category: classified.subCategory,

    // Both representations during cutover: the NUMERIC columns the frontend
    // still reads, and the integer rappen the domain actually models.
    sale_price: toFrancs(offer.salePrice),
    original_price: offer.originalPrice ? toFrancs(offer.originalPrice) : null,
    sale_price_rappen: saleRappen,
    original_price_rappen: originalRappen,

    // NOT NULL in the table. The ALDI rule means a discount only exists when an
    // original price does, so absent becomes 0 rather than an invented saving.
    discount_percent: offer.discount?.percent ?? 0,

    valid_from: offer.validity.from,
    valid_to: offer.validity.to,

    image_url: sourceUrl,
    page_image_url: crop?.pageImageUrl ?? null,
    crop_x: crop?.x ?? null,
    crop_y: crop?.y ?? null,
    crop_w: crop?.width ?? null,
    crop_h: crop?.height ?? null,

    // THE LIDL RULE, persisted. A member price that reached this point without
    // naming its programme would be rejected by the database — but createOffer
    // already forbids constructing one, so this is belt and braces.
    price_basis: isMemberOnly(offer.priceBasis) ? 'member-only' : 'everyone',
    loyalty_programme: isMemberOnly(offer.priceBasis) ? offer.priceBasis.programme : null,

    source_category: offer.sourceCategory,
    source_url: offer.sourceUrl,

    storage: classified.storage ?? null,
    attributes: classified.attributes ?? {},

    taxonomy_confidence: classified.confidence,
    is_uncertain: classified.isUncertain,
    classification_key: classified.classificationKey ?? null,
    run_id: runId,
    is_active: true,
  }
}
