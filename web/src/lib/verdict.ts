// Verdict logic: compares deals across all stores to determine the winner per category.

import type {
  Category,
  CategoryVerdict,
  DealRow,
  Store,
  WeeklyVerdict,
} from '@shared/types'

import { ALL_STORES, TIE_THRESHOLD, MIN_DEALS_FOR_VERDICT } from '@shared/types'
import { VERDICT_WEIGHTS } from '@shared/category-rules'

const ALL_CATEGORIES: Category[] = ['fresh', 'long-life', 'non-food']

/**
 * Group deals by category, then by store.
 */
function groupDeals(
  deals: DealRow[],
): Map<Category, Map<Store, DealRow[]>> {
  const grouped = new Map<Category, Map<Store, DealRow[]>>()

  for (const cat of ALL_CATEGORIES) {
    const storeMap = new Map<Store, DealRow[]>()
    for (const store of ALL_STORES) {
      storeMap.set(store, [])
    }
    grouped.set(cat, storeMap)
  }

  for (const deal of deals) {
    const catMap = grouped.get(deal.category)
    if (!catMap) continue
    const storeDeals = catMap.get(deal.store)
    if (storeDeals) {
      storeDeals.push(deal)
    }
  }

  return grouped
}

/**
 * Calculate average discount for a list of deals.
 */
export function averageDiscount(deals: DealRow[]): number {
  if (deals.length === 0) return 0
  const total = deals.reduce((sum, d) => sum + (d.discount_percent ?? 0), 0)
  return Math.round(total / deals.length)
}

/**
 * Score a store's deals within a category (0-100 scale).
 * Weighted combination of deal count and average discount.
 * Formula: 40% deal count + 60% avg discount depth.
 */
export function scoreStore(
  storeDeals: DealRow[],
  maxDeals: number,
  maxAvgDiscount: number,
): number {
  if (storeDeals.length === 0) return 0

  const dealCountNorm = maxDeals > 0
    ? storeDeals.length / maxDeals
    : 0

  const avgDisc = averageDiscount(storeDeals)
  const avgDiscNorm = maxAvgDiscount > 0
    ? avgDisc / maxAvgDiscount
    : 0

  const raw =
    VERDICT_WEIGHTS.dealCount * dealCountNorm +
    VERDICT_WEIGHTS.avgDiscount * avgDiscNorm

  return Math.round(raw * 100)
}

/**
 * Compute verdict for a single category across all stores.
 * Stores with fewer than MIN_DEALS_FOR_VERDICT deals are excluded from scoring.
 * winner is 'tie' if no store has enough data or scores are within TIE_THRESHOLD.
 */
export function computeCategoryVerdict(
  category: Category,
  dealsByStore: Map<Store, DealRow[]>,
): CategoryVerdict {
  const dealCounts: Partial<Record<Store, number>> = {}
  const avgDiscounts: Partial<Record<Store, number>> = {}

  // Collect counts and averages for all stores
  for (const store of ALL_STORES) {
    const storeDeals = dealsByStore.get(store) ?? []
    if (storeDeals.length > 0) {
      dealCounts[store] = storeDeals.length
      avgDiscounts[store] = averageDiscount(storeDeals)
    }
  }

  // Only score stores with enough deals
  const eligibleStores = ALL_STORES.filter(
    (s) => (dealCounts[s] ?? 0) >= MIN_DEALS_FOR_VERDICT,
  )

  if (eligibleStores.length < 2) {
    // Not enough data across stores — return tie with 0 scores
    return {
      category,
      winner: 'tie',
      scores: {},
      dealCounts,
      avgDiscounts,
    }
  }

  // Compute scores relative to the max across eligible stores
  const maxDeals = Math.max(...eligibleStores.map((s) => dealCounts[s] ?? 0))
  const maxAvgDiscount = Math.max(...eligibleStores.map((s) => avgDiscounts[s] ?? 0))

  const scores: Partial<Record<Store, number>> = {}
  for (const store of eligibleStores) {
    const storeDeals = dealsByStore.get(store) ?? []
    scores[store] = scoreStore(storeDeals, maxDeals, maxAvgDiscount)
  }

  // Determine winner: store with highest score, subject to tie threshold
  let winner: Store | 'tie' = 'tie'
  let highestScore = -1
  let highestStore: Store | null = null

  for (const store of eligibleStores) {
    const score = scores[store] ?? 0
    if (score > highestScore) {
      highestScore = score
      highestStore = store
    }
  }

  if (highestStore !== null) {
    // Check if any other store is within tie threshold of the leader
    const isTie = eligibleStores.some((store) => {
      if (store === highestStore) return false
      const score = scores[store] ?? 0
      const diff = Math.abs(highestScore - score)
      const relativeDiff = highestScore > 0 ? diff / highestScore : 0
      return relativeDiff <= TIE_THRESHOLD
    })

    winner = isTie ? 'tie' : highestStore
  }

  return {
    category,
    winner,
    scores,
    dealCounts,
    avgDiscounts,
  }
}

/**
 * Compute the full weekly verdict from all active deals.
 */
export function computeWeeklyVerdict(
  deals: DealRow[],
  weekOf: string,
): WeeklyVerdict {
  const grouped = groupDeals(deals)

  const categories: CategoryVerdict[] = ALL_CATEGORIES.map((cat) => {
    const catMap = grouped.get(cat)!
    return computeCategoryVerdict(cat, catMap)
  })

  // Determine data freshness — check which stores have data
  const storesWithData = new Set(deals.map((d) => d.store))
  let dataFreshness: WeeklyVerdict['dataFreshness'] = 'current'
  if (storesWithData.size === 0) {
    dataFreshness = 'stale'
  } else if (storesWithData.size < ALL_STORES.length) {
    dataFreshness = 'partial'
  }

  return {
    weekOf,
    categories,
    dataFreshness,
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Calculate the overall verdict across all categories.
 * Convenience wrapper used by components.
 */
export function calculateVerdict(deals: DealRow[]): WeeklyVerdict {
  const now = new Date()
  // Find the most recent Thursday (deals week start)
  const day = now.getDay()
  const diff = (day + 3) % 7 // days since last Thursday
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - diff)
  const weekOf = thursday.toISOString().slice(0, 10)

  return computeWeeklyVerdict(deals, weekOf)
}
