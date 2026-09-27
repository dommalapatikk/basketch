// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import messages from '@/messages/en.json'

/**
 * D5, docs/rca/2026-09-27-architect-stale-expired-deals.md §6: a tab left
 * open across a Zurich midnight keeps rendering the deal count and verdicts
 * computed for `referenceDay` (`WeeklySnapshot.today`) — nothing else in the
 * page notices the day has changed. `MidnightGuard` polls the BROWSER's own
 * clock (never the server's, never re-fetches) and offers a refresh once it
 * disagrees with what was rendered.
 */
vi.mock('@/lib/domain/validity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/validity')>()
  return { ...actual, todayInZurich: vi.fn(actual.todayInZurich) }
})

import { todayInZurich } from '@/lib/domain/validity'
import { MidnightGuard } from './MidnightGuard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const renderGuard = (referenceDay: string) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MidnightGuard referenceDay={referenceDay} />
    </NextIntlClientProvider>,
  )

describe('MidnightGuard', () => {
  it('renders nothing while the browser day still matches the rendered snapshot day', () => {
    vi.mocked(todayInZurich).mockReturnValue('2026-09-26')
    const { container } = renderGuard('2026-09-26')
    expect(container.textContent).toBe('')
  })

  it('shows a refresh prompt once the browser day has moved past the snapshot day', async () => {
    vi.useFakeTimers()
    vi.mocked(todayInZurich).mockReturnValue('2026-09-26')
    renderGuard('2026-09-26')
    expect(screen.queryByRole('status')).toBeNull()

    vi.mocked(todayInZurich).mockReturnValue('2026-09-27')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(messages.midnight_guard.refresh)).toBeTruthy()
  })

  it('reloads the page when the refresh control is activated', async () => {
    vi.useFakeTimers()
    vi.mocked(todayInZurich).mockReturnValue('2026-09-26')
    renderGuard('2026-09-26')
    vi.mocked(todayInZurich).mockReturnValue('2026-09-27')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
      configurable: true,
    })

    screen.getByRole('button', { name: messages.midnight_guard.refresh_cta }).click()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('never shows the prompt for a day that has not actually changed, even after many checks', async () => {
    vi.useFakeTimers()
    vi.mocked(todayInZurich).mockReturnValue('2026-09-26')
    renderGuard('2026-09-26')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    expect(screen.queryByRole('status')).toBeNull()
  })
})
