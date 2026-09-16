import { describe, expect, it } from 'vitest'

import {
  MAX_PRICE_STEP_RAPPEN,
  deriveDiscount,
  discountConsistencyReason,
  formatDiscount,
  isConsistentWithPrices,
  printedDiscount,
} from './discount'
import { createMoney } from './money'
import { isOk, unwrap } from './result'

const chf = (n: number) => unwrap(createMoney(n))

const MIGROS = { priceStepRappen: 5 }
const COOP = { priceStepRappen: 5 }
const DENNER = { priceStepRappen: 1 }
const LIDL = { priceStepRappen: 1 }
const VOLG = { priceStepRappen: 5 }
const SPAR = { priceStepRappen: 5 }

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

  it('rejects a price step above MAX_PRICE_STEP_RAPPEN — an ACL cannot buy unbounded slack', () => {
    expect(isOk(printedDiscount(33, { priceStepRappen: MAX_PRICE_STEP_RAPPEN }))).toBe(true)
    expect(isOk(printedDiscount(33, { priceStepRappen: MAX_PRICE_STEP_RAPPEN + 1 }))).toBe(false)
    expect(isOk(printedDiscount(33, { priceStepRappen: 50 }))).toBe(false)
  })

  it('the cap is not decorative — an uncapped step of 50 would accept a badge 5 percentage points wrong', () => {
    // A synthetic illustration of exactly what the cap prevents (not a real
    // fixture mis-pair — verified separately that WP-C1's tile geometry
    // already keeps the real Migros mis-pairs, 98/414/185 rappen off, out
    // of reach of ANY price step, since the wrong candidate never clears
    // geometry to reach a discount check at all). CHF 10.00 printed "30%"
    // against a real sale of 6.50 is really 35% (5pp off — already outside
    // the pp rule). round(1000 * 0.70) = 700 rappen; sale is 650 — 50 rappen
    // off. A step of 50 would wrongly call that consistent; MAX_PRICE_STEP_
    // RAPPEN keeps 50 unconstructable in the first place, so this can only
    // be demonstrated by hand-building the Discount object.
    const uncappedStep = { percent: 30, provenance: 'printed' as const, priceStepRappen: 50 }
    expect(isConsistentWithPrices(uncappedStep, chf(10), chf(6.5))).toBe(true)
    // The same pair, capped at MAX_PRICE_STEP_RAPPEN, correctly rejects it.
    const cappedStep = { ...uncappedStep, priceStepRappen: MAX_PRICE_STEP_RAPPEN }
    expect(isConsistentWithPrices(cappedStep, chf(10), chf(6.5))).toBe(false)
  })
})

