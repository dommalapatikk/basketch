import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { CategoryVerdict, DealRow } from '@shared/types'
import { CategorySection } from './CategorySection'

afterEach(cleanup)

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

const makeVerdict = (overrides?: Partial<CategoryVerdict>): CategoryVerdict => ({
  category: 'fresh',
  winner: 'migros',
  migrosScore: 80,
  coopScore: 60,
  migrosDeals: 12,
  coopDeals: 8,
  migrosAvgDiscount: 28,
  coopAvgDiscount: 22,
  ...overrides,
})

const makeDeal = (store: 'migros' | 'coop', discount: number): DealRow => ({
  id: `deal-${store}-${discount}`,
  store,
  product_name: `${store} product`,
  category: 'fresh',
  sub_category: 'dairy',
  original_price: 5.00,
  sale_price: 5.00 * (1 - discount / 100),
  discount_percent: discount,
  valid_from: '2026-04-09',
  valid_to: '2026-04-15',
  image_url: null,
  source_category: null,
  source_url: null,
  product_id: null,
  is_active: true,
  fetched_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

describe('CategorySection', () => {
  it('renders without crashing', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={[]} coopDeals={[]} />
    ))
    expect(container.firstChild).toBeTruthy()
  })

  it('renders the category name', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={[]} coopDeals={[]} />
    ))
    expect(screen.getByText('FRESH')).toBeTruthy()
  })

  it('renders Migros deal stats', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={[]} coopDeals={[]} />
    ))
    expect(screen.getByText(/12 deals, avg 28% off/)).toBeTruthy()
  })

  it('renders Coop deal stats', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={[]} coopDeals={[]} />
    ))
    expect(screen.getByText(/8 deals, avg 22% off/)).toBeTruthy()
  })

  it('renders top deal when deals are provided', () => {
    const migrosDeals = [makeDeal('migros', 30), makeDeal('migros', 20)]
    render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={migrosDeals} coopDeals={[]} />
    ))
    // Top deal is the one with highest discount (30%)
    expect(screen.getByText(/-30%/)).toBeTruthy()
  })

  it('has article with correct aria-label', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={[]} coopDeals={[]} />
    ))
    const article = container.querySelector('article')
    expect(article).toBeTruthy()
    expect(article?.getAttribute('aria-label')).toContain('FRESH category')
    expect(article?.getAttribute('aria-label')).toContain('Migros leads')
  })

  it('links to deals page with top-level category param', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} migrosDeals={[]} coopDeals={[]} />
    ))
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/deals?category=fresh')
  })

  it('links to correct category for long-life', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict({ category: 'long-life' })} migrosDeals={[]} coopDeals={[]} />
    ))
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/deals?category=long-life')
  })

  it('shows tie label when winner is tie', () => {
    const { container } = render(wrap(
      <CategorySection
        verdict={makeVerdict({ winner: 'tie', migrosDeals: 10, coopDeals: 10 })}
        migrosDeals={[]}
        coopDeals={[]}
      />
    ))
    const article = container.querySelector('article')
    expect(article?.getAttribute('aria-label')).toContain('Tied')
  })
})
