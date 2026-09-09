import { describe, expect, it } from 'vitest'

import { addMoney, createMoney, formatMoney, moneyFromRappen, toFrancs } from './money'
import { isOk, unwrap } from './result'

describe('Money', () => {
  it('accepts a normal Swiss price', () => {
    const m = unwrap(createMoney(1.95))
    expect(toFrancs(m)).toBe(1.95)
  })

  it('stores integer rappen, so cent arithmetic is exact', () => {
    // The reason Money exists: 0.1 + 0.2 !== 0.3 in float.
    const a = unwrap(createMoney(0.1))
    const b = unwrap(createMoney(0.2))
    expect(toFrancs(unwrap(addMoney(a, b)))).toBe(0.3)
  })

  it('rejects a negative amount', () => {
    expect(isOk(createMoney(-1))).toBe(false)
  })

  it('rejects a non-finite amount', () => {
    expect(isOk(createMoney(Number.NaN))).toBe(false)
    expect(isOk(createMoney(Number.POSITIVE_INFINITY))).toBe(false)
  })

  it('rejects sub-rappen precision rather than silently rounding a price', () => {
    // A price of 1.234 means the parser misread something. Fail loudly.
    expect(isOk(createMoney(1.234))).toBe(false)
  })

  it('allows zero (a free item is a real promotion)', () => {
    expect(isOk(createMoney(0))).toBe(true)
  })

  it('tolerates float representation error from parsed input', () => {
    // 19.99 * 100 = 1998.9999999999998 in IEEE-754. Must still be accepted.
    expect(toFrancs(unwrap(createMoney(19.99)))).toBe(19.99)
    expect(toFrancs(unwrap(createMoney(70.7)))).toBe(70.7)
  })

  it('formats in Swiss retail convention', () => {
    expect(formatMoney(unwrap(createMoney(1.95)))).toBe('1.95')
    expect(formatMoney(unwrap(createMoney(12)))).toBe('12.00')
  })

  it('round-trips through rappen', () => {
    const m = unwrap(moneyFromRappen(1495))
    expect(toFrancs(m)).toBe(14.95)
  })

  it('rejects non-integer rappen', () => {
    expect(isOk(moneyFromRappen(10.5))).toBe(false)
  })
})
