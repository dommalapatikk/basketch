// Offer — the aggregate root. One promoted product, one retailer, one period.
//
// Every rule below exists because of a defect found in real source data during
// the 2026-09 source research. See docs/data-source-research-2026-09-07.md.
//
// The whole point of this file: an invalid Offer cannot be constructed. There is
// no setter, no `validate()` to forget to call, and no partially-built state.

import { type Discount, deriveDiscount, isConsistentWithPrices } from './discount'
import { type Money, toFrancs } from './money'
import { type PriceBasis, isMemberOnly } from './price-basis'
import type { ProductImage } from './product-image'
import { SINGLE_ITEM, type QuantityRequirement, isMinimumQuantity } from './quantity-requirement'
import { type Result, err, ok } from './result'
import { EMPTY_SOURCE_ATTRIBUTES, type SourceAttributes } from './source-attributes'
import type { ValidityPeriod } from './validity-period'
import { isDisplayTruncated, normalizeProductName } from '../../../shared/types'

export const RETAILERS = ['migros', 'coop', 'lidl', 'aldi', 'denner', 'spar', 'volg'] as const
export type Retailer = (typeof RETAILERS)[number]

export type Offer = {
  readonly retailer: Retailer
  readonly productName: string
  readonly salePrice: Money
  readonly originalPrice: Money | null
  readonly discount: Discount | null
  readonly validity: ValidityPeriod
  readonly priceBasis: PriceBasis
  /**
   * How many items must be bought for this price (WP-C4, TP-7a). Independent
   * of `priceBasis` — see the file header for why a union of the two would be
   * wrong. Defaults to `SINGLE_ITEM`: most offers apply to one item.
   */
  readonly quantityRequirement: QuantityRequirement
  readonly image: ProductImage | null
  /** The retailer's own category, where it publishes one (Denner, Migros). */
  readonly sourceCategory: string | null
  /**
   * Metadata the retailer published alongside the offer. Never guessed.
   * Component 2 fills from here before it considers a model call.
   */
  readonly sourceAttributes: SourceAttributes
  /** Link back to the offer or, for flyers, the flyer page. */
  readonly sourceUrl: string | null
}

export type OfferInput = {
  retailer: Retailer
  productName: string
  salePrice: Money
  originalPrice?: Money | null
  /** Printed badge, when the source prints one. Omit to derive from prices. */
  discount?: Discount | null
  validity: ValidityPeriod
  priceBasis?: PriceBasis
  /** Omit for the ordinary single-item price. */
  quantityRequirement?: QuantityRequirement
  image?: ProductImage | null
  sourceCategory?: string | null
  /** Omit when the retailer publishes nothing beyond name and price. */
  sourceAttributes?: SourceAttributes
  sourceUrl?: string | null
}

const PRICE_FOR_EVERYONE: PriceBasis = { kind: 'everyone' }

