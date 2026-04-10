// Matching logic: pairs each favorite item with best Migros and Coop deals.

import type {
  DealRow,
  FavoriteComparison,
  FavoriteItemRow,
} from '../../../shared/types'

/**
 * Check if keyword matches a product name with word-boundary awareness.
 * For German compound words: "milch" matches "vollmilch" (ends with keyword)
 * but NOT "milchschokolade" (keyword at the start of a longer compound).
 * Falls back to substring match if no word-boundary match is found.
 */
export function keywordMatches(keyword: string, productName: string): boolean {
  // Exact word or end-of-compound match (e.g., "milch" matches "vollmilch 1l")
  // Pattern: keyword appears at word boundary or end of a compound word,
  // followed by space, digit, end-of-string, or common suffixes
  const pattern = new RegExp(`${escapeRegex(keyword)}(?=[\\s\\d]|$)`, 'i')
  return pattern.test(productName)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find the best deal matching a keyword for a given store.
 * Uses word-boundary-aware matching to reduce false positives.
 * Returns the deal with the highest discount.
 */
export function findBestMatch(
  keyword: string,
  storeDeals: DealRow[],
): DealRow | null {
  const normalized = keyword.toLowerCase().trim()
  if (!normalized) return null

  // Try word-boundary matching first
  let matches = storeDeals.filter((d) =>
    keywordMatches(normalized, d.product_name.toLowerCase()),
  )

  // Fall back to substring if no boundary match (better to over-match than miss)
  if (matches.length === 0) {
    matches = storeDeals.filter((d) =>
      d.product_name.toLowerCase().includes(normalized),
    )
  }

  if (matches.length === 0) return null

  return matches.reduce((best, d) =>
    (d.discount_percent ?? 0) > (best.discount_percent ?? 0) ? d : best,
  )
}

/**
 * Determine recommendation for a single favorite comparison.
 */
export function getRecommendation(
  migrosDeal: DealRow | null,
  coopDeal: DealRow | null,
): FavoriteComparison['recommendation'] {
  if (!migrosDeal && !coopDeal) return 'none'
  if (!migrosDeal) return 'coop'
  if (!coopDeal) return 'migros'

  const migrosDiscount = migrosDeal.discount_percent ?? 0
  const coopDiscount = coopDeal.discount_percent ?? 0

  // Compare sale prices when discounts are equal
  if (migrosDiscount === coopDiscount) {
    if (migrosDeal.sale_price < coopDeal.sale_price) return 'migros'
    if (coopDeal.sale_price < migrosDeal.sale_price) return 'coop'
    return 'both'
  }

  return migrosDiscount > coopDiscount ? 'migros' : 'coop'
}

/**
 * Match all favorite items against active deals and produce comparisons.
 * This is the core function that powers the split shopping list.
 */
export function matchFavorites(
  favorites: FavoriteItemRow[],
  deals: DealRow[],
): FavoriteComparison[] {
  const migrosDeals = deals.filter((d) => d.store === 'migros')
  const coopDeals = deals.filter((d) => d.store === 'coop')

  return favorites.map((fav) => {
    const migrosDeal = findBestMatch(fav.keyword, migrosDeals)
    const coopDeal = findBestMatch(fav.keyword, coopDeals)
    const recommendation = getRecommendation(migrosDeal, coopDeal)

    return {
      favorite: {
        id: fav.id,
        favoriteId: fav.favorite_id,
        keyword: fav.keyword,
        label: fav.label,
        category: fav.category,
        createdAt: fav.created_at,
      },
      migrosDeal,
      coopDeal,
      recommendation,
    }
  })
}

/**
 * Split comparisons into two shopping lists: what to buy at Migros vs Coop.
 */
export function splitShoppingList(comparisons: FavoriteComparison[]): {
  migros: FavoriteComparison[]
  coop: FavoriteComparison[]
  either: FavoriteComparison[]
  noDeals: FavoriteComparison[]
} {
  const migros: FavoriteComparison[] = []
  const coop: FavoriteComparison[] = []
  const either: FavoriteComparison[] = []
  const noDeals: FavoriteComparison[] = []

  for (const comp of comparisons) {
    switch (comp.recommendation) {
      case 'migros':
        migros.push(comp)
        break
      case 'coop':
        coop.push(comp)
        break
      case 'both':
        either.push(comp)
        break
      case 'none':
        noDeals.push(comp)
        break
    }
  }

  return { migros, coop, either, noDeals }
}
