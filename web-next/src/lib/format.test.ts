import { describe, expect, it } from 'vitest'

import de from '@/messages/de.json'
import en from '@/messages/en.json'
import fr from '@/messages/fr.json'
import itMessages from '@/messages/it.json'

import {
  formatMemberPriceLabel,
  formatMinQuantityLabel,
  formatValidFromShort,
  splitAroundDate,
} from './format'

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

describe('formatMinQuantityLabel (WP-C4/WP-W4, D2, TP-7a)', () => {
  it('reads "from N items" in English', () => {
    expect(formatMinQuantityLabel(2, 'en')).toBe('From 2 items')
  })

  it("reads Migros's own printed wording in German", () => {
    expect(formatMinQuantityLabel(2, 'de')).toBe('Ab 2 Stück')
  })

  it('reads correctly in French and Italian too', () => {
    expect(formatMinQuantityLabel(2, 'fr')).toBe('Dès 2 articles')
    expect(formatMinQuantityLabel(2, 'it')).toBe('Da 2 articoli')
  })

  it('carries the actual printed quantity, never a hardcoded 2', () => {
    // The WP-C4 ADR: N is parsed from the label, never assumed. A future
    // "ab 3 Stück" week must not silently read as 2.
    expect(formatMinQuantityLabel(3, 'en')).toBe('From 3 items')
  })

  it('says nothing for the ordinary single-item price', () => {
    expect(formatMinQuantityLabel(null, 'en')).toBeNull()
  })

  it('says nothing when the field is absent — a ListItem saved before WP-W4', () => {
    expect(formatMinQuantityLabel(undefined, 'en')).toBeNull()
  })

  it('falls back to English wording for an unrecognised locale rather than throwing', () => {
    expect(formatMinQuantityLabel(2, 'xx')).toBe('From 2 items')
  })

  // Mutation-tested guard: this codebase's own recurring defect class
  // (HANDOVER.md §4) is two independent implementations of one rule
  // silently drifting apart. format.ts's wording is deliberately NOT
  // imported from messages/*.json (see the comment on MIN_QUANTITY_TEMPLATE
  // for why), so this test is what keeps the two hand-written copies
  // honest — edit either one without the other and this goes red.
  it('stays in sync with the wording carried in messages/*.json', () => {
    expect(formatMinQuantityLabel(2, 'en')).toBe(en.deals.from_n_items.replace('{count}', '2'))
    expect(formatMinQuantityLabel(2, 'de')).toBe(de.deals.from_n_items.replace('{count}', '2'))
    expect(formatMinQuantityLabel(2, 'fr')).toBe(fr.deals.from_n_items.replace('{count}', '2'))
    expect(formatMinQuantityLabel(2, 'it')).toBe(
      itMessages.deals.from_n_items.replace('{count}', '2'),
    )
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

describe('splitAroundDate', () => {
  // Code review NEW-4: `<time dateTime>` wrapped the whole sentence ("From
  // Thu 17.9."), so the element's text said more than the date it names.
  // Splitting the already-translated sentence keeps every locale's own word
  // order — nothing here assumes the date comes last.
  it('splits a translated sentence around the date it contains', () => {
    expect(splitAroundDate('From Thu 17.9.', 'Thu 17.9.')).toEqual({ before: 'From ', after: '' })
  })

  it('keeps text that follows the date, for a locale that puts it mid-sentence', () => {
    expect(splitAroundDate('Ab Do. 17.9. gültig', 'Do. 17.9.')).toEqual({
      before: 'Ab ',
      after: ' gültig',
    })
  })

  it('returns null when the date is not in the label — the caller then wraps nothing', () => {
    expect(splitAroundDate('From Thursday', 'Thu 17.9.')).toBeNull()
  })

  it('returns null for an empty date rather than splitting at position 0', () => {
    expect(splitAroundDate('From Thu 17.9.', '')).toBeNull()
  })
})
