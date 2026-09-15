import { MIN_DEALS_FOR_WINNER, TIE_THRESHOLD_PCT } from '@/lib/category-rules'
import { isMemberOnly } from '@/lib/domain/price-basis'
import { isInEffect } from '@/lib/domain/validity'
import type { StoreKey } from '@/lib/store-tokens'
import type {
  CategoryVerdict,
  CategoryVerdictState,
  Deal,
  DealCategory,
  StoreScore,
} from '@/lib/types'

/**
 * The single "listed but does not vote" rule (CLAUDE.md § DDD; RCA D2).
 *
 * Three independent facts can each disqualify a deal from deciding a category
 * winner or wearing the "Cheapest" tag (server/data/filter-deals.ts), while
 * leaving it fully visible with its own label:
 *
 *   - isUncertain   — the classifier's category guess was not confident (D3)
 *   - member-only    — only Lidl Plus / Supercard / Cumulus members can pay it
 *   - not in effect  — its validity window has not opened, or has closed
 *
 * One predicate, not three separate checks scattered across the two places
 * that need it. `algorithm.ts:21-26` used to encode only the first of these
 * inline; folding all three into a single exported function is what stops the
 * next exception from being wired into the category verdict but forgotten on
 * the "Cheapest" card, or the other way round.
 */
export function votesInVerdict(deal: Deal, today: string): boolean {
  if (deal.isUncertain) return false
  if (isMemberOnly(deal.priceBasis)) return false
  if (!isInEffect(deal, today)) return false
  return true
}

/**
 * Compute the per-store average discount % for a single category.
 * Stores with zero deals in this category are omitted from the result.
 */
export function scoreStoresForCategory(
  deals: Deal[],
  category: DealCategory,
  today: string,
): StoreScore[] {
  const byStore = new Map<StoreKey, { sum: number; count: number }>()
  for (const d of deals) {
    if (!votesInVerdict(d, today)) continue
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

export function computeAllVerdicts(
  deals: Deal[],
  categories: DealCategory[],
  today: string,
): CategoryVerdict[] {
  return categories.map((cat) =>
    computeCategoryVerdict(cat, scoreStoresForCategory(deals, cat, today)),
  )
}
