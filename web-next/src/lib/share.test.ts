import { describe, expect, it } from 'vitest'

import type { ListItem } from '@/stores/list-store'

import { buildShareText, groupByStore } from './share'

const TODAY = '2026-09-15'

const item = (over: Partial<ListItem> = {}): ListItem => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  store: 'coop',
  productName: 'Milk',
  category: 'fresh',
  salePrice: 2,
  imageUrl: null,
  sourceUrl: null,
  validFrom: '2026-09-01',
  priceBasis: { kind: 'everyone' },
  ...over,
})

describe('groupByStore', () => {
  it('sums prices per store, sorted by total descending', () => {
    const groups = groupByStore([
      item({ store: 'coop', salePrice: 1 }),
      item({ store: 'migros', salePrice: 5 }),
      item({ store: 'migros', salePrice: 5 }),
    ])
    expect(groups[0]).toMatchObject({ store: 'migros', total: 10 })
    expect(groups[1]).toMatchObject({ store: 'coop', total: 1 })
  })
})

describe('buildShareText', () => {
  it('returns just the URL for an empty list', () => {
    expect(buildShareText({ items: [], shareUrl: 'https://basketch.app/list', locale: 'en' })).toBe(
      'https://basketch.app/list',
    )
  })

  it('lists each store with item count and CHF total', () => {
    const text = buildShareText({
      items: [item({ store: 'coop', salePrice: 2 }), item({ store: 'coop', salePrice: 3 })],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
    })
    expect(text).toContain('Coop: 2 items · CHF 5.00')
    expect(text).toContain('https://basketch.app/list')
  })

  it('names the programme WITH its count for a member-only price (code review MEDIUM: "1 member price" named nobody)', () => {
    // CLAUDE.md: "always label member-only prices (Lidl Plus, Supercard,
    // Cumulus)" — naming the programme, not just flagging that one exists. A
    // recipient who never opens basketch must still learn WHICH membership
    // this price needs.
    const text = buildShareText({
      items: [
        item({
          store: 'lidl',
          salePrice: 4,
          priceBasis: { kind: 'member-only', programme: 'Lidl Plus' },
        }),
      ],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toMatch(/LIDL:.*\(1 × Lidl Plus members only\)/)
  })

  it('names every distinct programme WITH its own count when a store group mixes them', () => {
    const text = buildShareText({
      items: [
        item({
          store: 'coop',
          priceBasis: { kind: 'member-only', programme: 'Supercard' },
        }),
        item({
          store: 'coop',
          priceBasis: { kind: 'member-only', programme: 'Cumulus' },
        }),
        item({
          store: 'coop',
          priceBasis: { kind: 'member-only', programme: 'Cumulus' },
        }),
      ],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toContain('1 × Supercard members only')
    expect(text).toContain('2 × Cumulus members only')
  })

  it('does not imply every item in the group is a member price when only some are (code review NEW-1: ambiguous count)', () => {
    // "Coop: 4 items ... (Supercard members only)" reads as if all four
    // items need Supercard, when only one does. The note's own count must
    // say "1", distinct from the store line's "4 items".
    const text = buildShareText({
      items: [
        item({ store: 'coop', priceBasis: { kind: 'member-only', programme: 'Supercard' } }),
        item({ store: 'coop' }),
        item({ store: 'coop' }),
        item({ store: 'coop' }),
      ],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toContain('Coop: 4 items')
    expect(text).toContain('(1 × Supercard members only)')
  })

  it('carries the quantity condition into the shared text (WP-C4/WP-W4, D2, TP-7a)', () => {
    const text = buildShareText({
      items: [item({ store: 'migros', minQuantity: 2 })],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toMatch(/Migros:.*\(1 × From 2 items\)/)
  })

  it('groups the quantity note by its own N, the same way member prices group by programme', () => {
    const text = buildShareText({
      items: [
        item({ store: 'migros', minQuantity: 2 }),
        item({ store: 'migros', minQuantity: 3 }),
        item({ store: 'migros', minQuantity: 3 }),
      ],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toContain('1 × From 2 items')
    expect(text).toContain('2 × From 3 items')
  })

  it('does not imply every item needs the same quantity when only some do (same NEW-1 rule as member prices)', () => {
    const text = buildShareText({
      items: [
        item({ store: 'migros', minQuantity: 2 }),
        item({ store: 'migros' }),
        item({ store: 'migros' }),
      ],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toContain('Migros: 3 items')
    expect(text).toContain('(1 × From 2 items)')
  })

  it('does not throw for a list item saved before WP-W4 (no minQuantity)', () => {
    const preW4Item = {
      id: 'legacy-2',
      store: 'migros' as const,
      productName: 'Rindsplätzli',
      category: 'fresh' as const,
      salePrice: 3.02,
      imageUrl: null,
      sourceUrl: null,
      validFrom: '2026-09-01',
      priceBasis: { kind: 'everyone' as const },
      // No minQuantity.
    }
    expect(() =>
      buildShareText({
        items: [preW4Item],
        shareUrl: 'https://basketch.app/list',
        locale: 'en',
        today: TODAY,
      }),
    ).not.toThrow()
  })

  it('carries a not-yet-started item into the shared text', () => {
    const text = buildShareText({
      items: [item({ store: 'aldi', validFrom: '2026-09-17' })],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).toMatch(/ALDI:.*\(1 not started yet\)/)
  })

  it('does not throw for a list item saved before WP-W2 (no priceBasis, no validFrom)', () => {
    // BLOCKER, code review of 9525601: groupNote called isMemberOnly on an
    // item with no priceBasis key at all and threw. A returning user with a
    // non-empty list could never open the share sheet.
    const legacyItem = {
      id: 'legacy-1',
      store: 'coop' as const,
      productName: 'Milk',
      category: 'fresh' as const,
      salePrice: 2,
      imageUrl: null,
      sourceUrl: null,
      // No validFrom, no priceBasis.
    }
    expect(() =>
      buildShareText({
        items: [legacyItem],
        shareUrl: 'https://basketch.app/list',
        locale: 'en',
        today: TODAY,
      }),
    ).not.toThrow()
  })

  it('says nothing extra for a store whose items are all open and in effect', () => {
    const text = buildShareText({
      items: [item({ store: 'coop' })],
      shareUrl: 'https://basketch.app/list',
      locale: 'en',
      today: TODAY,
    })
    expect(text).not.toContain('(')
  })
})
