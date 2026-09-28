// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import enMessages from '@/messages/en.json'

import LocaleError from './error'

// Same reason page.test.tsx / DealsClient.test.tsx mock this: `@/i18n/navigation`
// re-exports next-intl's client-side `createNavigation`, which resolves
// `next/navigation` in a way vitest's plain Node resolution can't follow
// outside the real Next.js runtime.
vi.mock('@/i18n/navigation', () => ({
  Link: 'a',
}))

afterEach(cleanup)

// regression 2026-09-25: 404 served global-error (500) — RCA final plan step
// 9. Not a fix for that bug (see error.tsx's own comment on what this
// boundary does and does not catch); this test only proves the localized
// error UI itself renders and behaves correctly, with no test-only throwing
// route shipped to production.
describe('LocaleError (the [locale] segment error boundary)', () => {
  function renderError(reset = vi.fn()) {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <LocaleError error={error} reset={reset} />
      </NextIntlClientProvider>,
    )
    return { error, reset }
  }

  it('renders the localized title and body from messages/en.json errors.*', () => {
    // Note: en's own `errors.server_error_title` copy IS "Something went
    // wrong" — the point of this boundary isn't different wording, it's
    // that it renders WITHIN the [locale] layout (header/footer/locale
    // intact), unlike global-error.tsx's unstyled, unlocalized fallback.
    renderError()
    expect(screen.getByRole('heading', { name: enMessages.errors.server_error_title })).toBeTruthy()
    expect(screen.getByText(enMessages.errors.server_error_body)).toBeTruthy()
  })

  it('shows the error digest as a reference when present', () => {
    renderError()
    expect(screen.getByText(/abc123/)).toBeTruthy()
  })

  it('omits the reference line when there is no digest (a client-thrown error)', () => {
    const reset = vi.fn()
    const error = new Error('boom') as Error & { digest?: string }
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <LocaleError error={error} reset={reset} />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByText(/Reference:/)).toBeNull()
  })

  it('calls reset() when "Try again" is clicked', () => {
    const { reset } = renderError()
    fireEvent.click(screen.getByRole('button', { name: enMessages.errors.try_again }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('has a "back to home" link', () => {
    renderError()
    expect(screen.getByRole('link', { name: enMessages.errors.back_to_home })).toBeTruthy()
  })

  it('logs the error to the console for debugging (does not swallow it silently)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { error } = renderError()
    expect(spy).toHaveBeenCalledWith(error)
    spy.mockRestore()
  })
})
