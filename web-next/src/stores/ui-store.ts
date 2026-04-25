'use client'

import { create } from 'zustand'

// Lightweight UI-only Zustand slice. Not persisted — just shared open-state for
// global overlays (list drawer, future toasts, etc) so any trigger anywhere in
// the tree can open them without prop-drilling or context wrappers.
type UiState = {
  isListDrawerOpen: boolean
  setListDrawerOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  isListDrawerOpen: false,
  setListDrawerOpen: (open) => set({ isListDrawerOpen: open }),
}))
