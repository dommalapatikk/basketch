import type { DealsFilters } from '@/lib/filters'
import type { StoreKey } from '@/lib/store-tokens'
import type { Deal, StorageState } from '@/lib/types'

// Slim shape used both for in-memory filtering and for client-side facet count.
// Anything richer than this lives only on the server side of the wire.
// Patch F: include categorySlug so client-side facet counts honour the new
// mid-level Category dimension without re-fetching deals.
export type DealFacet = Pick<
  Deal,
  'store' | 'category' | 'categorySlug' | 'subCategory' | 'productName' | 'storage'
>

// Single source of truth for the filter predicate. Reused by `filterDeals`
// (server) and `countMatches` (client) so a URL change always produces the
// same deal set across surfaces.
//
// Patch F: now filters across 4 dimensions —
//   type        (Type, e.g. fresh/long-life/household)
//   category    (mid-level Category, e.g. drinks)         ← new
//   subCategory (sub-category, e.g. wine)                 ← was f.category
//   stores      (StoreKey[])
// + the existing free-text search.
export function matchDeal(d: DealFacet, f: DealsFilters): boolean {
  if (f.type !== 'all' && d.category !== f.type) return false
  if (f.category && (d.categorySlug ?? '').toLowerCase() !== f.category.toLowerCase())
    return false
  if (f.subCategory && (d.subCategory ?? '').toLowerCase() !== f.subCategory.toLowerCase())
    return false
  // A deal whose storage the retailer never stated is not "ambient by default" —
  // it simply cannot answer the question, so it drops out of a storage filter
  // rather than being guessed into one.
  if (f.storage && d.storage !== f.storage) return false
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
// produce results in other dimensions. Standard "or" facet pattern.
export function storeCounts(deals: Deal[], f: DealsFilters): Record<StoreKey, number> {
  const q = f.q.trim().toLowerCase()
  const cat = f.category?.toLowerCase() ?? null
  const subCat = f.subCategory?.toLowerCase() ?? null
  const counts = {} as Record<StoreKey, number>
  for (const d of deals) {
    if (f.type !== 'all' && d.category !== f.type) continue
    if (cat && (d.categorySlug ?? '').toLowerCase() !== cat) continue
    if (subCat && (d.subCategory ?? '').toLowerCase() !== subCat) continue
    if (f.storage && d.storage !== f.storage) continue
    if (q && !d.productName.toLowerCase().includes(q)) continue
    counts[d.store] = (counts[d.store] ?? 0) + 1
  }
  return counts
}

/**
 * Counts per storage state for the current filter set *minus* the storage filter.
 *
 * Same "list-includes-everything, only counts react" rule as the other facets,
 * so switching from Frozen to Chilled never leaves the user staring at a row
 * that has silently disappeared. Deals with no storage value are counted in no
 * bucket — the retailer did not say, and a guess here would put fresh fish in
 * the ambient aisle.
 */
export function storageCounts(
  deals: Deal[],
  f: DealsFilters,
): Array<{ key: StorageState; count: number }> {
  const q = f.q.trim().toLowerCase()
  const storeSet = new Set<StoreKey>(f.stores)
  const cat = f.category?.toLowerCase() ?? null
  const subCat = f.subCategory?.toLowerCase() ?? null

  const counts = new Map<StorageState, number>()
  for (const s of STORAGE_ORDER) counts.set(s, 0)

  for (const d of deals) {
    if (!d.storage) continue
    if (f.type !== 'all' && d.category !== f.type) continue
    if (cat && (d.categorySlug ?? '').toLowerCase() !== cat) continue
    if (subCat && (d.subCategory ?? '').toLowerCase() !== subCat) continue
    if (!storeSet.has(d.store)) continue
    if (q && !d.productName.toLowerCase().includes(q)) continue
    counts.set(d.storage, (counts.get(d.storage) ?? 0) + 1)
  }

  return STORAGE_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0 }))
}

/**
 * Frozen first: it is the one users come looking for, and the browse tile that
 * ADR-001 describes is a saved filter over exactly this value.
 */
export const STORAGE_ORDER: readonly StorageState[] = ['frozen', 'chilled', 'fresh', 'ambient']

// Patch F: Categories that exist *in the current type filter*, with their counts.
//
// Same "list-includes-everything, only-counts-react" pattern as subCategoryCounts.
// Sort: count desc, alpha asc on ties, zero-count chips at the bottom.
export function categoryCounts(
  deals: Deal[],
  f: DealsFilters,
): Array<{ key: string; count: number }> {
  const q = f.q.trim().toLowerCase()
  const storeSet = new Set<StoreKey>(f.stores)
  const subCat = f.subCategory?.toLowerCase() ?? null

  const counts = new Map<string, number>()
  for (const d of deals) {
    if (f.type !== 'all' && d.category !== f.type) continue
    const key = d.categorySlug?.trim() || ''
    if (!key) continue
    if (!counts.has(key)) counts.set(key, 0)

    if (!storeSet.has(d.store)) continue
    if (subCat && (d.subCategory ?? '').toLowerCase() !== subCat) continue
    if (f.storage && d.storage !== f.storage) continue
    if (q && !d.productName.toLowerCase().includes(q)) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => {
      const aZero = a.count === 0
      const bZero = b.count === 0
      if (aZero !== bZero) return aZero ? 1 : -1
      if (a.count !== b.count) return b.count - a.count
      return a.key.localeCompare(b.key)
    })
}

