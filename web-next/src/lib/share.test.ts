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

  it('carries a member-only price into the shared text (Art. 3(1)(e) UWG)', () => {
    // A recipient who never sees the site must still learn this price is
    // conditional — CLAUDE.md requires the label wherever the price is shown,
    // and a WhatsApp message showing the price is exactly that.
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
    expect(text).toMatch(/LIDL:.*\(1 member price\)/)
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
