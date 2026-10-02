// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import messages from '@/messages/en.json'

import { ShareVerdictButton } from './ShareVerdictButton'

/**
 * D2, docs/rca/2026-09-27-architect-stale-expired-deals.md §6: "the /card
 * OG image, so social-network caches key by day too." The preview link
 * (and, by the same construction, the WhatsApp/mail bodies that reference
 * `cardUrl`) must vary by the Zurich date the verdict was built for.
 */

afterEach(cleanup)

async function renderButton(props: { locale: string; today: string }) {
  await act(async () => {
    render(
      <NextIntlClientProvider locale={props.locale} messages={messages}>
        <ShareVerdictButton locale={props.locale} today={props.today} />
      </NextIntlClientProvider>,
    )
  })
}

describe('ShareVerdictButton — /card URL carries the Zurich date', () => {
  it('includes `d=<today>` and the locale in the preview card link', async () => {
    await renderButton({ locale: 'de', today: '2026-09-27' })
    const link = screen.getByText(messages.share_verdict.preview_card).closest('a')
    expect(link?.getAttribute('href')).toBe('http://localhost:3000/card?locale=de&d=2026-09-27')
  })

  it('two different days produce two different card URLs', async () => {
    await renderButton({ locale: 'de', today: '2026-09-26' })
    const firstHref = screen
      .getByText(messages.share_verdict.preview_card)
      .closest('a')
      ?.getAttribute('href')
    cleanup()

    await renderButton({ locale: 'de', today: '2026-09-27' })
    const secondHref = screen
      .getByText(messages.share_verdict.preview_card)
      .closest('a')
      ?.getAttribute('href')

    expect(firstHref).not.toBe(secondHref)
    expect(secondHref).toContain('d=2026-09-27')
  })
})

describe('ShareVerdictButton — clipboard failure', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Regression (Sonar S9383): copy() was fired without being awaited/handled and
  // its catch swallowed the error silently, so a blocked clipboard looked like
  // a button that did nothing.
  it('tells the user when the clipboard write is rejected, with no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    })
    await renderButton({ locale: 'de', today: '2026-09-27' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: messages.share_verdict.copy }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByRole('status').textContent).toBe(messages.share_verdict.copy_failed)
    expect(screen.queryByText(messages.share_verdict.copied)).toBeNull()
    expect(unhandled).not.toHaveBeenCalled()
    process.off('unhandledRejection', unhandled)
  })

  it('shows "Copied" when the clipboard write succeeds', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    await renderButton({ locale: 'de', today: '2026-09-27' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: messages.share_verdict.copy }))
    })

    expect(screen.getByRole('button', { name: messages.share_verdict.copied })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
