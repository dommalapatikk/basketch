// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * MF-2, docs/reviews/2026-09-28-review-stale-expired-deals.md: `ListDrawer`
 * excluded expired items from its totals and share text; `BottomBar`
 * (components/deals/BottomBar.tsx) did not, because each computed its own
 * "active" list independently and only one of them remembered the rule
 * (mutation M5, the review's own reproduction: swap `activeItems` back for
 * `items` in ListDrawer and every existing test still passed). One hook, one
 * place the rule lives, both callers use it — see `useActiveListItems` below.
 */
vi.mock('@/lib/domain/validity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/validity')>()
  return { ...actual, todayInZurich: vi.fn(actual.todayInZurich) }
})

import type { ListItem } from './list-store'

/**
 * BLOCKER, code review of WP-W2 commit 9525601: `ListItem` gained required
 * `validFrom`/`priceBasis` fields with no storage migration. A list saved
 * before that deploy has neither key at all — not `null`, simply absent —
 * and `ListDrawer` (mounted in every layout) calls `createShareTarget` on
 * every render, which reads `it.priceBasis.kind` and threw a TypeError for
 * every returning user with a non-empty list.
 *
 * These tests seed localStorage with the EXACT v1 shape (no validFrom, no
 * priceBasis) and prove the store rehydrates it without throwing.
 *
 * `window.localStorage` in this project's jsdom test environment is a
 * non-functional stub (no `getItem`/`setItem`/`clear` — verified: its own
 * keys are `[]` and its prototype is plain `Object.prototype`), so a
 * minimal in-memory polyfill is installed per test. zustand's
 * `createJSONStorage(() => localStorage)` resolves the identifier from the
 * global scope at call time, so replacing `window.localStorage` before the
 * store module is (re-)imported is picked up exactly as real localStorage
 * would be.
 */

const STORAGE_KEY = 'basketch-list'

function installMemoryStorage(): void {
  const backing = new Map<string, string>()
  const storage: Storage = {
    getItem: (key: string) => (backing.has(key) ? (backing.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      backing.set(key, value)
    },
    removeItem: (key: string) => {
      backing.delete(key)
    },
    clear: () => {
      backing.clear()
    },
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
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

async function freshStore() {
  vi.resetModules()
  return import('./list-store')
}

describe('list-store persistence — a list saved before WP-W2 still opens', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  it('rehydrates a v1 item with no validFrom or priceBasis without throwing', async () => {
    const legacyItem = {
      id: 'd1',
      store: 'coop',
      productName: 'Milk',
      category: 'fresh',
      salePrice: 1.5,
      imageUrl: null,
      sourceUrl: null,
      // No validFrom, no priceBasis — the exact v1 shape.
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [legacyItem] }, version: 1 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    const items = useListStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('d1')
    expect(items[0]?.priceBasis).toBeUndefined()
    expect(items[0]?.validFrom).toBeUndefined()
  })

  it('drops a genuinely malformed entry rather than crashing the whole list', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [{ nonsense: true }] }, version: 1 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([])
  })

  it('drops a non-array items payload rather than crashing on rehydrate', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: 'not-an-array' }, version: 1 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([])
  })

  it('drops a malformed entry even when the stored version already matches (merge, not just migrate)', async () => {
    // A hand-edited or otherwise corrupted value under the CURRENT version
    // never goes through `migrate` (versions match) — only `merge` runs.
    // This is the case that would slip through a fix that only guarded the
    // version-mismatch path.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [{ nonsense: true }] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([])
  })

  it('a list item with an unknown store is dropped, not rendered', async () => {
    // NEW-2, code review of 463f27f: isWellFormedItem checked `store` as
    // `typeof === 'string'` but never against STORE_KEYS, so a corrupted
    // store value survived sanitisation and later threw at
    // STORE_BRAND[g.store].label in buildShareText/ListDrawer — the same
    // crash class as the original BLOCKER, inside the function that is
    // supposed to be the single validation point.
    const itemWithBadStore = {
      id: 'd3',
      store: 'not-a-real-store',
      productName: 'Butter',
      category: 'fresh',
      salePrice: 2.5,
      imageUrl: null,
      sourceUrl: null,
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [itemWithBadStore] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([])
  })

  it('a list saved before WP-W4 still opens — an item with no minQuantity key rehydrates fine', async () => {
    // No STORAGE_VERSION bump was needed for WP-W4: minQuantity is optional,
    // exactly like validFrom/priceBasis were for WP-W2, so a pre-existing v2
    // item (which already has validFrom/priceBasis but predates
    // minQuantity) must rehydrate without the key at all — not null.
    const preW4Item = {
      id: 'd4',
      store: 'migros',
      productName: 'Rindsplätzli',
      category: 'fresh',
      salePrice: 3.02,
      imageUrl: null,
      sourceUrl: null,
      validFrom: '2026-09-01',
      priceBasis: { kind: 'everyone' },
      // No minQuantity — the exact pre-WP-W4 v2 shape.
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [preW4Item] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    const items = useListStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('d4')
    expect(items[0]?.minQuantity).toBeUndefined()
    expect(items[0]?.validFrom).toBe('2026-09-01')
  })

  it('keeps a well-formed v2 item exactly as stored', async () => {
    const item = {
      id: 'd2',
      store: 'lidl',
      productName: 'Butter',
      category: 'fresh',
      salePrice: 2.5,
      imageUrl: null,
      sourceUrl: null,
      validFrom: '2026-09-01',
      priceBasis: { kind: 'member-only', programme: 'Lidl Plus' },
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [item] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([item])
  })

  it('a list saved before WP-D5 still opens — an item with no validTo key rehydrates fine', async () => {
    // No STORAGE_VERSION bump was needed for WP-D5: validTo is optional,
    // exactly like minQuantity was for WP-W4, so a pre-existing v2 item
    // (which already has validFrom/priceBasis but predates validTo) must
    // rehydrate without the key at all — not null.
    const preD5Item = {
      id: 'd6',
      store: 'lidl',
      productName: 'Butter',
      category: 'fresh',
      salePrice: 2.5,
      imageUrl: null,
      sourceUrl: null,
      validFrom: '2026-09-01',
      priceBasis: { kind: 'everyone' },
      // No validTo — the exact pre-WP-D5 v2 shape.
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [preD5Item] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    const items = useListStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('d6')
    expect(items[0]?.validTo).toBeUndefined()
    expect(items[0]?.validFrom).toBe('2026-09-01')
  })

  it('keeps a well-formed item with validTo exactly as stored (WP-D5)', async () => {
    const item = {
      id: 'd7',
      store: 'volg',
      productName: 'Rahm',
      category: 'fresh',
      salePrice: 1.2,
      imageUrl: null,
      sourceUrl: null,
      validFrom: '2026-09-20',
      priceBasis: { kind: 'everyone' },
      validTo: '2026-09-26',
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [item] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([item])
  })

  it('keeps a well-formed item with minQuantity exactly as stored (WP-W4)', async () => {
    const item = {
      id: 'd5',
      store: 'migros',
      productName: 'Rindsplätzli',
      category: 'fresh',
      salePrice: 3.02,
      imageUrl: null,
      sourceUrl: null,
      validFrom: '2026-09-01',
      priceBasis: { kind: 'everyone' },
      minQuantity: 2,
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [item] }, version: 2 }),
    )

    const { useListStore } = await freshStore()
    await useListStore.persist.rehydrate()

    expect(useListStore.getState().items).toEqual([item])
  })
})

