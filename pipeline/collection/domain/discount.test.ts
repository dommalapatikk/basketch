import { describe, expect, it } from 'vitest'

import { deriveDiscount, formatDiscount, isConsistentWithPrices, printedDiscount } from './discount'
import { createMoney } from './money'
import { isOk, unwrap } from './result'

const chf = (n: number) => unwrap(createMoney(n))

const MIGROS = { priceStepRappen: 5 }
const COOP = { priceStepRappen: 5 }
const DENNER = { priceStepRappen: 1 }
const LIDL = { priceStepRappen: 1 }

describe('Discount — printed', () => {
  it('accepts a printed badge and records its provenance and price step', () => {
    const d = unwrap(printedDiscount(33, MIGROS))
    expect(d.percent).toBe(33)
    expect(d.provenance).toBe('printed')
    expect(d.priceStepRappen).toBe(5)
  })

  it('rejects 0 and 100 and anything outside them', () => {
    expect(isOk(printedDiscount(0, MIGROS))).toBe(false)
    expect(isOk(printedDiscount(100, MIGROS))).toBe(false)
    expect(isOk(printedDiscount(-5, MIGROS))).toBe(false)
    expect(isOk(printedDiscount(150, MIGROS))).toBe(false)
  })

  it('rejects a price step that is not a positive integer — the ACL must declare a real grid', () => {
    expect(isOk(printedDiscount(33, { priceStepRappen: 0 }))).toBe(false)
    expect(isOk(printedDiscount(33, { priceStepRappen: -5 }))).toBe(false)
    expect(isOk(printedDiscount(33, { priceStepRappen: 2.5 }))).toBe(false)
  })
})

describe('Discount — derived', () => {
  it('computes from the two prices', () => {
    const d = unwrap(deriveDiscount(chf(2.7), chf(1.95)))
    expect(d.percent).toBeCloseTo(27.78, 2)
    expect(d.provenance).toBe('derived')
    expect(d.priceStepRappen).toBeNull()
  })

  it('refuses when the sale price is not actually lower', () => {
    expect(isOk(deriveDiscount(chf(5), chf(5)))).toBe(false)
    expect(isOk(deriveDiscount(chf(5), chf(6)))).toBe(false)
  })

  it('refuses a zero original price', () => {
    expect(isOk(deriveDiscount(chf(0), chf(0)))).toBe(false)
  })
})

describe('Discount — printed badges from real flyers stay consistent', () => {
  // These are the actual figures read off the flyers during source research.
  it('accepts Migros "33%" for 9.90 from 14.85 (really 33.33%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(33, MIGROS)), chf(14.85), chf(9.9))).toBe(true)
  })

  it('accepts Coop "27%" for 1.95 from 2.70 (really 27.78%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(27, COOP)), chf(2.7), chf(1.95))).toBe(true)
  })

  it('accepts Denner "25%" for 1.67 from 2.25 (really 25.78%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(25, DENNER)), chf(2.25), chf(1.67))).toBe(true)
  })

  it('accepts Denner "½ PREIS" parsed as 50% for 12.95 from 26.25', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(50, DENNER)), chf(26.25), chf(12.95))).toBe(true)
  })

  it('rejects a badge that is wildly wrong — the parser mis-paired a price', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(70, COOP)), chf(2.7), chf(1.95))).toBe(false)
  })

  it('rejects a badge when the sale price is not below the original', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(20, COOP)), chf(5), chf(5))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// WP-C2 — the discount guard is in real-world units (rappen), not percentage
