import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('renders default message', () => {
    render(<ErrorState />)
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy()
  })

  it('renders custom message', () => {
    render(<ErrorState message="Custom error" />)
    expect(screen.getByText('Custom error')).toBeTruthy()
  })

  it('renders retry button when onRetry provided', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    const button = screen.getByText('Try again')
    expect(button).toBeTruthy()
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not render retry button when onRetry not provided', () => {
    const { container } = render(<ErrorState />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('has alert role for accessibility', () => {
    const { container } = render(<ErrorState />)
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
  })
})
