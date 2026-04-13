import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { WeeklyVerdict } from '@shared/types'
import { VerdictBanner } from './VerdictBanner'

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

const makeVerdict = (overrides?: Partial<WeeklyVerdict>): WeeklyVerdict => ({
  weekOf: '2026-04-09',
  categories: [
    { category: 'fresh', winner: 'migros', migrosScore: 80, coopScore: 60, migrosDeals: 12, coopDeals: 8, migrosAvgDiscount: 28, coopAvgDiscount: 22 },
    { category: 'long-life', winner: 'coop', migrosScore: 55, coopScore: 70, migrosDeals: 18, coopDeals: 15, migrosAvgDiscount: 24, coopAvgDiscount: 27 },
    { category: 'non-food', winner: 'tie', migrosScore: 65, coopScore: 65, migrosDeals: 12, coopDeals: 14, migrosAvgDiscount: 30, coopAvgDiscount: 35 },
  ],
  dataFreshness: 'current',
  lastUpdated: new Date().toISOString(),
  ...overrides,
})

describe('VerdictBanner', () => {
  it('returns null when verdict is null', () => {
    const { container } = render(wrap(<VerdictBanner verdict={null} />))
    expect(container.innerHTML).toBe('')
  })

  it('renders weekly verdict label', () => {
    render(wrap(<VerdictBanner verdict={makeVerdict()} />))
    expect(screen.getByText('Weekly Verdict')).toBeTruthy()
  })

  it('renders Migros store name', () => {
    render(wrap(<VerdictBanner verdict={makeVerdict()} />))
    // Migros appears in store label within the verdict text
    const migrosLabels = screen.getAllByText('Migros')
    expect(migrosLabels.length).toBeGreaterThan(0)
  })

  it('shows transparency line with deal counts', () => {
    render(wrap(<VerdictBanner verdict={makeVerdict()} />))
    expect(screen.getAllByText(/Based on/).length).toBeGreaterThan(0)
  })

  it('shows tie message when all categories are tied', () => {
    const tieVerdict = makeVerdict({
      categories: [
        { category: 'fresh', winner: 'tie', migrosScore: 50, coopScore: 50, migrosDeals: 10, coopDeals: 10, migrosAvgDiscount: 25, coopAvgDiscount: 25 },
        { category: 'long-life', winner: 'tie', migrosScore: 50, coopScore: 50, migrosDeals: 10, coopDeals: 10, migrosAvgDiscount: 25, coopAvgDiscount: 25 },
        { category: 'non-food', winner: 'tie', migrosScore: 50, coopScore: 50, migrosDeals: 10, coopDeals: 10, migrosAvgDiscount: 25, coopAvgDiscount: 25 },
      ],
    })
    render(wrap(<VerdictBanner verdict={tieVerdict} />))
    expect(screen.getByText('Similar promotions at both stores this week')).toBeTruthy()
  })

  it('shows stale warning when dataFreshness is stale', () => {
    render(wrap(<VerdictBanner verdict={makeVerdict({ dataFreshness: 'stale' })} />))
    expect(screen.getByText(/Deals may be outdated/)).toBeTruthy()
  })

  it('shows partial data warning', () => {
    render(wrap(<VerdictBanner verdict={makeVerdict({ dataFreshness: 'partial' })} />))
    expect(screen.getByText(/Partial data/)).toBeTruthy()
  })

  it('has status role for accessibility', () => {
    const { container } = render(wrap(<VerdictBanner verdict={makeVerdict()} />))
    expect(container.querySelector('[role="status"]')).toBeTruthy()
  })
})
