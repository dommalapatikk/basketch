import { MIN_DEALS_FOR_WINNER, TIE_THRESHOLD_PCT } from '@/lib/category-rules'
import type { StoreKey } from '@/lib/store-tokens'
import type {
  CategoryVerdict,
  CategoryVerdictState,
  Deal,
  DealCategory,
  StoreScore,
} from '@/lib/types'

/**
 * Compute the per-store average discount % for a single category.
 * Stores with zero deals in this category are omitted from the result.
 */
export function scoreStoresForCategory(
  deals: Deal[],
  category: DealCategory,
): StoreScore[] {
  const byStore = new Map<StoreKey, { sum: number; count: number }>()
  for (const d of deals) {
    if (d.category !== category) continue
    const acc = byStore.get(d.store) ?? { sum: 0, count: 0 }
    acc.sum += d.discountPercent
    acc.count += 1
    byStore.set(d.store, acc)
  }
  const scores: StoreScore[] = []
  for (const [store, { sum, count }] of byStore) {
    scores.push({ store, dealCount: count, avgDiscountPct: count === 0 ? 0 : sum / count })
  }
  // Sort descending by avg, stable on dealCount as a tiebreaker (more data = more trust).
  scores.sort((a, b) => b.avgDiscountPct - a.avgDiscountPct || b.dealCount - a.dealCount)
  return scores
}

/**
 * Determine the verdict for one category given pre-computed store scores.
 *
 * State transitions:
 *   - no-data       → no eligible deals at all
 *   - single-store  → only one store has any deals in this category
 *   - tied          → top 2 stores within TIE_THRESHOLD_PCT, OR top store has < MIN_DEALS_FOR_WINNER
 *   - winner        → top store beats #2 by ≥ TIE_THRESHOLD_PCT and has ≥ MIN_DEALS_FOR_WINNER deals
 */
export function computeCategoryVerdict(
  category: DealCategory,
  scores: StoreScore[],
): CategoryVerdict {
  const totalDeals = scores.reduce((sum, s) => sum + s.dealCount, 0)
  const avgAcrossAll =
    totalDeals === 0
      ? 0
      : scores.reduce((sum, s) => sum + s.avgDiscountPct * s.dealCount, 0) / totalDeals

  let state: CategoryVerdictState
  let winner: StoreKey | null

  if (scores.length === 0) {
    state = 'no-data'
    winner = null
  } else if (scores.length === 1) {
    state = 'single-store'
    winner = null
  } else {
    const top = scores[0]!
    const runnerUp = scores[1]!
    const lead = top.avgDiscountPct - runnerUp.avgDiscountPct
    if (top.dealCount < MIN_DEALS_FOR_WINNER || lead < TIE_THRESHOLD_PCT) {
      state = 'tied'
      winner = null
    } else {
      state = 'winner'
      winner = top.store
    }
  }

  return {
    category,
    state,
    winner,
    avgDiscountPct: Number(avgAcrossAll.toFixed(2)),
    dealCount: totalDeals,
    storeScores: scores,
  }
}

export function computeAllVerdicts(deals: Deal[], categories: DealCategory[]): CategoryVerdict[] {
  return categories.map((cat) => computeCategoryVerdict(cat, scoreStoresForCategory(deals, cat)))
}
