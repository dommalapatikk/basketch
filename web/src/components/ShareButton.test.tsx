import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

import { ShareButton } from './ShareButton'

afterEach(cleanup)

describe('ShareButton', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ShareButton title="Test" text="Test text">
        Share
      </ShareButton>
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders children text', () => {
    render(
      <ShareButton title="Test" text="Test text">
        Share this
      </ShareButton>
    )
    expect(screen.getByText('Share this')).toBeTruthy()
  })

  it('renders as a button element', () => {
    render(
      <ShareButton title="Test" text="Test text">
        Share
      </ShareButton>
    )
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('calls clipboard API on click when navigator.share is not available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      share: undefined,
      clipboard: { writeText },
    })

    render(
      <ShareButton title="Test" text="Test text" url="https://example.com">
        Share
      </ShareButton>
    )

    fireEvent.click(screen.getByText('Share'))
    expect(writeText).toHaveBeenCalledWith('https://example.com')
  })

  it('uses window.location.href when url prop is not provided', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      share: undefined,
      clipboard: { writeText },
    })

    render(
      <ShareButton title="Test" text="Test text">
        Share
      </ShareButton>
    )

    fireEvent.click(screen.getByText('Share'))
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })
})
