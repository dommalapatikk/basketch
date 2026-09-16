// Discount — value object. The percentage off, and where that number came from.
//
// WHY provenance matters: retailers PRINT a rounded percentage. Migros shows
// "33%" for 9.90 down from 14.85, which is actually 33.33%. Coop shows "27%"
// for 1.95 from 2.70, actually 27.78%. If we recompute and overwrite, we
// contradict the printed flyer; if we demand exact equality we reject valid
// real data. So: the printed figure wins and is marked as printed, a computed
// one is marked derived, and consistency is checked within a tolerance.
//
// ALDI is why `derive` can fail: only ~14 of 44 flyer pages carry a reference
// price. No original price means no discount — never invent one.

import { type Money, toFrancs } from './money'
import { type Result, err, ok } from './result'

export type DiscountProvenance = 'printed' | 'derived'

export type Discount = {
  readonly percent: number
  readonly provenance: DiscountProvenance
  /**
   * The retailer's shelf-price rounding grid, in rappen, declared by the ACL
   * that printed this badge — e.g. `printedDiscount(33, { priceStepRappen: 5 })`.
   * Null for a derived discount: it is exact by construction and needs no
   * tolerance (WP-C2).
   */
  readonly priceStepRappen: number | null
}

/**
 * Widest gap ever observed between a printed badge and the true percentage,
 * in PERCENTAGE POINTS. Retailers round to whole numbers and occasionally
 * round generously; 1.5pp absorbs that without hiding a genuinely wrong
 * badge. This rule alone is not unit-safe: on a cheap item, one rappen of
 * shelf-price rounding is worth more than 1.5pp (see `priceStepRappen`
 * below), which is why the two rules are combined with OR.
 */
export const PRINTED_DISCOUNT_TOLERANCE_PP = 1.5

export function printedDiscount(percent: number, options: { priceStepRappen: number }): Result<Discount> {
  if (!Number.isFinite(percent)) return err(`Discount percent must be finite, got ${percent}`)
  if (percent <= 0) return err(`Discount percent must be greater than 0, got ${percent}`)
  if (percent >= 100) return err(`Discount percent must be below 100, got ${percent}`)
  const { priceStepRappen } = options
  if (!Number.isInteger(priceStepRappen) || priceStepRappen <= 0) {
    return err(`priceStepRappen must be a positive integer, got ${priceStepRappen}`)
  }
  return ok({ percent, provenance: 'printed', priceStepRappen })
}

/** Exact percentage off, unrounded. */
export function computeDiscountPercent(original: Money, sale: Money): number {
  return ((original.rappen - sale.rappen) / original.rappen) * 100
}

export function deriveDiscount(original: Money, sale: Money): Result<Discount> {
  if (original.rappen <= 0) return err('cannot derive a discount from a zero original price')
  if (sale.rappen >= original.rappen) {
    return err(`sale price (${toFrancs(sale)}) must be below original price (${toFrancs(original)})`)
  }
  return ok({ percent: computeDiscountPercent(original, sale), provenance: 'derived', priceStepRappen: null })
}

/**
 * Is a printed badge consistent with the two prices? Used by the Offer
 * constructor — a badge that is wildly wrong means the parser mis-paired a
 * price with a product, which is a defect worth failing on.
 *
 * Two independent rules, combined with OR:
 *
 *  1. The pp rule — the true percentage is within `PRINTED_DISCOUNT_TOLERANCE_PP`
 *     of the printed one. Unit-safe at high prices, too tight at low ones.
 *  2. The rappen-grid rule (WP-C2, printed badges only) — the sale price
 *     implied by rounding `original * (1 - percent/100)` to the retailer's own
 *     shelf-price grid is within one step of the actual sale price. A single
 *     `priceStepRappen` rounding step is worth more percentage points on a
 *     cheap item than on an expensive one, which the pp rule cannot express.
 *
 * WP-C2 is a BACKSTOP behind WP-C1's tile geometry, not a substitute for it:
 * tile geometry is what stops a price being paired with the wrong product in
 * the first place. At a low sale price the grid arm can dominate (5 rappen on
 * a CHF 0.50 item is 10% relative) — acceptable only because a genuine
 * mis-pair should already have been caught upstream.
 */
export function isConsistentWithPrices(d: Discount, original: Money, sale: Money): boolean {
  if (original.rappen <= 0 || sale.rappen >= original.rappen) return false
  const actual = computeDiscountPercent(original, sale)
  if (Math.abs(actual - d.percent) <= PRINTED_DISCOUNT_TOLERANCE_PP) return true

  // Never applies to a derived discount — it is exact by construction and
  // carries no priceStepRappen (the ALDI/derive path never reaches here in
  // practice, since createOffer only calls this for a printed badge).
  if (d.provenance !== 'printed' || d.priceStepRappen === null) return false

  const expectedSaleRappen = Math.round(original.rappen * (1 - d.percent / 100))
  return Math.abs(expectedSaleRappen - sale.rappen) <= d.priceStepRappen
}

/** Whole-number percentage for display, matching how flyers print it. */
export function formatDiscount(d: Discount): string {
  return `${Math.round(d.percent)}%`
}
