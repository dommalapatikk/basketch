import { NextIntlClientProvider } from 'next-intl'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import messages from '@/messages/en.json'

import { ListDrawer } from './ListDrawer'

// Regression (2026-09-27 build failure): ListDrawer read `todayInZurich()`
// during render. It is mounted in the [locale] layout, so every page's
// prerender hit a client-side clock read and `next build` failed
// ("used `new Date()` inside a Client Component without a Suspense
// boundary", /de/about). The date may only be read after mount.

const clock = vi.hoisted(() => ({ calls: 0 }))

vi.mock('@/lib/domain/validity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/validity')>()
  return {
    ...actual,
    todayInZurich: () => {
      clock.calls++
      return actual.todayInZurich()
    },
  }
})

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: unknown }) => children,
}))

describe('ListDrawer — no clock read during server render', () => {
  it('renders on the server without reading the Zurich date', () => {
    clock.calls = 0
    renderToString(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Zurich">
        <ListDrawer locale="en" />
      </NextIntlClientProvider>,
    )
    expect(clock.calls).toBe(0)
  })
})