// points. Retail rounding happens in RAPPEN: on a cheap item, one 5-rappen
// step at Migros is worth more than 1.5 percentage points, so a genuine
// printed badge was being rejected as a mis-pair. See docs/rca/2026-09-15-
// tech-lead-items-6-9.md §Item 7 and docs/rca/2026-09-15-architect-review-
// of-tech-lead.md.
// ---------------------------------------------------------------------------
describe('Discount — WP-C2: consistency in rappen, per-retailer grid', () => {
  it('1.20 statt 1.85 at a printed 33% is consistent — Migros rounds shelf prices to 5 rappen', () => {
    // round(185 * (1 - 0.33)) = round(123.95) = 124 rappen; sale is 120 —
    // 4 rappen off, one rounding step, and > 1.5pp (it is 2.135pp).
    expect(isConsistentWithPrices(unwrap(printedDiscount(33, MIGROS)), chf(1.85), chf(1.2))).toBe(true)
  })

  it('4.30 -> 1.90 at 33% is still rejected — the WP-C1 mis-pair, 98 rappen off the grid', () => {
    // round(430 * (1 - 0.33)) = round(288.1) = 288 rappen; sale is 190 —
    // 98 rappen off, nowhere near a single Migros rounding step.
    expect(isConsistentWithPrices(unwrap(printedDiscount(33, MIGROS)), chf(4.3), chf(1.9))).toBe(false)
  })

  it("Lidl's 1-rappen grid does not widen Lidl's tolerance", () => {
    // CLAUDE.md's own example: Lidl red grapes at 1.39 / 1.49 — Lidl is not
    // on a 5-rappen grid. A printed "10%" (true ~6.71%, 3.29pp off) fails
    // the pp rule. round(149 * (1 - 0.10)) = round(134.1) = 134 rappen;
    // sale is 139 — 5 rappen off. Lidl's real 1-rappen grid rejects it...
    expect(isConsistentWithPrices(unwrap(printedDiscount(10, LIDL)), chf(1.49), chf(1.39))).toBe(false)
    // ...but a UNIVERSAL 5-rappen step (the Migros/Coop grid, wrongly
    // applied to Lidl) would wrongly accept the very same badge.
    expect(isConsistentWithPrices(unwrap(printedDiscount(10, { priceStepRappen: 5 })), chf(1.49), chf(1.39))).toBe(
      true,
    )
  })

  it('a discount we derived ourselves is not judged by the rappen rule', () => {
    // A derived discount is exact by construction, so deriveDiscount() never
    // carries a priceStepRappen. This proves the grid arm is gated on
    // provenance, not merely on priceStepRappen being present: the SAME
    // 4-rappen gap that test 1 above accepts for a PRINTED 33% badge (Migros
    // 1.20 statt 1.85) must still be rejected here, because a 'derived'
    // Discount that (wrongly) carried a priceStepRappen must not benefit
    // from the grid.
    const derived = unwrap(deriveDiscount(chf(2), chf(1)))
    const derivedButLeaksGrid = { ...derived, percent: 33, priceStepRappen: 5 }
    expect(isConsistentWithPrices(derivedButLeaksGrid, chf(1.85), chf(1.2))).toBe(false)
  })

  it('the pp rule is not redundant — a real Coop fixture pair the grid alone would reject', () => {
    // Coop 101.70 -> 45.60 printed "55%" (real fixture: __fixtures__/
    // vendors-coop-page1.html). True percent is 55.16% (0.16pp off — trivial
    // for the pp rule). But round(10170 * (1 - 0.55)) = round(4576.5) = 4577
    // rappen; sale is 4560 — 17 rappen off, past Coop's 5-rappen grid. On an
    // expensive item, 5 rappen is a vanishingly small share of the price, so
    // the grid alone is too tight here; the pp rule is what accepts it.
    expect(isConsistentWithPrices(unwrap(printedDiscount(55, COOP)), chf(101.7), chf(45.6))).toBe(true)
  })
})

describe('Discount — display', () => {
  it('rounds to whole percent, as flyers print it', () => {
    expect(formatDiscount(unwrap(deriveDiscount(chf(2.7), chf(1.95))))).toBe('28%')
    expect(formatDiscount(unwrap(printedDiscount(33, MIGROS)))).toBe('33%')
  })
})