// Sub-categories that exist *in the current type+category filter*, with their counts.
//
// Per HR7 (spec v2 §1) + v2.1 §D.5 / §E.2, the LIST of sub-categories must include
// every distinct sub-category in the type-filtered universe regardless of
// the active store / search selection — only the COUNTS are filtered. Patch F
// HR16: the list now narrows further to the active Category so users only see
// sub-cats that belong to the currently-selected Category. When no Category
// is selected, fall back to all sub-cats under the active Type.
export function subCategoryCounts(
  deals: Deal[],
  f: DealsFilters,
): Array<{ key: string; count: number }> {
  const q = f.q.trim().toLowerCase()
  const storeSet = new Set<StoreKey>(f.stores)
  const cat = f.category?.toLowerCase() ?? null

  const counts = new Map<string, number>()
  for (const d of deals) {
    if (f.type !== 'all' && d.category !== f.type) continue
    if (cat && (d.categorySlug ?? '').toLowerCase() !== cat) continue
    const key = d.subCategory?.trim() || ''
    if (!key) continue

    if (!counts.has(key)) counts.set(key, 0)

    if (!storeSet.has(d.store)) continue
    if (f.storage && d.storage !== f.storage) continue
    if (q && !d.productName.toLowerCase().includes(q)) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => {
      const aZero = a.count === 0
      const bZero = b.count === 0
      if (aZero !== bZero) return aZero ? 1 : -1
      if (a.count !== b.count) return b.count - a.count
      return a.key.localeCompare(b.key)
    })
}

/**
 * Sub-categories where exactly one tracked store has anything on offer.
 *
 * ⚠️ READ THE SCOPE BEFORE CHANGING THE COPY THAT USES THIS. The claim this
 * supports is "no other store we track has a DAIRY deal this week" — about the
 * sub-category, not about the product.
 *
 * The per-product claim is the one we actually want, and it cannot be made
 * honestly yet: `products` are resolved per store (pipeline/product-resolve.ts
 * filters `.eq('store', store)` and matches on source_name), so the same milk
 * from two retailers is two unrelated product rows. The cross-store identity
 * lives in the `concept` layer, which is not populated — see the comment in
 * server/data/concepts.ts. Matching on product names instead would mark almost
 * every deal "only at", because "M-Classic Vollmilch" and "Coop Naturaplan
 * Milch" never match, and that is exactly the exhaustiveness claim Art. 3(1)(e)
 * UWG forbids.
 *
 * When concepts are populated, swap the grouping key below from `subCategory`
 * to the concept id and tighten the copy. Nothing else has to change.
 *
 * Computed over the WHOLE snapshot, never the filtered view — a deal is not
 * "only at Coop" merely because the visitor deselected the other six stores.
 */
export function onlyStoreSubCategories(deals: Deal[]): Map<string, StoreKey> {
  const storesBySubCategory = new Map<string, Set<StoreKey>>()
  for (const d of deals) {
    const key = d.subCategory?.trim()
    // A deal with no sub-category cannot support the claim in either direction.
    if (!key) continue
    const set = storesBySubCategory.get(key) ?? new Set<StoreKey>()
    set.add(d.store)
    storesBySubCategory.set(key, set)
  }

  const out = new Map<string, StoreKey>()
  for (const [subCategory, stores] of storesBySubCategory) {
    if (stores.size !== 1) continue
    const [only] = stores
    if (only) out.set(subCategory, only)
  }
  return out
}

export type DealsSection = {
  subCategory: string
  primary: Deal
  others: Deal[]
}

// Group filtered deals by sub_category, sort each group by discountPercent
// desc, take the top deal as `primary` and the rest as `others`. Sections
// themselves are sorted by total deal count desc so dense sub-categories
// surface first.
//
// Default `compactLimit = Infinity` — every deal in a sub-cat is reachable.
// The previous default of 4 (1 primary + 4 compacts) hid 246/296 deals on
// the Fresh page (10 sub-cats × 5 visible vs. 30+ deals each in dense ones
// like Dairy). Caller can still pass a smaller cap if a list view ever
// needs a curated subset.
export function buildSections(deals: Deal[], compactLimit = Number.POSITIVE_INFINITY): DealsSection[] {
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
