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
}

/**
 * Widest gap ever observed between a printed badge and the true percentage.
 * Retailers round to whole numbers and occasionally round generously; 1.5pp
 * absorbs that without hiding a genuinely wrong badge.
 */
export const PRINTED_DISCOUNT_TOLERANCE_PP = 1.5

export function printedDiscount(percent: number): Result<Discount> {
  if (!Number.isFinite(percent)) return err(`Discount percent must be finite, got ${percent}`)
  if (percent <= 0) return err(`Discount percent must be greater than 0, got ${percent}`)
  if (percent >= 100) return err(`Discount percent must be below 100, got ${percent}`)
  return ok({ percent, provenance: 'printed' })
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
  return ok({ percent: computeDiscountPercent(original, sale), provenance: 'derived' })
}

/**
 * Is a printed badge consistent with the two prices? Used by the Offer
 * constructor — a badge that is wildly wrong means the parser mis-paired a
 * price with a product, which is a defect worth failing on.
 */
export function isConsistentWithPrices(d: Discount, original: Money, sale: Money): boolean {
  if (original.rappen <= 0 || sale.rappen >= original.rappen) return false
  const actual = computeDiscountPercent(original, sale)
  return Math.abs(actual - d.percent) <= PRINTED_DISCOUNT_TOLERANCE_PP
}

/** Whole-number percentage for display, matching how flyers print it. */
export function formatDiscount(d: Discount): string {
  return `${Math.round(d.percent)}%`
}
