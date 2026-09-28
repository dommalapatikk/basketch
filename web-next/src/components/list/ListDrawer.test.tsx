// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import messages from '@/messages/en.json'
import { useListStore } from '@/stores/list-store'
import { useUiStore } from '@/stores/ui-store'

import { ListDrawer } from './ListDrawer'

// Regression (2026-09-27 build failure): ListDrawer read `todayInZurich()`
// during render. It is mounted in the [locale] layout, so every page's
// prerender hit a client-side clock read and `next build` failed
// ("used `new Date()` inside a Client Component without a Suspense
// boundary", /de/about). The date may only be read after mount.

// jsdom's localStorage here lacks setItem; the list store captures storage
// when its module loads, so install a working one before any import runs.
vi.hoisted(() => {
  const backing = new Map<string, string>()
  const storage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    get length() {
      return backing.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
})

const clock = vi.hoisted(() => ({ calls: 0, today: undefined as string | undefined }))

vi.mock('@/lib/domain/validity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/validity')>()
  return {
    ...actual,
    todayInZurich: () => {
      clock.calls++
      return clock.today ?? actual.todayInZurich()
    },
  }
})

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: unknown }) => children,
}))

describe('ListDrawer — no clock read during server render', () => {
  it('renders on the server without reading the Zurich date', () => {
    clock.calls = 0
    clock.today = undefined
    renderToString(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Zurich">
        <ListDrawer locale="en" />
      </NextIntlClientProvider>,
    )
    expect(clock.calls).toBe(0)
  })
})

/**
 * MF-2, docs/reviews/2026-09-28-review-stale-expired-deals.md: kills
 * mutation M5 (swap `activeItems` back for `items` in ListDrawer's totals/
 * share — every test passed before this one existed). An expired item must
 * stay visible in the list itself (so the user can remove it) but drop out
 * of the "Where to buy" total and the WhatsApp share text, because its saved
 * price is no longer objectively correct (CLAUDE.md, Art. 3(1)(e) UWG).
 */
describe('ListDrawer — expired items are visible but excluded from totals and share (MF-2)', () => {
  function installMemoryStorage(): void {
    const backing = new Map<string, string>()
    const storage: Storage = {
      getItem: (key) => (backing.has(key) ? (backing.get(key) as string) : null),
      setItem: (key, value) => {
        backing.set(key, value)
      },
      removeItem: (key) => {
        backing.delete(key)
      },
      clear: () => backing.clear(),
      key: (index) => Array.from(backing.keys())[index] ?? null,
      get length() {
        return backing.size
      },
    }
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    })
  }

  afterEach(() => {
    cleanup()
    act(() => {
      useListStore.setState({ items: [] })
      useUiStore.setState({ isListDrawerOpen: false })
    })
    clock.today = undefined
  })

  it('shows the expired item but sums and shares only the active one', async () => {
    installMemoryStorage()
    clock.today = '2026-09-15'

    act(() => {
      useListStore.setState({
        items: [
          {
            id: 'expired',
            store: 'coop',
            productName: 'Old Milk',
            category: 'fresh',
            salePrice: 10,
            imageUrl: null,
            sourceUrl: null,
            validTo: '2026-09-01',
          },
          {
            id: 'active',
            store: 'coop',
            productName: 'Fresh Butter',
            category: 'fresh',
            salePrice: 2.5,
            imageUrl: null,
            sourceUrl: null,
            validTo: '2026-12-31',
          },
        ],
      })
      useUiStore.setState({ isListDrawerOpen: true })
    })

    await act(async () => {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ListDrawer locale="en" />
        </NextIntlClientProvider>,
      )
    })

    // Visible in the list itself — expired items are shown, not removed.
    expect(await screen.findByText('Old Milk')).toBeTruthy()
    expect(screen.getByText('Fresh Butter')).toBeTruthy()

    // "Where to buy" totals only the active item: 2.50 appears (item line and
    // total), and the combined 12.50 never does. The expired item keeps its
    // own price on its visible line, by design.
    expect(screen.getAllByText(/CHF\s*2\.50/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/12\.50/)).toBeNull()

    // The WhatsApp share text names the active item only.
    const whatsappLink = document.querySelector('a[href^="https://wa.me/"]')
    expect(whatsappLink).not.toBeNull()
    const shareHref = whatsappLink?.getAttribute('href') ?? ''
    expect(decodeURIComponent(shareHref)).toContain('CHF 2.50')
    expect(decodeURIComponent(shareHref)).not.toContain('12.50')
    expect(decodeURIComponent(shareHref)).not.toContain('Old Milk')
  })
})
