import { describe, expect, it } from 'vitest'

import { ageFromTimestamp } from './freshness-format'

const NOW = new Date('2026-09-27T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('ageFromTimestamp — bucket boundaries (Tech Lead ruling TL.1)', () => {
  it.each([
    [-1, { value: 1, unit: 'days' }], // clock skew: a future timestamp is "1 day", never 0 or negative
    [0, { value: 1, unit: 'days' }],
    [1, { value: 1, unit: 'days' }],
    [6, { value: 6, unit: 'days' }],
    [7, { value: 1, unit: 'weeks' }],
    [13, { value: 1, unit: 'weeks' }],
    [14, { value: 2, unit: 'weeks' }],
    [27, { value: 3, unit: 'weeks' }],
    // Regression 2026-09-27: days 28–29 used to fall into months with
    // value floor(28/30) = 0 → "Last on deal 0 months ago".
    [28, { value: 4, unit: 'weeks' }],
    [29, { value: 4, unit: 'weeks' }],
    [30, { value: 1, unit: 'months' }],
    [59, { value: 1, unit: 'months' }],
    [60, { value: 2, unit: 'months' }],
    [89, { value: 2, unit: 'months' }],
    [90, { value: 3, unit: '3plus' }],
    [365, { value: 3, unit: '3plus' }],
  ])('day %i → %o', (days, expected) => {
    expect(ageFromTimestamp(ago(days * DAY), NOW)).toEqual(expected)
  })

  it('rounds partial days down: 6d23h is still days, 29d23h is still weeks', () => {
    expect(ageFromTimestamp(ago(6 * DAY + 23 * 3600_000), NOW)).toEqual({ value: 6, unit: 'days' })
    expect(ageFromTimestamp(ago(29 * DAY + 23 * 3600_000), NOW)).toEqual({
      value: 4,
      unit: 'weeks',
    })
  })

  it('never produces a zero value outside the 3plus bucket, for any day 0–400', () => {
    for (let d = 0; d <= 400; d++) {
      const age = ageFromTimestamp(ago(d * DAY), NOW)
      expect(age, `day ${d}`).not.toBeNull()
      if (age && age.unit !== '3plus') expect(age.value, `day ${d}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns null for a missing or unparseable timestamp (not "3+ months")', () => {
    expect(ageFromTimestamp(null, NOW)).toBeNull()
    expect(ageFromTimestamp('', NOW)).toBeNull()
    expect(ageFromTimestamp('not-a-date', NOW)).toBeNull()
  })
})
