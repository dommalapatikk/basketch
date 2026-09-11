import { describe, expect, it } from 'vitest'

import { isOk, unwrap } from './result'
import { createValidityPeriod, hasExpiredOn, isActiveOn } from './validity-period'

describe('ValidityPeriod', () => {
  it('accepts a normal Swiss promo week (Thu -> Wed)', () => {
    const p = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))
    expect(p.from).toBe('2026-09-03')
    expect(p.to).toBe('2026-09-09')
  })

  it('accepts a single-day promotion', () => {
    expect(isOk(createValidityPeriod('2026-09-03', '2026-09-03'))).toBe(true)
  })

  it('rejects an end date before the start date', () => {
    expect(isOk(createValidityPeriod('2026-09-09', '2026-09-03'))).toBe(false)
  })

  it('rejects malformed dates rather than coercing them', () => {
    expect(isOk(createValidityPeriod('03.09.2026', '2026-09-09'))).toBe(false)
    expect(isOk(createValidityPeriod('2026-9-3', '2026-09-09'))).toBe(false)
    expect(isOk(createValidityPeriod('not-a-date', '2026-09-09'))).toBe(false)
  })

  it('rejects a calendar-impossible date', () => {
    expect(isOk(createValidityPeriod('2026-02-30', '2026-03-01'))).toBe(false)
  })

  it('knows whether it is active on a given day, inclusive at both ends', () => {
    const p = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))
    expect(isActiveOn(p, '2026-09-03')).toBe(true)
    expect(isActiveOn(p, '2026-09-06')).toBe(true)
    expect(isActiveOn(p, '2026-09-09')).toBe(true)
    expect(isActiveOn(p, '2026-09-02')).toBe(false)
    expect(isActiveOn(p, '2026-09-10')).toBe(false)
  })

  it('reports expiry — the legal requirement to expire aggressively', () => {
    const p = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))
    expect(hasExpiredOn(p, '2026-09-09')).toBe(false)
    expect(hasExpiredOn(p, '2026-09-10')).toBe(true)
  })
})