/**
 * MF-2, docs/reviews/2026-09-28-review-stale-expired-deals.md: `ListDrawer`
 * excluded expired items from its totals/share, but `BottomBar`
 * (components/deals/BottomBar.tsx) shared none of that logic and sent the
 * raw `items` straight to `createShareTarget` — the M5 gap the review names
 * ("ListDrawer sums/shares `items` again instead of `activeItems`" survived
 * unnoticed because nothing pinned the rule anywhere a mutation could kill).
 * One hook, used by both callers, is the fix — this is its base-of-the-
 * pyramid test; ListDrawer.test.tsx and BottomBar.test.tsx pin the same rule
 * at the component level, which is what actually kills M5.
 */
describe('useActiveListItems — the one place "still valid" is computed (MF-2)', () => {
  // `useTodayInZurich` (lib/use-today-in-zurich.ts) imports the mocked
  // `todayInZurich` transitively, so the mock instance a fresh `./list-store`
  // import actually calls only exists once `vi.resetModules()` has forced
  // BOTH modules to re-evaluate together — a static top-of-file import of
  // `todayInZurich` would be a stale reference to the pre-reset mock.
  async function freshActiveListItems() {
    vi.resetModules()
    const validity = await import('@/lib/domain/validity')
    const store = await import('./list-store')
    return { ...store, todayInZurich: validity.todayInZurich }
  }

  beforeEach(() => {
    installMemoryStorage()
  })

  const item = (over: Partial<ListItem> & { id: string; validTo?: string }): ListItem => ({
    store: 'coop',
    productName: 'Milk',
    category: 'fresh',
    salePrice: 1.5,
    imageUrl: null,
    sourceUrl: null,
    ...over,
  })

  it('drops an item whose validTo has passed the Zurich today, keeps one that has not', async () => {
    const { useListStore, useActiveListItems, todayInZurich: today } = await freshActiveListItems()
    vi.mocked(today).mockReturnValue('2026-09-27')
    act(() => {
      useListStore.setState({
        items: [
          item({ id: 'expired', validTo: '2026-09-26' }),
          item({ id: 'active', validTo: '2026-09-30' }),
        ],
      })
    })

    const { result } = renderHook(() => useActiveListItems())

    expect(result.current.map((i) => i.id)).toEqual(['active'])
  })

  it('keeps an item with no validTo at all — unknown reads as not expired, same as hasExpired', async () => {
    const { useListStore, useActiveListItems, todayInZurich: today } = await freshActiveListItems()
    vi.mocked(today).mockReturnValue('2026-09-27')
    act(() => {
      useListStore.setState({ items: [item({ id: 'pre-wp-d5' })] })
    })

    const { result } = renderHook(() => useActiveListItems())

    expect(result.current.map((i) => i.id)).toEqual(['pre-wp-d5'])
  })
})
