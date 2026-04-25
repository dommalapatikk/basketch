import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { CategoryVerdict } from '@shared/types'
import { CategorySection } from './CategorySection'

afterEach(cleanup)

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

const makeVerdict = (overrides?: Partial<CategoryVerdict>): CategoryVerdict => ({
  category: 'fresh',
  winner: 'migros',
  scores: { migros: 80, coop: 60 },
  dealCounts: { migros: 12, coop: 8 },
  avgDiscounts: { migros: 28, coop: 22 },
  ...overrides,
})

describe('CategorySection', () => {
  it('renders without crashing', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} />
    ))
    expect(container.firstChild).toBeTruthy()
  })

  it('renders the category name', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict()} />
    ))
    expect(screen.getByText('FRESH')).toBeTruthy()
  })

  it('renders winner name and average discount', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict()} />
    ))
    expect(screen.getByText('Migros')).toBeTruthy()
    expect(screen.getByText('avg 28% off')).toBeTruthy()
  })

  it('renders Coop as winner when Coop wins', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict({ winner: 'coop' })} />
    ))
    expect(screen.getByText('Coop')).toBeTruthy()
    expect(screen.getByText('avg 22% off')).toBeTruthy()
  })

  it('has link with correct aria-label', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} />
    ))
    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('aria-label')).toContain('FRESH category')
    expect(link?.getAttribute('aria-label')).toContain('Migros leads')
  })

  it('links to deals page with top-level category param', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} />
    ))
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/deals?category=fresh')
  })

  it('links to correct category for long-life', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict({ category: 'long-life' })} />
    ))
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/deals?category=long-life')
  })

  it('shows Tied when winner is tie', () => {
    render(wrap(
      <CategorySection verdict={makeVerdict({ winner: 'tie' })} />
    ))
    expect(screen.getByText('Tied')).toBeTruthy()
  })

  it('renders chevron indicator', () => {
    const { container } = render(wrap(
      <CategorySection verdict={makeVerdict()} />
    ))
    // Chevron is rendered as rsaquo entity
    const chevron = container.querySelector('[aria-hidden="true"]:last-child')
    expect(chevron).toBeTruthy()
  })
})
