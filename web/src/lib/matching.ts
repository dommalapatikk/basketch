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
 * Score how relevant a keyword match is to a product name.
 * Higher = more relevant. Prioritizes products where the keyword
 * is the main subject, not a modifier in a compound or multi-word name.
 *
 * Scoring:
 * - 4: keyword is one of the first 2 words ("milch 1l", "bio milch 1l")
 * - 3: keyword is a standalone word later in the name ("schokolade milch nuss")
 * - 2: keyword is end of a compound word ("vollmilch 1l")
 * - 1: keyword appears as substring only (fallback)
 */
export function matchRelevance(keyword: string, productName: string): number {
  const kw = keyword.toLowerCase()
  const name = productName.toLowerCase()
  const words = name.split(/[\s·,]+/).filter(Boolean)

  // Check if keyword is the first word or part of the first word
  // "milch 1l" → first word IS milch → 4
  // "vollmilch 1l" → first word ENDS with milch → 4
  // "bio milch 1l" → second word IS milch and first word is a qualifier → 4
  const firstWord = words[0] ?? ''
  if (firstWord === kw || firstWord.endsWith(kw)) return 4

  // Check if keyword is second word AND first word is a common qualifier
  const qualifiers = new Set(['bio', 'naturaplan', 'prix', 'garantie', 'm-budget', 'coop', 'migros', 'aha!', 'free', 'from'])
  const secondWord = words[1] ?? ''
  if ((secondWord === kw || secondWord.endsWith(kw)) && qualifiers.has(firstWord)) return 4

  // Check if keyword is a standalone word anywhere
  const standalonePattern = new RegExp(`(^|\\s)${escapeRegex(kw)}(\\s|\\d|$)`, 'i')
  if (standalonePattern.test(name)) return 3

  // Check if keyword is at end of a compound word (e.g., "vollmilch")
  if (keywordMatches(kw, name)) return 2

  // Substring match (e.g., "milch" in "milchschokolade")
  if (name.includes(kw)) return 1

  return 0
}

/**
 * Find the best deal matching a keyword for a given store.
 * Uses relevance-weighted scoring: products where the keyword is the
 * main subject rank higher than products where it's a modifier.
 * Among equally relevant matches, picks the highest discount.
 */
export function findBestMatch(
  keyword: string,
  storeDeals: DealRow[],
): DealRow | null {
  const normalized = keyword.toLowerCase().trim()
  if (!normalized) return null

  // Score all deals by relevance, excluding 0% discount (not real deals)
  const scored = storeDeals
    .filter((d) => (d.discount_percent ?? 0) > 0)
    .map((d) => ({
      deal: d,
      relevance: matchRelevance(normalized, d.product_name),
    }))
    .filter((s) => s.relevance >= 2)

  if (scored.length === 0) return null

  // Sort by relevance first (higher = better), then by discount (higher = better)
  scored.sort((a, b) => {
    if (a.relevance !== b.relevance) return b.relevance - a.relevance
    return (b.deal.discount_percent ?? 0) - (a.deal.discount_percent ?? 0)
  })

  return scored[0]!.deal
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
