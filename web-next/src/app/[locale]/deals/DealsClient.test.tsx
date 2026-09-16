// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FILTERS } from '@/lib/filters'
import type { Deal, WeeklySnapshot } from '@/lib/types'
import messages from '@/messages/en.json'

/**
 * LOW, code review of 9525601: "nothing proves DealsClient threads the
 * 'from' label to DealCard." `@/i18n/navigation` re-exports next-intl's
 * client-side `createNavigation`, which imports `next/navigation` in a way
 * vitest's module resolver cannot follow outside the real Next.js runtime
 * (verified: importing DealsClient unmocked throws
 * "Cannot find module '.../node_modules/next/navigation'") — the same
 * reason ItemNote was extracted out of ListDrawer.tsx. Mocking just that one
 * module, rather than extracting DealsClient's rendering, keeps this test
 * exercising the real wiring between DealsClient and DealCard.
 */
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/deals',
}))

afterEach(cleanup)

const TODAY = '2026-09-15'

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  store: 'coop',
  productName: 'Milk 1L',
  category: 'fresh',
  categorySlug: 'dairy',
  subCategory: 'Dairy',
  salePrice: 1,
  originalPrice: 2,
  discountPercent: 50,
  pricePerUnit: null,
  canonicalUnit: null,
  format: null,
  imageUrl: null,
  validFrom: '2026-09-01',
  validTo: '2026-09-30',
  sourceUrl: null,
  productId: 'p1',
  taxonomyConfidence: 1,
  isUncertain: false,
  storage: null,
  priceBasis: { kind: 'everyone' },
  crop: null,
  attributes: {},
  isActive: true,
  updatedAt: '2026-09-15T00:00:00Z',
  ...over,
})

const snapshot = (deals: Deal[]): WeeklySnapshot => ({
  updatedAt: '2026-09-15T00:00:00Z',
  totalDeals: deals.length,
  region: 'all',
  locale: 'en',
  stores: [],
  categories: [],
  deals,
  today: TODAY,
})

async function renderDealsClient(deals: Deal[]) {
  const { DealsClient } = await import('./DealsClient')
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DealsClient snapshot={snapshot(deals)} initialFilters={DEFAULT_FILTERS} locale="en" />
    </NextIntlClientProvider>,
  )
}

describe('DealsClient threads the "from" label to DealCard', () => {
  it('shows a "From" date on a card for a deal that has not started yet', async () => {
    const { container } = await renderDealsClient([
      deal({ id: 'future', validFrom: '2026-09-17', discountPercent: 40 }),
    ])
    // The sentence is split across nodes so that only the date sits inside
    // <time dateTime> (code review NEW-4), hence textContent rather than a
    // single text node. The <time> itself proves the date half was threaded.
    expect(await screen.findByText('Milk 1L')).toBeTruthy()
    expect(container.textContent).toContain('From Thu 17.9.')
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe('2026-09-17')
  })

  it('shows no "From" date for a deal that is already in effect', async () => {
    await renderDealsClient([deal({ id: 'live', discountPercent: 40 })])
    // The product renders (proves the section did render at all — a false
    // negative here would make the first assertion meaningless).
    const body = document.body.textContent ?? ''
    expect(await screen.findByText('Milk 1L')).toBeTruthy()
    expect(body).not.toContain('From ')
    expect(document.querySelector('time')).toBeNull()
  })
})
