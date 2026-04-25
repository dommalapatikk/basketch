import type { BrowseCategory } from '@shared/types'

const STORAGE_KEY = 'basketch_category_overrides'

export function readCategoryOverrides(): Record<string, BrowseCategory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, BrowseCategory>) : {}
  } catch {
    return {}
  }
}

export function writeCategoryOverride(itemId: string, category: BrowseCategory): void {
  try {
    const current = readCategoryOverrides()
    current[itemId] = category
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch { /* localStorage unavailable */ }
}
