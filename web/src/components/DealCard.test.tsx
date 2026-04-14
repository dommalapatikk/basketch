import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { DealRow } from '@shared/types'
import { DealCard } from './DealCard'

afterEach(cleanup)

const makeDeal = (overrides?: Partial<DealRow>): DealRow => ({
  id: 'deal-1',
  store: 'migros',
  product_name: 'Bio Vollmilch 1L',
  category: 'fresh',
  sub_category: 'dairy',
  original_price: 2.50,
  sale_price: 1.95,
  discount_percent: 22,
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
  ...overrides,
})

describe('DealCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<DealCard deal={makeDeal()} store="migros" />)
    expect(container.querySelector('article')).toBeTruthy()
  })

  it('renders product name', () => {
    render(<DealCard deal={makeDeal()} store="migros" />)
    expect(screen.getByText('Bio Vollmilch 1L')).toBeTruthy()
  })

  it('renders sale price formatted as CHF', () => {
    const { container } = render(<DealCard deal={makeDeal()} store="migros" />)
    expect(container.textContent).toContain('CHF 1.95')
  })

  it('renders original price when higher than sale price', () => {
    const { container } = render(<DealCard deal={makeDeal()} store="migros" />)
    expect(container.textContent).toContain('2.50')
  })

  it('hides original price when null', () => {
    const { container } = render(
      <DealCard deal={makeDeal({ original_price: null })} store="migros" />
    )
    const strikethrough = container.querySelector('.line-through')
    expect(strikethrough).toBeNull()
  })

  it('renders discount badge when discount_percent > 0', () => {
    const { container } = render(<DealCard deal={makeDeal()} store="migros" />)
    expect(container.textContent).toContain('-22%')
  })

  it('does not render discount badge when discount_percent is 0', () => {
    const { container } = render(
      <DealCard deal={makeDeal({ discount_percent: 0 })} store="migros" />
    )
    expect(container.querySelector('.rounded-full')).toBeNull()
  })

  it('renders image fallback letter for Migros', () => {
    render(<DealCard deal={makeDeal({ image_url: null })} store="migros" />)
    expect(screen.getByText('M')).toBeTruthy()
  })

  it('renders image fallback letter for Coop', () => {
    render(<DealCard deal={makeDeal({ image_url: null })} store="coop" />)
    expect(screen.getByText('C')).toBeTruthy()
  })

  it('has article element with aria-label containing product info', () => {
    const { container } = render(<DealCard deal={makeDeal()} store="migros" />)
    const article = container.querySelector('article')
    expect(article).toBeTruthy()
    const label = article?.getAttribute('aria-label') ?? ''
    expect(label).toContain('Bio Vollmilch 1L')
    expect(label).toContain('CHF 1.95')
    expect(label).toContain('22% off')
    expect(label).toContain('Migros')
  })

  it('renders discount and price in same row', () => {
    const { container } = render(<DealCard deal={makeDeal()} store="migros" />)
    expect(container.textContent).toContain('-22%')
    expect(container.textContent).toContain('CHF 1.95')
  })
})
