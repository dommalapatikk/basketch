'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { StoreKey } from '@/lib/store-tokens'
import type { DealCategory, PriceBasis } from '@/lib/types'

// What the user "added" to their shopping list. We snapshot the relevant deal
// fields at add-time so the list survives even if the upstream snapshot
// rotates (the deal id can change next week, but the user still sees what they
// chose). Shareable IDs travel via the URL — see lib/share-url.ts.
export type ListItem = {
  id: string
  store: StoreKey
  productName: string
  category: DealCategory
  salePrice: number
  imageUrl: string | null
  sourceUrl: string | null
  /**
   * Raw fields, not a pre-rendered label — the label is locale text
   * (lib/format.ts formatValidFromShort, lib/domain/price-basis.ts
   * programmeOf) computed where it is shown (ListDrawer, buildShareText), so
   * it stays correct if the item is viewed a day later or shared to a
   * different locale. CLAUDE.md: a member price must be labelled wherever
   * its price is shown, and the list drawer and the shared text both show it.
   *
   * OPTIONAL, not required: this store persists to localStorage across
   * deploys, and an item added before these two fields existed rehydrates
   * with neither present at all — not `null`, simply absent (code review of
   * 9525601, BLOCKER). Every reader of a `ListItem` (isMemberOnly,
   * startsAfterToday, formatMemberPriceLabel) is written to treat "absent"
   * the same as "we don't know" — never a crash, and never a guess dressed
   * up as a fact.
   */
  validFrom?: string
  priceBasis?: PriceBasis
}

type ListState = {
  items: ListItem[]
  add: (item: ListItem) => void
  remove: (id: string) => void
  clear: () => void
  has: (id: string) => boolean
  // Replace the whole list — used by /list?items= rehydration.
  replaceAll: (items: ListItem[]) => void
}

// v2 (WP-W2 code review, BLOCKER): validFrom/priceBasis became part of the
// shape. Bumping STORAGE_VERSION runs `migrate` for anyone still on v1; the
// `merge` hook below runs the SAME check on every load regardless of
// version, so a hand-edited or otherwise corrupted value can never crash the
// page either.
const STORAGE_VERSION = 2
const STORAGE_KEY = 'basketch-list'

/**
 * The base shape a `ListItem` has always had, checked defensively.
 * `validFrom`/`priceBasis` are deliberately NOT required here — a
 * well-formed v1 item lacks them and must still pass.
 */
function isWellFormedItem(value: unknown): value is ListItem {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.store === 'string' &&
    typeof v.productName === 'string' &&
    typeof v.category === 'string' &&
    typeof v.salePrice === 'number'
  )
}

/**
 * Filters a persisted blob — possibly years old, possibly hand-edited in
 * devtools, possibly just wrong — down to items this store can safely
 * render. The one place untrusted storage data is validated; both `migrate`
 * and `merge` below call it rather than each doing their own check.
 */
export function sanitizeItems(persistedState: unknown): ListItem[] {
  const state = persistedState as { items?: unknown } | null | undefined
  const rawItems = Array.isArray(state?.items) ? state.items : []
  return rawItems.filter(isWellFormedItem)
}

export const useListStore = create<ListState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        if (get().items.some((i) => i.id === item.id)) return
        set({ items: [...get().items, item] })
      },
      remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
      replaceAll: (items) => set({ items }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Only persist the items, not the action functions.
      partialize: (state) => ({ items: state.items }),
      migrate: (persistedState) => ({ items: sanitizeItems(persistedState) }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        items: sanitizeItems(persistedState),
      }),
    },
  ),
)

// Convenience selector hooks — keep components from re-rendering on every
// store mutation by subscribing only to the slice they care about.
export const useListCount = () => useListStore((s) => s.items.length)
export const useIsInList = (id: string) => useListStore((s) => s.has(id))
