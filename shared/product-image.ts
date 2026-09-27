// ProductImage / CropRegion — moved here from
// pipeline/collection/domain/product-image.ts (WP-1d, ADR-IMG-1) so
// `dealToRow` (this file's sibling, `types.ts`) can accept one on
// `UnifiedDeal` and write it in the SAME statement as every other column,
// without an import that would run shared -> pipeline (the wrong direction).
//
// WHY THE SINGLE MAIN-ROW WRITE (ADR-IMG-1, tech-lead cross-review §1.1):
// the image used to be split across two writes — a source-url through the
// main upsert, a CropRegion through a second "enrichment" pass keyed on a
// string built from (store, product_name, valid_from). That gave one value
// object two owners, two keys and a cross-statement CHECK
// (`deals_one_image_kind`), and every boundary between the two writes was a
// place the picture could silently become null (a held-back deal, a `|` in
// the product name, a Map-vs-dedupe mismatch on which offer "won"). Writing
// all six image columns from ONE function, in the SAME upsert as the price,
// removes every one of those boundaries at once.
//
// BRANDED, ON PURPOSE. The tech lead's condition on ADR-IMG-1 (§1.1): once
// this type lives in the shared kernel, ANY code — not just the collection
// domain's own constructors — can write a structurally-matching object
// literal. A literal `{ kind: 'crop-region', region: {...} }` would satisfy a
// plain discriminated union and skip every invariant `cropRegionImage`
// enforces (x + width <= 1, an http(s) url, non-zero width/height, ...). One
// bad literal poisons `imageColumns`'s output for a WHOLE upsert BATCH
// (`store.ts` BATCH_SIZE = 100 rows), because `deals_crop_fractions` and
// `deals_one_image_kind` are per-STATEMENT CHECKs, not per-row.
//
// The brand is a property keyed by `PRODUCT_IMAGE_BRAND`, a real `Symbol()`
// value exported from this one file. TypeScript's structural typing cannot
// be fooled by a STRING tag (`{ __brand: 'ProductImage' }` — any file can
// write that same string), but an object literal that does not explicitly
// import and set this exact symbol-keyed property does not compile against
// `ProductImage`. In practice that means: use `sourceUrlImage`,
// `cropRegionImage` or `cropRegionFromPoints`
// (`pipeline/collection/domain/product-image.ts`) — the only functions that
// import this symbol — rather than writing a literal.

/** Not meant to be imported anywhere but a ProductImage constructor. */
export const PRODUCT_IMAGE_BRAND = Symbol('ProductImage')

export type CropRegion = {
  /** Page image the crop applies to. Hotlinked, never copied. */
  readonly pageImageUrl: string
  /** All four are fractions of the page, 0..1. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type ProductImage =
  | { readonly kind: 'source-url'; readonly url: string; readonly [PRODUCT_IMAGE_BRAND]: true }
  | { readonly kind: 'crop-region'; readonly region: CropRegion; readonly [PRODUCT_IMAGE_BRAND]: true }

/** Exactly the five `deals` columns a ProductImage maps to. */
export type ImageColumns = {
  readonly image_url: string | null
  readonly page_image_url: string | null
  readonly crop_x: number | null
  readonly crop_y: number | null
  readonly crop_w: number | null
  readonly crop_h: number | null
}

/**
 * Maps a `ProductImage | null` onto the six `deals` image columns.
 *
 * TOTAL, ON PURPOSE (ADR-IMG-1 condition 2): every branch returns all six
 * keys, with nulls when there is no image of that kind. A batch upsert sends
 * one column set for every row in the statement — PostgREST rejects a batch
 * whose rows disagree on which keys are present — so a partial object here
 * would not just be a bug in one row, it would break the WHOLE BATCH the
 * moment one row in it carries a different image kind than the others.
 */
export function imageColumns(image: ProductImage | null): ImageColumns {
  if (image === null) {
    return { image_url: null, page_image_url: null, crop_x: null, crop_y: null, crop_w: null, crop_h: null }
  }
  if (image.kind === 'source-url') {
    return { image_url: image.url, page_image_url: null, crop_x: null, crop_y: null, crop_w: null, crop_h: null }
  }
  const { region } = image
  return {
    image_url: null,
    page_image_url: region.pageImageUrl,
    crop_x: region.x,
    crop_y: region.y,
    crop_w: region.width,
    crop_h: region.height,
  }
}
