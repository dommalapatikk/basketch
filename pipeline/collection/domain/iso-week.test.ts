import { describe, expect, it } from 'vitest'

import { createIsoWeek, isoWeekOf, isoWeekOfCycle, isoWeekParts } from './iso-week'
import { isOk, unwrap } from './result'

describe('createIsoWeek — refuses a non-canonical week key', () => {
  it('accepts a canonical YYYY-Www key', () => {
    const r = createIsoWeek('2026-W37')
    expect(isOk(r)).toBe(true)
  })

  it('refuses an unpadded week — 2026-W7 would bypass the ledger as "not yet fetched"', () => {
    // HANDOVER §4 #4: a raw key and a normalised key reading as different
    // ledger entries is the exact defect this value object exists to close.
    const r = createIsoWeek('2026-W7')
    expect(isOk(r)).toBe(false)
  })

  it('refuses week 00', () => {
    expect(isOk(createIsoWeek('2026-W00'))).toBe(false)
  })

  it('refuses week 54', () => {
    expect(isOk(createIsoWeek('2026-W54'))).toBe(false)
  })

  it('accepts the boundary weeks 01 and 53', () => {
    expect(isOk(createIsoWeek('2026-W01'))).toBe(true)
    expect(isOk(createIsoWeek('2026-W53'))).toBe(true)
  })

  it('refuses a missing year', () => {
    expect(isOk(createIsoWeek('W37'))).toBe(false)
  })

  it('refuses garbage', () => {
    expect(isOk(createIsoWeek('not-a-week'))).toBe(false)
    expect(isOk(createIsoWeek(''))).toBe(false)
  })
})

describe('isoWeekParts — decomposes a canonical IsoWeek', () => {
  it('reads the year and week back out', () => {
    expect(isoWeekParts(unwrap(createIsoWeek('2026-W37')))).toEqual({ year: 2026, week: 37 })
  })

  it('reads a single-digit week correctly, padding included', () => {
    expect(isoWeekParts(unwrap(createIsoWeek('2026-W07')))).toEqual({ year: 2026, week: 7 })
  })
})

describe('isoWeekOf — plain ISO 8601 week (Monday-based)', () => {
  it('matches the real KW37 window verified in production (2026-09-10 is week 37)', () => {
    expect(isoWeekOf(new Date('2026-09-10'))).toBe('2026-W37')
  })

  it('a Monday starts a new ISO week — 2026-09-14 is week 38, not 37', () => {
    // This is the exact miscalculation the pre-fix pipeline made: run.ts asked
    // for the ISO week of the run date, which on a Monday is already one week
    // further on than the publication actually in effect.
    expect(isoWeekOf(new Date('2026-09-14'))).toBe('2026-W38')
  })

  it('pads a single-digit week — W07, never W7', () => {
    expect(isoWeekOf(new Date('2026-02-09'))).toBe('2026-W07')
  })
})

describe('isoWeekOfCycle — the publication in effect for a retailer whose week starts on a given weekday', () => {
  const THURSDAY = 4

  it('on Mon 2026-09-14, a Thursday-anchored edition is KW37 — it is not KW38, which 404s', () => {
    // THE defect (item 1 / item 7a RCA): Migros's flyer window for "KW37" is
    // 2026-09-10 (Thu) to 2026-09-16 (Wed). The plain ISO week of the run
    // date (2026-09-14, a Monday) is already W38 — next week's flyer, not
    // yet published.
    expect(isoWeekOfCycle(new Date('2026-09-14'), THURSDAY)).toBe('2026-W37')
  })

  it('on the cycle-start day itself, the edition is that day\'s own week', () => {
    expect(isoWeekOfCycle(new Date('2026-09-17'), THURSDAY)).toBe('2026-W38')
  })

  it('the day before the next cycle starts is still the OLD edition', () => {
    // 2026-09-16 (Wed) is the last day KW37 (Thu10.9-Wed16.9) is in effect.
    expect(isoWeekOfCycle(new Date('2026-09-16'), THURSDAY)).toBe('2026-W37')
  })

  it('the day the next cycle starts rolls over to the NEW edition', () => {
    expect(isoWeekOfCycle(new Date('2026-09-17'), THURSDAY)).toBe('2026-W38')
  })

  it('a Sunday-anchored cycle (anchorWeekday 0) rolls at Sunday, not Monday', () => {
    // Generic calendar math sanity check, independent of any real retailer:
    // Sunday 2026-09-13 is the anchor; the following Saturday (2026-09-19)
    // is still that same cycle.
    expect(isoWeekOfCycle(new Date('2026-09-13'), 0)).toBe(isoWeekOfCycle(new Date('2026-09-19'), 0))
    expect(isoWeekOfCycle(new Date('2026-09-13'), 0)).not.toBe(isoWeekOfCycle(new Date('2026-09-20'), 0))
  })

  it('anchorWeekday equal to the plain Monday-based week start (1) matches isoWeekOf exactly', () => {
    const MONDAY = 1
    expect(isoWeekOfCycle(new Date('2026-09-14'), MONDAY)).toBe(isoWeekOf(new Date('2026-09-14')))
    expect(isoWeekOfCycle(new Date('2026-09-16'), MONDAY)).toBe(isoWeekOf(new Date('2026-09-14')))
  })

  describe('the Zurich calendar day, not UTC (code review SF-2)', () => {
    it('a dispatch at 2026-09-16T23:30Z is already Thursday in Zurich (CEST, UTC+2) -- the NEW edition is already in effect', () => {
      // UTC clock still reads Wednesday 2026-09-16 at this instant, but
      // Zurich local time is 2026-09-17T01:30 -- past midnight, already
      // Thursday, the cycle-start day itself. A UTC-only implementation
      // would compute the OLD edition (2026-W37, stale by one publication);
      // the correct answer is the one that just started, 2026-W38.
      expect(isoWeekOfCycle(new Date('2026-09-16T23:30:00Z'), THURSDAY)).toBe('2026-W38')
    })

    it('the same UTC clock reading one hour earlier is still Wednesday in Zurich -- the OLD edition still holds', () => {
      // 2026-09-16T21:30Z is 2026-09-16T23:30 in Zurich (CEST) -- still
      // Wednesday, the last day the OLD edition (2026-W37) is in effect.
      expect(isoWeekOfCycle(new Date('2026-09-16T21:30:00Z'), THURSDAY)).toBe('2026-W37')
    })

    it('isoWeekOf itself reads the Zurich day, not the UTC day, across an ISO WEEK boundary', () => {
      // 2026-09-13 (Sunday, UTC calendar date) is the LAST day of ISO week
      // 37. At 22:30 UTC, Zurich local time (CEST, +2) is already
      // 2026-09-14T00:30 -- Monday, the FIRST day of ISO week 38. This is a
      // genuine week-crossing case, unlike a same-week Wed->Thu shift (the
      // ISO week algorithm's own "move to this week's Thursday" step masks
      // that one regardless of which day it starts from).
      expect(isoWeekOf(new Date('2026-09-13T22:30:00Z'))).toBe('2026-W38')
    })
  })
})
