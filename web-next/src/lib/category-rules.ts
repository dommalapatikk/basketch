import type { DealCategory } from './types'

// Spec §13.1 — verdict tie threshold. Two stores are "tied" when their average
// discount % is within this many percentage points of each other.
export const TIE_THRESHOLD_PCT = 2

// Minimum deals a store needs in a category before its average is considered
// a real signal (otherwise one big discount on one obscure item could "win"
// long-life for a store with 1 deal).
export const MIN_DEALS_FOR_WINNER = 5

export const ACTIVE_CATEGORIES: DealCategory[] = ['fresh', 'longlife', 'household']

export const CATEGORY_LABELS_DE: Record<DealCategory, string> = {
  fresh: 'Frische',
  longlife: 'Trockensortiment',
  household: 'Haushalt',
}

export const CATEGORY_LABELS_EN: Record<DealCategory, string> = {
  fresh: 'Fresh',
  longlife: 'Long-life',
  household: 'Household',
}
