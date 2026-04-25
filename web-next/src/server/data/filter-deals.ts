import type { DealsFilters } from '@/lib/filters'
import type { StoreKey } from '@/lib/store-tokens'
import type { Deal } from '@/lib/types'

// Slim shape used both for in-memory filtering and for client-side facet count.
// Anything richer than this lives only on the server side of the wire.
export type DealFacet = Pick<Deal, 'store' | 'category' | 'subCategory' | 'productName'>

// Single source of truth for the filter predicate. Reused by `filterDeals`
// (server) and `countMatches` (client) so a URL change always produces the
// same deal set across surfaces.
export function matchDeal(d: DealFacet, f: DealsFilters): boolean {
  if (f.type !== 'all' && d.category !== f.type) return false
  if (f.category && (d.subCategory ?? '').toLowerCase() !== f.category.toLowerCase())
    return false
  if (!f.stores.includes(d.store)) return false
  if (f.q && !d.productName.toLowerCase().includes(f.q.trim().toLowerCase())) return false
  return true
}

// Pure server-side filter — applied after getWeeklySnapshot returns the full
// list. We do all filtering in-memory because the snapshot is cached for an
// hour, and the dataset (~1.5k deals) easily fits in a single function call.
export function filterDeals(deals: Deal[], f: DealsFilters): Deal[] {
  return deals.filter((d) => matchDeal(d, f))
}

// Client-friendly count over slim facets — used by FilterSheet's "Show n deals"
// button and any other surface that needs a live preview without round-tripping.
export function countMatches(facets: DealFacet[], f: DealsFilters): number {
  let n = 0
  for (const d of facets) if (matchDeal(d, f)) n += 1
  return n
}

// Counts per store for the current filter set *minus* the store filter — so
// disabled chips show "0" but enabling a previously-disabled chip would still
// produce results in other dimensions. This is the standard faceted-search
// pattern (Algolia / Elastic call it "or" facet counts).
export function storeCounts(deals: Deal[], f: DealsFilters): Record<StoreKey, number> {
  const without = { ...f, stores: [] as StoreKey[] }
  // Run filter ignoring the store dimension by accepting all stores
  const q = without.q.trim().toLowerCase()
  const subCat = without.category?.toLowerCase() ?? null
  const counts = {} as Record<StoreKey, number>
  for (const d of deals) {
    if (without.type !== 'all' && d.category !== without.type) continue
    if (subCat && (d.subCategory ?? '').toLowerCase() !== subCat) continue
    if (q && !d.productName.toLowerCase().includes(q)) continue
    counts[d.store] = (counts[d.store] ?? 0) + 1
  }
  return counts
}

// Sub-categories that exist *in the current type filter*, with their counts.
// Used by FilterRail's collapsible Category list and by the deals page section
// headers. Returns sorted by count desc.
export function subCategoryCounts(
  deals: Deal[],
  f: DealsFilters,
): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>()
  const q = f.q.trim().toLowerCase()
  const storeSet = new Set<StoreKey>(f.stores)
  for (const d of deals) {
    if (f.type !== 'all' && d.category !== f.type) continue
    if (!storeSet.has(d.store)) continue
    if (q && !d.productName.toLowerCase().includes(q)) continue
    const key = d.subCategory?.trim() || ''
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

export type DealsSection = {
  subCategory: string
  primary: Deal
  others: Deal[]
}

// Group filtered deals by sub_category, sort each group by discountPercent
// desc, take the top deal as `primary` and up to `compactLimit` more as
// `others`. Sections themselves are sorted by total deal count desc so
// dense sub-categories surface first.
export function buildSections(deals: Deal[], compactLimit = 4): DealsSection[] {
  const groups = new Map<string, Deal[]>()
  for (const d of deals) {
    const key = d.subCategory?.trim() || 'Other'
    const arr = groups.get(key) ?? []
    arr.push(d)
    groups.set(key, arr)
  }
  return Array.from(groups.entries())
    .map(([subCategory, items]) => {
      const sorted = [...items].sort((a, b) => b.discountPercent - a.discountPercent)
      return {
        subCategory,
        primary: sorted[0],
        others: sorted.slice(1, 1 + compactLimit),
      }
    })
    .sort((a, b) => b.others.length + 1 - (a.others.length + 1))
}
