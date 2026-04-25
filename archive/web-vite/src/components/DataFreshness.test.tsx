import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { DataFreshness } from './DataFreshness'

afterEach(cleanup)

describe('DataFreshness', () => {
  it('returns null when lastUpdated is null', () => {
    const { container } = render(<DataFreshness lastUpdated={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders formatted date', () => {
    render(<DataFreshness lastUpdated="2026-04-09T12:00:00Z" />)
    expect(screen.getByText(/Deals updated/)).toBeTruthy()
  })

  it('renders a time element with datetime attribute', () => {
    const { container } = render(<DataFreshness lastUpdated="2026-04-09T12:00:00Z" />)
    const time = container.querySelector('time')
    expect(time).toBeTruthy()
    expect(time?.getAttribute('dateTime')).toBe('2026-04-09T12:00:00Z')
  })
})
