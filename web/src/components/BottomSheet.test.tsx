// BottomSheet behaviour: open renders, close/apply/clear wiring.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

import { BottomSheet } from './BottomSheet'

afterEach(cleanup)

function setup(overrides: Partial<Parameters<typeof BottomSheet>[0]> = {}) {
  const onClose = vi.fn()
  const onApply = vi.fn()
  const onClear = vi.fn()
  const utils = render(
    <BottomSheet
      open
      title='Filters'
      onClose={onClose}
      onApply={onApply}
      onClear={onClear}
      {...overrides}
    >
      <p>body content</p>
    </BottomSheet>,
  )
  return { ...utils, onClose, onApply, onClear }
}

describe('BottomSheet', () => {
  it('renders title + body when open', () => {
    setup()
    expect(screen.getByText('Filters')).toBeTruthy()
    expect(screen.getByText('body content')).toBeTruthy()
  })

  it('renders nothing when closed', () => {
    const { queryByText } = render(
      <BottomSheet open={false} title='Filters' onClose={vi.fn()} onApply={vi.fn()} onClear={vi.fn()}>
        <p>body content</p>
      </BottomSheet>,
    )
    expect(queryByText('body content')).toBeNull()
  })

  it('calls onApply when the apply button is clicked', () => {
    const { onApply } = setup({ applyLabel: 'Show 42 deals' })
    fireEvent.click(screen.getByText('Show 42 deals'))
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('calls onClear when the clear button is clicked', () => {
    const { onClear, onClose } = setup()
    fireEvent.click(screen.getByText('Clear'))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when ESC is pressed', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when scrim is clicked', () => {
    const { onClose } = setup()
    const scrim = screen.getByLabelText('Close filters')
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalled()
  })
})
