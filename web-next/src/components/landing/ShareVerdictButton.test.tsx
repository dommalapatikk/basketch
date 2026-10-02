// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('ShareVerdictButton — share and clipboard outcomes', () => {
  const unhandled = vi.fn()

  beforeEach(() => {
    unhandled.mockClear()
    process.on('unhandledRejection', unhandled)
  })

  afterEach(() => {
    process.off('unhandledRejection', unhandled)
    vi.unstubAllGlobals()
  })

  function stubNavigator(extra: Record<string, unknown>) {
    vi.stubGlobal('navigator', { ...navigator, ...extra })
  }

  async function clickShare() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: messages.share_verdict.copy }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  // Regression (Sonar S9383): copy() was fired without being awaited/handled and
  // its catch swallowed the error silently, so a blocked clipboard looked like
  // a button that did nothing.
  it('tells the user when the clipboard write is rejected, with no unhandled rejection', async () => {
    stubNavigator({
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    })
    await renderButton({ locale: 'de', today: '2026-09-27' })

    await clickShare()

    expect(screen.getByRole('status').textContent).toBe(messages.share_verdict.copy_failed)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('announces "Copied" in the live region when the clipboard write succeeds', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    await renderButton({ locale: 'de', today: '2026-09-27' })
    // The live region exists before any action, so the later text change is announced.
    expect(screen.getByRole('status').textContent).toBe('')

    await clickShare()

    expect(screen.getByRole('status').textContent).toBe(messages.share_verdict.copied)
  })

  // Regression (review M1): cancelling the native share sheet rejects with
  // AbortError; it must not fall through to a surprise clipboard write.
  it('does not copy or show an error when the user cancels the native share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    stubNavigator({ share, clipboard: { writeText } })
    await renderButton({ locale: 'de', today: '2026-09-27' })

    await clickShare()

    expect(share).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('falls back to copy when native share fails for a reason other than cancel', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn().mockRejectedValue(new DOMException('nope', 'NotAllowedError'))
    stubNavigator({ share, clipboard: { writeText } })
    await renderButton({ locale: 'de', today: '2026-09-27' })

    await clickShare()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe(messages.share_verdict.copied)
  })
})
