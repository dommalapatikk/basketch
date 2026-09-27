// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import type { AvailabilityCell } from '@/lib/v3-types'
import messages from '@/messages/en.json'

import { AvailabilityStrip } from './AvailabilityStrip'

// Regression 2026-09-27: a store last on deal 28–29 days ago read
// "Last on deal 0 months ago" (freshness bucket gap). Tech Lead ruling TL.1.

const DAY = 24 * 60 * 60 * 1000

function cell(daysAgo: number): AvailabilityCell {
  return {
    storeSlug: 'coop',
    state: 'B',
    dealPrice: null,
    discountPercent: null,
    // Mid-day offset keeps the whole-day count stable while the test runs.
    lastSeenAt: new Date(Date.now() - daysAgo * DAY - DAY / 2).toISOString(),
    dealId: null,
  }
}

function renderStrip(daysAgo: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AvailabilityStrip conceptName="Whole milk 1 L" cells={[cell(daysAgo)]} />
    </NextIntlClientProvider>,
  )
}

describe('AvailabilityStrip — off-deal age wording', () => {
  afterEach(() => cleanup())

  it.each([28, 29])('day %i reads "4 weeks ago", never "0 months"', (days) => {
    renderStrip(days)
    const label = screen.getByLabelText(/Last on deal/)
    expect(label.getAttribute('aria-label')).toBe(
      'Coop. Last on deal 4 weeks ago. Tap to see details.',
    )
    expect(document.body.textContent).not.toMatch(/\b0\s*(mo|month)/)
  })

  it('day 1 reads "1 day ago", not "1 days"', () => {
    renderStrip(1)
    expect(screen.getByLabelText(/Last on deal/).getAttribute('aria-label')).toBe(
      'Coop. Last on deal 1 day ago. Tap to see details.',
    )
  })
})
