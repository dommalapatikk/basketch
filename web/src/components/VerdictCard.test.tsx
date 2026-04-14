import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { WeeklyVerdict } from '@shared/types'
import { VerdictCard } from './VerdictCard'

afterEach(cleanup)

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

describe('VerdictCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<VerdictCard verdict={makeVerdict()} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders the basketch header text', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText('basketch')).toBeTruthy()
  })

  it('renders "This Week\'s Verdict" subtitle', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText("This Week's Verdict")).toBeTruthy()
  })

  it('renders the week date', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText(/9 April 2026/)).toBeTruthy()
  })

  it('renders category winner lines', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText('MIGROS leads Fresh')).toBeTruthy()
    expect(screen.getByText('COOP leads Long-life')).toBeTruthy()
  })

  it('renders tie line for tied category', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText(/Tied on Household/)).toBeTruthy()
  })

  it('has role="img" with aria-label on the card', () => {
    const { container } = render(<VerdictCard verdict={makeVerdict()} />)
    const card = container.querySelector('[role="img"]')
    expect(card).toBeTruthy()
    expect(card?.getAttribute('aria-label')).toContain("This week's verdict")
  })

  it('renders copy button', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText('Copy verdict card')).toBeTruthy()
  })

  it('shows stale data warning when dataFreshness is stale', () => {
    render(<VerdictCard verdict={makeVerdict({ dataFreshness: 'stale' })} />)
    expect(screen.getByText(/Deals may be outdated/)).toBeTruthy()
  })

  it('does not show stale warning when data is current', () => {
    render(<VerdictCard verdict={makeVerdict({ dataFreshness: 'current' })} />)
    expect(screen.queryByText(/Deals may be outdated/)).toBeNull()
  })

  it('renders footer with site name', () => {
    render(<VerdictCard verdict={makeVerdict()} />)
    expect(screen.getByText('basketch.ch')).toBeTruthy()
  })
})
