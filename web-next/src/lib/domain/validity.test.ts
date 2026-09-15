import { describe, expect, it } from 'vitest'

import { isInEffect, startsAfterToday, todayInZurich } from './validity'

/**
 * The defect this module exists to prevent (docs/rca/2026-09-15-final-plan.md
 * §1.3): on 2026-09-15, 283 of 1,523 deals had a `validFrom` after today.
 * ALDI, LIDL and SPAR had ZERO deals in effect — every one of them was next
 * week's flyer, fetched early and shown as if it were live today. No
 * component ever read `validFrom`; only `valid_to` was ever checked. This is
 * the one place "in effect" becomes a real predicate instead of half a rule.
 */

describe('todayInZurich — the date rule is Zurich, not UTC', () => {
  it('a deal starting Thursday is not "today" from a UTC read at 22:30 UTC (00:30 CEST)', () => {
    // 2026-09-17T22:30:00Z is 2026-09-18T00:30 in Zurich (CEST, UTC+2 in
    // September). Reading the UTC date here would say "2026-09-17" — a full
    // day behind the Zurich calendar for two hours every single day.
    const clock = () => new Date('2026-09-17T22:30:00Z')
    expect(todayInZurich(clock)).toBe('2026-09-18')
  })

  it('agrees with the UTC date away from the boundary', () => {
    const clock = () => new Date('2026-09-17T10:00:00Z')
    expect(todayInZurich(clock)).toBe('2026-09-17')
  })

  it('defaults to the system clock when none is injected', () => {
    // Not asserting a specific date — just that it runs and returns the
    // YYYY-MM-DD shape, so isInEffect/startsAfterToday can compare it
    // lexicographically against valid_from/valid_to.
    expect(todayInZurich()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isInEffect', () => {
  const window = { validFrom: '2026-09-10', validTo: '2026-09-16' }

  it('is true inside the window', () => {
    expect(isInEffect(window, '2026-09-13')).toBe(true)
  })

  it('is true on the first day, inclusive', () => {
    expect(isInEffect(window, '2026-09-10')).toBe(true)
  })

  it('is true on the last day, inclusive', () => {
    expect(isInEffect(window, '2026-09-16')).toBe(true)
  })

  it('is false before the window opens', () => {
    // The run 34833209176 defect: ALDI/LIDL/SPAR's 17.9 flyer, read on 15.9.
    expect(isInEffect({ validFrom: '2026-09-17', validTo: '2026-09-23' }, '2026-09-15')).toBe(false)
  })

  it('is false after the window has closed', () => {
    expect(isInEffect(window, '2026-09-17')).toBe(false)
  })
})

describe('startsAfterToday', () => {
  it('is true for a deal that has not started yet', () => {
    expect(startsAfterToday({ validFrom: '2026-09-17' }, '2026-09-15')).toBe(true)
  })

  it('is false on the first day it is valid', () => {
    expect(startsAfterToday({ validFrom: '2026-09-17' }, '2026-09-17')).toBe(false)
  })

  it('is false once the deal is already running', () => {
    expect(startsAfterToday({ validFrom: '2026-09-10' }, '2026-09-17')).toBe(false)
  })
})