export function createOffer(input: OfferInput): Result<Offer> {
  const name = input.productName?.trim()
  if (!name) return err('Offer must have a product name')

  if (!RETAILERS.includes(input.retailer)) {
    return err(`Unknown retailer '${input.retailer}'`)
  }

  // salePrice > 0 — a promotion at zero francs is a parse failure, not a giveaway.
  if (input.salePrice.rappen <= 0) {
    return err(`Offer salePrice must be greater than 0, got ${toFrancs(input.salePrice)}`)
  }

  const originalPrice = input.originalPrice ?? null
  const providedDiscount = input.discount ?? null

  // THE ALDI RULE. Only ~14 of 44 ALDI flyer pages carry a reference price.
  // No original price means no discount — never back-compute one from a badge
  // we cannot verify against a real "statt" price.
  if (originalPrice === null && providedDiscount !== null) {
    return err('Offer cannot carry a discount without an original price (the ALDI rule)')
  }

  let discount: Discount | null = null

  if (originalPrice !== null) {
    if (originalPrice.rappen <= input.salePrice.rappen) {
      return err(
        `Offer originalPrice (${toFrancs(originalPrice)}) must exceed salePrice (${toFrancs(input.salePrice)})`,
      )
    }

    if (providedDiscount !== null) {
      // A printed badge wins, but must be plausible. A wild mismatch means the
      // parser paired a price with the wrong product.
      if (!isConsistentWithPrices(providedDiscount, originalPrice, input.salePrice)) {
        return err(
          `printed discount ${providedDiscount.percent}% is inconsistent with ` +
            `${toFrancs(originalPrice)} -> ${toFrancs(input.salePrice)}`,
        )
      }
      discount = providedDiscount
    } else {
      const derived = deriveDiscount(originalPrice, input.salePrice)
      if (!derived.ok) return err(derived.error)
      discount = derived.value
    }
  }

  const priceBasis = input.priceBasis ?? PRICE_FOR_EVERYONE

  // THE LIDL RULE. Lidl's flyer JSON reports the Lidl Plus price with no flag.
  // A member price must always name its programme so it can never render bare.
  if (isMemberOnly(priceBasis) && !priceBasis.programme) {
    return err('member-only price must name its loyalty programme (the LIDL rule)')
  }

  const quantityRequirement = input.quantityRequirement ?? SINGLE_ITEM

  // Re-enforced here, not just in `minimumQuantity()`'s own constructor —
  // same defensive shape as the LIDL rule above. `QuantityRequirement` is a
  // plain union, so a caller can construct `{ kind: 'minimum', count: 1 }`
  // by hand, bypassing the factory. An invariant that only exists in one
  // constructor a caller could skip is not enforced, it is a suggestion.
  if (isMinimumQuantity(quantityRequirement) && (!Number.isInteger(quantityRequirement.count) || quantityRequirement.count < 2)) {
    return err(
      `a minimum-quantity requirement must be a whole number of at least 2, got ${quantityRequirement.count}`,
    )
  }

  return ok({
    retailer: input.retailer,
    productName: name,
    salePrice: input.salePrice,
    originalPrice,
    discount,
    validity: input.validity,
    priceBasis,
    quantityRequirement,
    image: input.image ?? null,
    sourceCategory: input.sourceCategory?.trim() || null,
    sourceAttributes: input.sourceAttributes ?? EMPTY_SOURCE_ATTRIBUTES,
    sourceUrl: input.sourceUrl ?? null,
  })
}

/**
 * Identity for de-duplication.
 *
 * WHY: real sources repeat rows. Denner's own API returned "Danone Activia
 * Joghurt" twice on page 2 and "Purina ONE" twice on page 11 of the same
 * collection. Without a key, those become duplicate cards.
 *
 * Deliberately excludes image and sourceUrl: the same offer appearing twice
 * with different artwork is still one offer.
 *
 * EXCEPT when the name is display-truncated (WP-C3 / HANDOVER item 8). A
 * truncated name has already lost the vintage, shade or volume that made two
 * products distinct — aktionis' own "...Soave Classico...6x 75cl..." is the
 * 2024 vintage AND the 2025 vintage. Collapsing them a second time here, on
 * top of the source's own truncation, would silently drop a real offer. So a
 * truncated name also keys on sourceUrl: two offers that still look identical
 * after truncation are only the same offer if they link to the same place.
 *
 * Name identity uses `normalizeProductName` — the SAME normalisation storage
 * uses to match a row by name (HANDOVER §5: one definition, in the shared
 * kernel). Two definitions of "same name" is how 48 collided rows were once
 * reported as failed writes instead of collapses.
 *
 * Includes `quantityRequirement` (D2, WP-C4): a "from 2 items" price and the
 * ordinary single-item price for the SAME product, on the same dates, are two
 * different offers a shopper can choose between — not duplicates of one
 * another. Without this, a Migros multi-buy price would silently collapse
 * into its own everyone-price sibling the moment both exist for one product
 * in one week.
 */
export function offerKey(o: Offer): string {
  const name = normalizeProductName(o.productName)
  const basis = o.priceBasis.kind === 'everyone' ? 'all' : o.priceBasis.programme
  const quantity = o.quantityRequirement.kind === 'single' ? 'single' : `min${o.quantityRequirement.count}`
  const parts = [o.retailer, name, o.salePrice.rappen, o.validity.from, o.validity.to, basis, quantity]
  if (isDisplayTruncated(o.productName)) parts.push(o.sourceUrl ?? '')
  return parts.join('|')
}

/** Keeps the first occurrence of each key, preserving source order. */
export function dedupeOffers(offers: readonly Offer[]): Offer[] {
  const seen = new Set<string>()
  const out: Offer[] = []
  for (const o of offers) {
    const k = offerKey(o)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(o)
  }
  return out
}
