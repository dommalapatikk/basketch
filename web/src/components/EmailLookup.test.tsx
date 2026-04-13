import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { EmailLookup } from './EmailLookup'

afterEach(cleanup)

// Mock queries module
vi.mock('../lib/queries', () => ({
  lookupBasketByEmail: vi.fn(),
}))

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('EmailLookup', () => {
  it('renders without crashing', () => {
    const { container } = render(wrap(<EmailLookup />))
    expect(container.firstChild).toBeTruthy()
  })

  it('renders heading text', () => {
    render(wrap(<EmailLookup />))
    expect(screen.getByText('Already have a list?')).toBeTruthy()
  })

  it('renders email input with sr-only label', () => {
    render(wrap(<EmailLookup />))
    expect(screen.getByLabelText('Email address')).toBeTruthy()
  })

  it('renders Find button', () => {
    render(wrap(<EmailLookup />))
    expect(screen.getByText('Find')).toBeTruthy()
  })

  it('shows validation error for invalid email', async () => {
    render(wrap(<EmailLookup />))

    const input = screen.getByLabelText('Email address')
    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByText('Find'))

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeTruthy()
    })
  })

  it('shows validation error for empty input', async () => {
    render(wrap(<EmailLookup />))

    fireEvent.click(screen.getByText('Find'))

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeTruthy()
    })
  })

  it('error message has role="alert"', async () => {
    render(wrap(<EmailLookup />))

    fireEvent.click(screen.getByText('Find'))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeTruthy()
      expect(alert.textContent).toContain('Please enter a valid email address')
    })
  })

  it('shows "No list found" error and create link when email not found', async () => {
    const { lookupBasketByEmail } = await import('../lib/queries')
    vi.mocked(lookupBasketByEmail).mockResolvedValueOnce(null)

    render(wrap(<EmailLookup />))

    const input = screen.getByLabelText('Email address')
    fireEvent.change(input, { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByText('Find'))

    await waitFor(() => {
      expect(screen.getByText('No list found for this email.')).toBeTruthy()
      expect(screen.getByText('Want to create one?')).toBeTruthy()
    })
  })

  it('shows success status when basket is found', async () => {
    const { lookupBasketByEmail } = await import('../lib/queries')
    vi.mocked(lookupBasketByEmail).mockResolvedValueOnce({
      id: 'basket-123',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    render(wrap(<EmailLookup />))

    const input = screen.getByLabelText('Email address')
    fireEvent.change(input, { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByText('Find'))

    await waitFor(() => {
      expect(screen.getByText('Found! Redirecting...')).toBeTruthy()
      expect(screen.getByRole('status')).toBeTruthy()
    })
  })
})
