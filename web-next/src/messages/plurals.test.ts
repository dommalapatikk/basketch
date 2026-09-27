import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import de from './de.json' with { type: 'json' }
import en from './en.json' with { type: 'json' }

// Regression 2026-09-27: live site showed "1 items split best across 1
// stores" — count placeholders without ICU plural rules. Spec:
// docs/design/2026-09-27-shared-list-expiry-and-plurals.md Part B, as amended
// by the Design Challenger (M1, M2).

const tEn = createTranslator({ locale: 'en', messages: en })
const tDe = createTranslator({ locale: 'de', messages: de })
type Args = Record<string, string | number>
const en_ = (key: string, args: Args) => tEn(key as never, args as never)
const de_ = (key: string, args: Args) => tDe(key as never, args as never)

describe('list.split_summary — subject/verb agree for every item/store count', () => {
  it.each([
    [{ items: 0, stores: 0 }, 'No items yet', 'Noch keine Artikel'],
    [
      { items: 1, stores: 1 },
      'Your item is cheapest here:',
      'Dein Artikel ist hier am günstigsten:',
    ],
    [
      { items: 3, stores: 1 },
      'Your 3 items are cheapest at one store:',
      'Deine 3 Artikel sind in einem Laden am günstigsten:',
    ],
    [
      { items: 3, stores: 2 },
      'Your 3 items split best across 2 stores:',
      'Deine 3 Artikel verteilen sich am besten auf 2 Läden:',
    ],
  ])('%o', (args, expectedEn, expectedDe) => {
    expect(en_('list.split_summary', args)).toBe(expectedEn)
    expect(de_('list.split_summary', args)).toBe(expectedDe)
  })
})

describe('home.stat', () => {
  it.each([
    [
      { deals: 1, stores: 1 },
      'Based on 1 deal across 1 Swiss store.',
      'Basierend auf 1 Aktion aus 1 Schweizer Laden.',
    ],
    [
      { deals: 2, stores: 2 },
      'Based on 2 deals across 2 Swiss stores.',
      'Basierend auf 2 Aktionen aus 2 Schweizer Läden.',
    ],
  ])('%o', (args, expectedEn, expectedDe) => {
    expect(en_('home.stat', args)).toBe(expectedEn)
    expect(de_('home.stat', args)).toBe(expectedDe)
  })
})

describe('category_card.avg_off', () => {
  it.each([
    [1, 'avg 20% off · 1 deal', 'ø 20% Rabatt · 1 Aktion'],
    [2, 'avg 20% off · 2 deals', 'ø 20% Rabatt · 2 Aktionen'],
  ])('count %i', (count, expectedEn, expectedDe) => {
    expect(en_('category_card.avg_off', { pct: 20, count })).toBe(expectedEn)
    expect(de_('category_card.avg_off', { pct: 20, count })).toBe(expectedDe)
  })
})

describe('deals.subline', () => {
  it.each([
    [0, 'Updated 27 Sep · no deals', 'Aktualisiert 27 Sep · keine Aktionen'],
    [1, 'Updated 27 Sep · 1 deal', 'Aktualisiert 27 Sep · 1 Aktion'],
    [2, 'Updated 27 Sep · 2 deals', 'Aktualisiert 27 Sep · 2 Aktionen'],
  ])('count %i', (count, expectedEn, expectedDe) => {
    expect(en_('deals.subline', { date: '27 Sep', count })).toBe(expectedEn)
    expect(de_('deals.subline', { date: '27 Sep', count })).toBe(expectedDe)
  })
})

describe('variant_picker.stale_strip', () => {
  it.each([
    [1, 'Updated 1 day ago', 'Aktualisiert vor 1 Tag'],
    [2, 'Updated 2 days ago', 'Aktualisiert vor 2 Tagen'],
  ])('n %i', (n, expectedEn, expectedDe) => {
    expect(en_('variant_picker.stale_strip', { n })).toBe(expectedEn)
    expect(de_('variant_picker.stale_strip', { n })).toBe(expectedDe)
  })
})

describe('availability.aria_b_* — "ago" is inside every branch', () => {
  it.each([
    [
      'aria_b_days',
      1,
      'Coop. Last on deal 1 day ago. Tap to see details.',
      'Coop. Vor 1 Tag im Angebot. Tippe für Details.',
    ],
    [
      'aria_b_days',
      3,
      'Coop. Last on deal 3 days ago. Tap to see details.',
      'Coop. Vor 3 Tagen im Angebot. Tippe für Details.',
    ],
    [
      'aria_b_weeks',
      1,
      'Coop. Last on deal 1 week ago. Tap to see details.',
      'Coop. Vor 1 Woche im Angebot. Tippe für Details.',
    ],
    [
      'aria_b_weeks',
      4,
      'Coop. Last on deal 4 weeks ago. Tap to see details.',
      'Coop. Vor 4 Wochen im Angebot. Tippe für Details.',
    ],
    // =0 is a safety net only (ageFromTimestamp no longer produces it).
    [
      'aria_b_months',
      0,
      'Coop. Last on deal recently. Tap to see details.',
      'Coop. Vor kurzem im Angebot. Tippe für Details.',
    ],
    [
      'aria_b_months',
      1,
      'Coop. Last on deal 1 month ago. Tap to see details.',
      'Coop. Vor 1 Monat im Angebot. Tippe für Details.',
    ],
    [
      'aria_b_months',
      2,
      'Coop. Last on deal 2 months ago. Tap to see details.',
      'Coop. Vor 2 Monaten im Angebot. Tippe für Details.',
    ],
  ])('%s n=%i', (key, n, expectedEn, expectedDe) => {
    expect(en_(`availability.${key}`, { store: 'Coop', n })).toBe(expectedEn)
    expect(de_(`availability.${key}`, { store: 'Coop', n })).toBe(expectedDe)
  })
})

