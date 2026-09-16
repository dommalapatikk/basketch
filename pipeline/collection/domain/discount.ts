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

/**
 * Widest a retailer's own shelf-price rounding grid may be, in rappen.
 * `priceStepRappen` is retailer-declared (WP-C2), not domain-computed, so the
 * domain caps how much slack a single declaration can buy. 10 rappen already
 * exceeds every real grid seen (Migros/Coop/Volg/Spar 5, Denner/Lidl 1) —
 * above it, `isConsistentWithPrices` would start accepting genuine mis-pairs
 * (see docs/rca/2026-09-15-tech-lead-items-6-9.md §Item 7: the three real
 * WP-C1 mis-pairs are 98, 414 and 185 rappen off).
 */
export const MAX_PRICE_STEP_RAPPEN = 10

export type PrintedDiscount = {
  readonly percent: number
  readonly provenance: 'printed'
  readonly priceStepRappen: number
}
export type DerivedDiscount = { readonly percent: number; readonly provenance: 'derived' }

/**
 * A printed discount carries the retailer's own shelf-price rounding grid; a
 * derived one is exact by construction (computed FROM the two prices) and
 * needs none. The union makes "a derived discount with a grid" unrepresentable
 * — no defensive runtime check can be skipped by forgetting it.
 */
export type Discount = PrintedDiscount | DerivedDiscount

/**
 * Widest gap ever observed between a printed badge and the true percentage,
 * in PERCENTAGE POINTS. Retailers round to whole numbers and occasionally
 * round generously; 1.5pp absorbs that without hiding a genuinely wrong
 * badge. This rule alone is not unit-safe: on a cheap item, one rappen of
 * shelf-price rounding is worth more than 1.5pp (see `priceStepRappen`
 * below), which is why the two rules are combined with OR.
 */
export const PRINTED_DISCOUNT_TOLERANCE_PP = 1.5

export function printedDiscount(percent: number, options: { priceStepRappen: number }): Result<PrintedDiscount> {
  if (!Number.isFinite(percent)) return err(`Discount percent must be finite, got ${percent}`)
  if (percent <= 0) return err(`Discount percent must be greater than 0, got ${percent}`)
  if (percent >= 100) return err(`Discount percent must be below 100, got ${percent}`)
  const { priceStepRappen } = options
  if (!Number.isInteger(priceStepRappen) || priceStepRappen <= 0 || priceStepRappen > MAX_PRICE_STEP_RAPPEN) {
    return err(
      `priceStepRappen must be a positive integer no greater than ${MAX_PRICE_STEP_RAPPEN}, got ${priceStepRappen}`,
    )
  }
  return ok({ percent, provenance: 'printed', priceStepRappen })
}

/** Exact percentage off, unrounded. */
export function computeDiscountPercent(original: Money, sale: Money): number {
  return ((original.rappen - sale.rappen) / original.rappen) * 100
}

export function deriveDiscount(original: Money, sale: Money): Result<DerivedDiscount> {
  if (original.rappen <= 0) return err('cannot derive a discount from a zero original price')
  if (sale.rappen >= original.rappen) {
    return err(`sale price (${toFrancs(sale)}) must be below original price (${toFrancs(original)})`)
  }
  return ok({ percent: computeDiscountPercent(original, sale), provenance: 'derived' })
}

/**
 * Which of the two independent consistency rules a printed badge satisfies,
 * or `null` if neither does. Exists so a caller can tell (for observability
 * — WP-C2, F6) whether a printed badge only cleared because of the rappen
 * grid, without re-deriving the check itself; `isConsistentWithPrices` below
 * is defined in terms of this so there is exactly one implementation.
 *
 *  1. `'pp'` — the true percentage is within `PRINTED_DISCOUNT_TOLERANCE_PP`
 *     of the printed one. Unit-safe at high prices, too tight at low ones.
 *  2. `'grid'` (printed badges only) — the sale price implied by rounding
 *     `original * (1 - percent/100)` to the retailer's own shelf-price grid
 *     is within one step of the actual sale price. A single `priceStepRappen`
 *     rounding step is worth more percentage points on a cheap item than on
 *     an expensive one, which the pp rule cannot express.
 *
 * WP-C2 is a BACKSTOP behind WP-C1's tile geometry, not a substitute for it:
 * tile geometry is what stops a price being paired with the wrong product in
 * the first place. At a low sale price the grid arm can dominate (5 rappen on
 * a CHF 0.50 item is 10% relative) — acceptable only because a genuine
 * mis-pair should already have been caught upstream.
 */
export function discountConsistencyReason(d: Discount, original: Money, sale: Money): 'pp' | 'grid' | null {
  if (original.rappen <= 0 || sale.rappen >= original.rappen) return null
  const actual = computeDiscountPercent(original, sale)
  if (Math.abs(actual - d.percent) <= PRINTED_DISCOUNT_TOLERANCE_PP) return 'pp'

  // Never applies to a derived discount — it is exact by construction (the
  // ALDI/derive path never reaches here in practice, since createOffer only
  // calls this for a printed badge). The union above makes a derived
  // discount with a grid unrepresentable, so this narrows the type rather
  // than defending against a state the constructor already forbids.
  if (d.provenance !== 'printed') return null

  const expectedSaleRappen = Math.round(original.rappen * (1 - d.percent / 100))
  return Math.abs(expectedSaleRappen - sale.rappen) <= d.priceStepRappen ? 'grid' : null
}

/**
 * Is a printed badge consistent with the two prices? Used by the Offer
 * constructor — a badge that is wildly wrong means the parser mis-paired a
 * price with a product, which is a defect worth failing on.
 */
export function isConsistentWithPrices(d: Discount, original: Money, sale: Money): boolean {
  return discountConsistencyReason(d, original, sale) !== null
}

/** Whole-number percentage for display, matching how flyers print it. */
export function formatDiscount(d: Discount): string {
  return `${Math.round(d.percent)}%`
}
