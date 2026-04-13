import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StaleBanner } from './StaleBanner'

describe('StaleBanner', () => {
  it('renders warning text with date', () => {
    render(<StaleBanner lastUpdated="2026-04-05T18:00:00Z" />)
    expect(screen.getByText(/Deals may be outdated/)).toBeTruthy()
  })

  it('renders a time element', () => {
    const { container } = render(<StaleBanner lastUpdated="2026-04-05T18:00:00Z" />)
    const timeEl = container.querySelector('time')
    expect(timeEl).toBeTruthy()
    expect(timeEl?.getAttribute('dateTime')).toBe('2026-04-05T18:00:00Z')
  })

  it('has role="status" for accessibility', () => {
    const { container } = render(<StaleBanner lastUpdated="2026-04-05T18:00:00Z" />)
    expect(container.querySelector('[role="status"]')).toBeTruthy()
  })

  it('has aria-live="polite" for screen readers', () => {
    const { container } = render(<StaleBanner lastUpdated="2026-04-05T18:00:00Z" />)
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy()
  })
})
