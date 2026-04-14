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
    { category: 'fresh', winner: 'migros', scores: { migros: 80, coop: 60 }, dealCounts: { migros: 12, coop: 8 }, avgDiscounts: { migros: 28, coop: 22 } },
    { category: 'long-life', winner: 'coop', scores: { migros: 55, coop: 70 }, dealCounts: { migros: 18, coop: 15 }, avgDiscounts: { migros: 24, coop: 27 } },
    { category: 'non-food', winner: 'tie', scores: { migros: 65, coop: 65 }, dealCounts: { migros: 12, coop: 14 }, avgDiscounts: { migros: 30, coop: 35 } },
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
        { category: 'fresh', winner: 'tie', scores: { migros: 50, coop: 50 }, dealCounts: { migros: 10, coop: 10 }, avgDiscounts: { migros: 25, coop: 25 } },
        { category: 'long-life', winner: 'tie', scores: { migros: 50, coop: 50 }, dealCounts: { migros: 10, coop: 10 }, avgDiscounts: { migros: 25, coop: 25 } },
        { category: 'non-food', winner: 'tie', scores: { migros: 50, coop: 50 }, dealCounts: { migros: 10, coop: 10 }, avgDiscounts: { migros: 25, coop: 25 } },
      ],
    })
    render(wrap(<VerdictBanner verdict={tieVerdict} />))
    expect(screen.getByText('Similar promotions across stores this week')).toBeTruthy()
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
