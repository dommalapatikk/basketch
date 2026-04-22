// Tests for verdict → WhatsApp share helpers.

import { describe, it, expect } from 'vitest'

import type { WeeklyVerdict } from '@shared/types'

import { verdictShareText, verdictSummary, verdictWhatsAppUrl } from './verdict-share'

function makeVerdict(overrides: Partial<WeeklyVerdict> = {}): WeeklyVerdict {
  return {
    weekOf: '2026-04-23',
    dataFreshness: 'current',
    lastUpdated: '2026-04-23T06:00:00Z',
    categories: [
      {
        category: 'fresh',
        winner: 'migros',
        scores: { migros: 80, coop: 70 },
        dealCounts: { migros: 12, coop: 8, denner: 3 },
        avgDiscounts: { migros: 28, coop: 22, denner: 31 },
      },
      {
        category: 'long-life',
        winner: 'coop',
        scores: { migros: 60, coop: 85 },
        dealCounts: { migros: 5, coop: 10, denner: 2 },
        avgDiscounts: { migros: 20, coop: 30, denner: 18 },
      },
      {
        category: 'non-food',
        winner: 'tie',
        scores: { migros: 72, coop: 71 },
        dealCounts: { migros: 4, coop: 4 },
        avgDiscounts: { migros: 25, coop: 25 },
      },
    ],
    ...overrides,
  }
}

describe('verdictSummary', () => {
  it('lists category winners and total deal count', () => {
    expect(verdictSummary(makeVerdict())).toBe(
      'Migros wins Fresh · Coop wins Long-life · 48 deals',
    )
  })

  it('falls back to a calm line when all categories tie', () => {
    const v = makeVerdict({
      categories: [
        { category: 'fresh', winner: 'tie', scores: {}, dealCounts: {}, avgDiscounts: {} },
      ],
    })
    expect(verdictSummary(v)).toBe('Similar promotions across stores this week.')
  })
})

describe('verdictShareText', () => {
  it('produces 3 lines with summary + link', () => {
    const text = verdictShareText(makeVerdict())
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('basketch verdict')
    expect(lines[2]).toMatch(/^See the deals → https?:\/\//)
  })
})

describe('verdictWhatsAppUrl', () => {
  it('returns a wa.me deep link with URL-encoded text', () => {
    const url = verdictWhatsAppUrl(makeVerdict())
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    const decoded = decodeURIComponent(url.slice('https://wa.me/?text='.length))
    expect(decoded.startsWith('basketch verdict\n')).toBe(true)
  })
})
