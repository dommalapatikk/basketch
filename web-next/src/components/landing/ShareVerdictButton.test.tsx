// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

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
