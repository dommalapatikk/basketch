// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import messages from '@/messages/en.json'

import { StaleBanner } from './StaleBanner'

/**
 * Code review of 422bd51, F1: `getWeeklySnapshot`'s fail-soft branch set
 * `updatedAt: new Date().toISOString()` on total query failure, so a
 * snapshot that could not load ANY deal read as "updated just now" — the
 * age-only `isStale(updatedAt)` check this banner used to rely on
 * exclusively never fires for a fresh-looking timestamp, no matter how
 * broken the data behind it is. A live Playwright run against exactly this
 * state reported the suite green.
 */

afterEach(cleanup)

const NOW = new Date().toISOString()

const renderBanner = (props: { updatedAt: string; isDegraded?: boolean }) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StaleBanner updatedAt={props.updatedAt} locale="en" isDegraded={props.isDegraded} />
    </NextIntlClientProvider>,
  )

describe('StaleBanner', () => {
  it('shows nothing for a fresh, successful snapshot', () => {
    const { container } = renderBanner({ updatedAt: NOW })
    expect(container.textContent).toBe('')
  })

  it('shows the banner for a snapshot older than the weekly cadence', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    renderBanner({ updatedAt: tenDaysAgo })
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('shows the banner for a degraded snapshot even with a fresh-looking updatedAt', () => {
    // The exact defect: a fail-soft snapshot's updatedAt is the moment of
    // the failure, not the last real update — age alone can never catch it.
    renderBanner({ updatedAt: NOW, isDegraded: true })
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('stays hidden when isDegraded is explicitly false and the snapshot is fresh', () => {
    const { container } = renderBanner({ updatedAt: NOW, isDegraded: false })
    expect(container.textContent).toBe('')
  })
})
