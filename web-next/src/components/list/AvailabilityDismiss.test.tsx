// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AvailabilityCell } from '@/lib/v3-types'
import messages from '@/messages/en.json'

import { AvailabilityCellSheet } from './AvailabilityCellSheet'
import { AvailabilityHelpPopover } from './AvailabilityHelpPopover'

// Sonar S1082: both overlays used a click-handling <div> backdrop plus a
// stopPropagation panel. The scrim is now a real button and the panel carries
// no click handler. These tests pin the dismiss behaviour.

afterEach(cleanup)

const cell: AvailabilityCell = {
  storeSlug: 'coop',
  state: 'C',
  dealPrice: null,
  discountPercent: null,
  lastSeenAt: null,
  dealId: null,
}

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>
  )
}

describe.each([
  [
    'AvailabilityCellSheet',
    (onClose: () => void) => (
      <AvailabilityCellSheet cell={cell} conceptName="Milk" onClose={onClose} />
    ),
  ],
  [
    'AvailabilityHelpPopover',
    (onClose: () => void) => <AvailabilityHelpPopover onClose={onClose} />,
  ],
])('%s dismissal', (_name, build) => {
  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn()
    render(withIntl(build(onClose)))
    const [scrim] = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(scrim as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the panel content is clicked', () => {
    const onClose = vi.fn()
    render(withIntl(build(onClose)))
    fireEvent.click(screen.getByRole('heading'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(withIntl(build(onClose)))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the scrim out of the tab order, leaving one focusable Close button in the panel', () => {
    render(withIntl(build(vi.fn())))
    const closers = screen.getAllByRole('button', { name: 'Close' })
    expect(closers[0]?.getAttribute('tabindex')).toBe('-1')
    expect(closers[1]?.getAttribute('tabindex')).toBeNull()
  })
})
