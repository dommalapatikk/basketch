import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CoopStatusMessage } from './CoopStatusMessage'

describe('CoopStatusMessage', () => {
  it('shows Tier 1 message when product is known', () => {
    render(<CoopStatusMessage coopProductKnown={true} />)
    expect(screen.getByText('Not on promotion at Coop this week')).toBeTruthy()
  })

  it('shows Tier 2 message when product is unknown', () => {
    render(<CoopStatusMessage coopProductKnown={false} />)
    expect(screen.getByText(/We haven't found this at Coop yet/)).toBeTruthy()
  })

  it('Tier 2 has role="note"', () => {
    const { container } = render(<CoopStatusMessage coopProductKnown={false} />)
    expect(container.querySelector('[role="note"]')).toBeTruthy()
  })

  it('Tier 1 does not have role="note"', () => {
    const { container } = render(<CoopStatusMessage coopProductKnown={true} />)
    expect(container.querySelector('[role="note"]')).toBeNull()
  })
})