describe('Discount — derived', () => {
  it('computes from the two prices', () => {
    const d = unwrap(deriveDiscount(chf(2.7), chf(1.95)))
    expect(d.percent).toBeCloseTo(27.78, 2)
    expect(d.provenance).toBe('derived')
    // The union (F4) makes this unrepresentable at the type level; this
    // confirms the runtime object matches — no stray field survives a future
    // refactor that forgets the type only forbids it at compile time.
    expect(d).not.toHaveProperty('priceStepRappen')
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
    // carries a priceStepRappen — the discriminated union (F4) makes a
    // derived Discount WITH a grid unrepresentable through the normal
    // factories. This test bypasses that on purpose (object spread, not
    // `deriveDiscount`) to prove `isConsistentWithPrices` itself still gates
    // on provenance at runtime, in case a future caller ever constructs a
    // Discount some other way: the SAME 4-rappen gap that test 1 above
    // accepts for a PRINTED 33% badge (Migros 1.20 statt 1.85) must still be
    // rejected here.
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

// ---------------------------------------------------------------------------
// D6-mandated boundary tests: consistency at EACH fixture's cheapest real
// printed-badge original. The relative width of both the pp rule and the
// rappen grid is largest at the cheapest price, so that is where a
// too-loose declaration would first misbehave. Each triple below is the
// real (original, sale, printed%) pair with the lowest original price that
// carries a printed badge in that retailer's committed fixture (verified by
// running the real parser against the fixture, not eyeballed).
// ---------------------------------------------------------------------------
describe('Discount — D6 boundary: consistency at the cheapest real printed-badge original in each fixture', () => {
  it('Migros cheapest: Delikatess-Fleischkase 1.15 statt 1.75, printed 33% (true 34.29%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(33, MIGROS)), chf(1.75), chf(1.15))).toBe(true)
    // A badge that is genuinely wrong at this same cheap price is still
    // rejected — the grid's looseness does not extend to 68 rappen off.
    expect(isConsistentWithPrices(unwrap(printedDiscount(73, MIGROS)), chf(1.75), chf(1.15))).toBe(false)
  })

  it('Coop cheapest: 4.45 statt 9.95, printed 55% (true 55.28%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(55, COOP)), chf(9.95), chf(4.45))).toBe(true)
    expect(isConsistentWithPrices(unwrap(printedDiscount(95, COOP)), chf(9.95), chf(4.45))).toBe(false)
  })

  it('Denner cheapest: Schweinsnierstück 1.67 statt 2.25, printed 25% (true 25.78%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(25, DENNER)), chf(2.25), chf(1.67))).toBe(true)
    expect(isConsistentWithPrices(unwrap(printedDiscount(65, DENNER)), chf(2.25), chf(1.67))).toBe(false)
  })

  it('Volg cheapest: Agri Natura Schweinsgeschnetzeltes 2.00 statt 2.50, printed 20% (exact)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(20, VOLG)), chf(2.5), chf(2))).toBe(true)
    expect(isConsistentWithPrices(unwrap(printedDiscount(60, VOLG)), chf(2.5), chf(2))).toBe(false)
  })

  it('Spar cheapest: Frifag Pouletschenkel gewürzt 0.95 statt 1.40, printed 32% (true 32.14%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(32, SPAR)), chf(1.4), chf(0.95))).toBe(true)
    expect(isConsistentWithPrices(unwrap(printedDiscount(72, SPAR)), chf(1.4), chf(0.95))).toBe(false)
  })
})

describe('discountConsistencyReason — F6: which rule accepted a printed badge', () => {
  it("reports 'pp' when the pp rule alone accepts (Coop's cheapest real pair)", () => {
    expect(discountConsistencyReason(unwrap(printedDiscount(55, COOP)), chf(9.95), chf(4.45))).toBe('pp')
  })

  it("reports 'grid' when only the rappen grid accepts (Migros 1.20 statt 1.85)", () => {
    expect(discountConsistencyReason(unwrap(printedDiscount(33, MIGROS)), chf(1.85), chf(1.2))).toBe('grid')
  })

  it('reports null for a genuine mis-pair — neither rule accepts', () => {
    expect(discountConsistencyReason(unwrap(printedDiscount(33, MIGROS)), chf(4.3), chf(1.9))).toBeNull()
  })

  it('isConsistentWithPrices agrees with discountConsistencyReason on every case above — one implementation', () => {
    const cases: Array<[Parameters<typeof printedDiscount>, [number, number]]> = [
      [[55, COOP], [9.95, 4.45]],
      [[33, MIGROS], [1.85, 1.2]],
      [[33, MIGROS], [4.3, 1.9]],
    ]
    for (const [[pct, step], [original, sale]] of cases) {
      const reason = discountConsistencyReason(unwrap(printedDiscount(pct, step)), chf(original), chf(sale))
      expect(isConsistentWithPrices(unwrap(printedDiscount(pct, step)), chf(original), chf(sale))).toBe(
        reason !== null,
      )
    }
  })
})

describe('Discount — display', () => {
  it('rounds to whole percent, as flyers print it', () => {
    expect(formatDiscount(unwrap(deriveDiscount(chf(2.7), chf(1.95))))).toBe('28%')
    expect(formatDiscount(unwrap(printedDiscount(33, MIGROS)))).toBe('33%')
  })
})
