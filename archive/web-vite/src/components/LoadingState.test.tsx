import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  it('renders default message', () => {
    render(<LoadingState />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('renders custom message', () => {
    render(<LoadingState message="Loading deals..." />)
    expect(screen.getByText('Loading deals...')).toBeTruthy()
  })

  it('has role="status" for accessibility', () => {
    const { container } = render(<LoadingState />)
    expect(container.querySelector('[role="status"]')).toBeTruthy()
  })

  it('has aria-live="polite" for screen readers', () => {
    const { container } = render(<LoadingState />)
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy()
  })
})