// ── Guard for the whole bug class ──────────────────────────────────────────
// A count-like placeholder may appear bare ({count}) only if the same message
// also declares a plural rule for it ({count, plural, …}) — e.g. the outer
// {items} inside split_summary's nested plural. Anything else would render
// "1 items" / "1 Tagen" again.
const COUNT_NAMES = ['count', 'n', 'items', 'stores', 'deals', 'days', 'weeks', 'months']

// Keys that deliberately keep a bare count, each with the reason.
const EXEMPT: Record<string, string> = {
  // isMultiBuy's DB invariant guarantees count >= 2; lib/format.ts duplicates
  // this template with a literal .replace('{count}', …) (see spec B.3).
  'deals.from_n_items': 'count is always >= 2',
  // "Reset (3)" — a bare number in brackets, no noun to agree with.
  'filters.reset': 'bare number, no noun',
}

function leaves(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  )
}

function unpluralisedCounts(messages: unknown): string[] {
  const offenders: string[] = []
  for (const [key, value] of leaves(messages)) {
    if (key in EXEMPT) continue
    for (const name of COUNT_NAMES) {
      const bare = new RegExp(`\\{${name}\\}`).test(value)
      const plural = new RegExp(`\\{${name}\\s*,\\s*plural`).test(value)
      if (bare && !plural) offenders.push(`${key} uses {${name}} without a plural rule`)
    }
  }
  return offenders
}

describe('no count placeholder is used without a plural rule (EN, DE)', () => {
  it.each([
    ['en', en],
    ['de', de],
  ])('%s', (_locale, messages) => {
    expect(unpluralisedCounts(messages)).toEqual([])
  })

  it('flags a bare count and passes the same message once it is pluralised', () => {
    expect(unpluralisedCounts({ a: { b: 'Updated · {count} deals' } })).toEqual([
      'a.b uses {count} without a plural rule',
    ])
    expect(
      unpluralisedCounts({ a: { b: '{count, plural, one {# deal} other {# deals}}' } }),
    ).toEqual([])
  })

  it('does not flag non-count placeholders', () => {
    expect(
      unpluralisedCounts({ a: '{store} wins {category} at CHF {price}, {pct}% off, {date}' }),
    ).toEqual([])
  })

  it('every exemption still exists (a stale exemption hides nothing)', () => {
    const keys = new Set(leaves(en).map(([k]) => k))
    for (const key of Object.keys(EXEMPT)) expect(keys.has(key), key).toBe(true)
  })
})

// Regression (code review MF-1, 2026-09-27): call sites passed
// `n.toLocaleString(locale)`. ICU plural re-parses the string, so "1,623"
// became NaN in EN ("NaN deals") and 1.623 in DE ("1,623 Aktionen" misread).
// Counts must reach t() as numbers; ICU adds the thousands separator itself.
describe('large counts render with a thousands separator, never NaN', () => {
  it('home.stat at 1623 deals', () => {
    expect(en_('home.stat', { deals: 1623, stores: 7 })).toBe(
      'Based on 1,623 deals across 7 Swiss stores.',
    )
    expect(de_('home.stat', { deals: 1623, stores: 7 })).toBe(
      'Basierend auf 1.623 Aktionen aus 7 Schweizer Läden.',
    )
  })

  it('deals.subline at 1234 deals', () => {
    expect(en_('deals.subline', { date: '27 Sep', count: 1234 })).toBe(
      'Updated 27 Sep · 1,234 deals',
    )
    expect(de_('deals.subline', { date: '27 Sep', count: 1234 })).toBe(
      'Aktualisiert 27 Sep · 1.234 Aktionen',
    )
  })
})

// Review SF-1 (2026-09-27): the share-card image (app/card/route.tsx) built
// its stat line by hand — "1 Swiss stores". Same wording, now pluralised.
describe('share_verdict.card_stat', () => {
  it.each([
    [{ deals: 1, stores: 1 }, '1 deal across 1 Swiss store', '1 Aktion aus 1 Schweizer Laden'],
    [
      { deals: 1623, stores: 7 },
      '1,623 deals across 7 Swiss stores',
      '1.623 Aktionen aus 7 Schweizer Läden',
    ],
  ])('%o', (args, expectedEn, expectedDe) => {
    expect(en_('share_verdict.card_stat', args)).toBe(expectedEn)
    expect(de_('share_verdict.card_stat', args)).toBe(expectedDe)
  })
})
