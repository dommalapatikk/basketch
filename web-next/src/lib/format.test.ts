import { describe, expect, it } from 'vitest'

import { formatMemberPriceLabel, formatValidFromShort } from './format'

describe('formatMemberPriceLabel', () => {
  it('names the programme in English', () => {
    expect(formatMemberPriceLabel({ kind: 'member-only', programme: 'Lidl Plus' }, 'en')).toBe(
      'Lidl Plus members only',
    )
  })

  it('names the programme in German', () => {
    expect(formatMemberPriceLabel({ kind: 'member-only', programme: 'Lidl Plus' }, 'de')).toBe(
      'Nur mit Lidl Plus',
    )
  })

  it('says nothing about an open price', () => {
    expect(formatMemberPriceLabel({ kind: 'everyone' }, 'en')).toBeNull()
  })
})

describe('formatValidFromShort', () => {
  it('renders a compact weekday + day.month, Swiss order, for the "from" label', () => {
    // 2026-09-17 is a Thursday.
    expect(formatValidFromShort('2026-09-17', 'en')).toBe('Thu 17.9.')
  })

  it('translates the weekday per locale without changing the day.month order', () => {
    // German's own short weekday form carries a trailing period ("Do."); that
    // is the locale's own convention, not something this function adds.
    expect(formatValidFromShort('2026-09-17', 'de')).toBe('Do. 17.9.')
  })

  it("is stable regardless of the server's own timezone", () => {
    // Parsed as UTC midnight (date-only ISO), then read back through
    // Europe/Zurich — which is always at or ahead of UTC, so the calendar
    // day never rolls back a day on a server outside Switzerland.
    expect(formatValidFromShort('2026-01-01', 'en')).toBe('Thu 1.1.')
  })

  it('falls back to the raw date slice on an unparseable string', () => {
    expect(formatValidFromShort('not-a-date', 'en')).toBe('not-a-date')
  })
})
