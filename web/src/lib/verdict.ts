// Verdict logic: compares Migros vs Coop deals to determine the winner per category.

import type {
  Category,
  CategoryVerdict,
  DealRow,
  Store,
  WeeklyVerdict,
} from '../../../shared/types'

import { TIE_THRESHOLD, VERDICT_WEIGHTS } from '../../../shared/category-rules'

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
 */
export function computeCategoryVerdict(
  category: Category,
  migrosDeals: DealRow[],
  coopDeals: DealRow[],
): CategoryVerdict {
  const maxDeals = Math.max(migrosDeals.length, coopDeals.length)
  const migrosAvg = averageDiscount(migrosDeals)
  const coopAvg = averageDiscount(coopDeals)
  const maxAvgDiscount = Math.max(migrosAvg, coopAvg)

  const migrosScore = scoreStore(migrosDeals, maxDeals, maxAvgDiscount)
  const coopScore = scoreStore(coopDeals, maxDeals, maxAvgDiscount)

  let winner: Store | 'tie' = 'tie'
  if (Math.abs(migrosScore - coopScore) <= TIE_THRESHOLD) {
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
