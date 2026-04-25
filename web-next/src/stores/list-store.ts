'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { StoreKey } from '@/lib/store-tokens'
import type { DealCategory } from '@/lib/types'

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

// Bumping STORAGE_VERSION migrates persisted state — currently the only
// migration is "drop everything and start fresh".
const STORAGE_VERSION = 1
const STORAGE_KEY = 'basketch-list'

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
    },
  ),
)

// Convenience selector hooks — keep components from re-rendering on every
// store mutation by subscribing only to the slice they care about.
export const useListCount = () => useListStore((s) => s.items.length)
export const useIsInList = (id: string) => useListStore((s) => s.has(id))
