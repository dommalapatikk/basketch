import { describe, expect, it } from 'vitest'

import { deriveDiscount, formatDiscount, isConsistentWithPrices, printedDiscount } from './discount'
import { createMoney } from './money'
import { isOk, unwrap } from './result'

const chf = (n: number) => unwrap(createMoney(n))

describe('Discount — printed', () => {
  it('accepts a printed badge and records its provenance', () => {
    const d = unwrap(printedDiscount(33))
    expect(d.percent).toBe(33)
    expect(d.provenance).toBe('printed')
  })

  it('rejects 0 and 100 and anything outside them', () => {
    expect(isOk(printedDiscount(0))).toBe(false)
    expect(isOk(printedDiscount(100))).toBe(false)
    expect(isOk(printedDiscount(-5))).toBe(false)
    expect(isOk(printedDiscount(150))).toBe(false)
  })
})

describe('Discount — derived', () => {
  it('computes from the two prices', () => {
    const d = unwrap(deriveDiscount(chf(2.7), chf(1.95)))
    expect(d.percent).toBeCloseTo(27.78, 2)
    expect(d.provenance).toBe('derived')
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
    expect(isConsistentWithPrices(unwrap(printedDiscount(33)), chf(14.85), chf(9.9))).toBe(true)
  })

  it('accepts Coop "27%" for 1.95 from 2.70 (really 27.78%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(27)), chf(2.7), chf(1.95))).toBe(true)
  })

  it('accepts Denner "25%" for 1.67 from 2.25 (really 25.78%)', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(25)), chf(2.25), chf(1.67))).toBe(true)
  })

  it('accepts Denner "½ PREIS" parsed as 50% for 12.95 from 26.25', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(50)), chf(26.25), chf(12.95))).toBe(true)
  })

  it('rejects a badge that is wildly wrong — the parser mis-paired a price', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(70)), chf(2.7), chf(1.95))).toBe(false)
  })

  it('rejects a badge when the sale price is not below the original', () => {
    expect(isConsistentWithPrices(unwrap(printedDiscount(20)), chf(5), chf(5))).toBe(false)
  })
})

describe('Discount — display', () => {
  it('rounds to whole percent, as flyers print it', () => {
    expect(formatDiscount(unwrap(deriveDiscount(chf(2.7), chf(1.95))))).toBe('28%')
    expect(formatDiscount(unwrap(printedDiscount(33)))).toBe('33%')
  })
})
