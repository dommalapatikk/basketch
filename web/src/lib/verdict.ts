// Verdict logic: compares Migros vs Coop deals to determine the winner per category.

import type {
  Category,
  CategoryVerdict,
  DealRow,
  Store,
  WeeklyVerdict,
} from '@shared/types'

import { TIE_THRESHOLD, MIN_DEALS_FOR_VERDICT } from '@shared/types'
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
    grouped.set(cat, new Map([['migros', []], ['coop', []]]))
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
 * Compute verdict for a single category.
 * If either store has fewer than MIN_DEALS_FOR_VERDICT deals,
 * winner is 'tie' with both scores at 0 (insufficient data).
 */
export function computeCategoryVerdict(
  category: Category,
  migrosDeals: DealRow[],
  coopDeals: DealRow[],
): CategoryVerdict {
  const migrosAvg = averageDiscount(migrosDeals)
  const coopAvg = averageDiscount(coopDeals)

  // Insufficient data: need MIN_DEALS_FOR_VERDICT from BOTH stores
  if (migrosDeals.length < MIN_DEALS_FOR_VERDICT || coopDeals.length < MIN_DEALS_FOR_VERDICT) {
    return {
      category,
      winner: 'tie',
      migrosScore: 0,
      coopScore: 0,
      migrosDeals: migrosDeals.length,
      coopDeals: coopDeals.length,
      migrosAvgDiscount: migrosAvg,
      coopAvgDiscount: coopAvg,
    }
  }

  const maxDeals = Math.max(migrosDeals.length, coopDeals.length)
  const maxAvgDiscount = Math.max(migrosAvg, coopAvg)

  const migrosScore = scoreStore(migrosDeals, maxDeals, maxAvgDiscount)
  const coopScore = scoreStore(coopDeals, maxDeals, maxAvgDiscount)

  let winner: Store | 'tie' = 'tie'
  const diff = Math.abs(migrosScore - coopScore)
  const maxScore = Math.max(migrosScore, coopScore)
  const relativeDiff = maxScore > 0 ? diff / maxScore : 0

  if (relativeDiff <= TIE_THRESHOLD) {
    winner = 'tie'
  } else if (migrosScore > coopScore) {
    winner = 'migros'
  } else {
    winner = 'coop'
  }

  return {
    category,
    winner,
    migrosScore,
    coopScore,
    migrosDeals: migrosDeals.length,
    coopDeals: coopDeals.length,
    migrosAvgDiscount: migrosAvg,
    coopAvgDiscount: coopAvg,
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
    return computeCategoryVerdict(
      cat,
      catMap.get('migros')!,
      catMap.get('coop')!,
    )
  })

  // Determine data freshness
  const hasMigros = deals.some((d) => d.store === 'migros')
  const hasCoop = deals.some((d) => d.store === 'coop')
  let dataFreshness: WeeklyVerdict['dataFreshness'] = 'current'
  if (!hasMigros && !hasCoop) {
    dataFreshness = 'stale'
  } else if (!hasMigros || !hasCoop) {
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
