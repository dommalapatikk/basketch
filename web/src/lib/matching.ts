// Matching logic: pairs each favorite item with best Migros and Coop deals.

import type {
  DealRow,
  FavoriteComparison,
  FavoriteItemRow,
  ProductRow,
} from '@shared/types'

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
  const pattern = new RegExp(`${escapeRegex(keyword)}(?=[\\s\\d,.)·;!?]|$)`, 'i')
  return pattern.test(productName)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if a product name contains any of the exclude terms.
 * Used to filter out false positives (e.g., "milch" should not match chocolate).
 */
export function isExcluded(
  productName: string,
  excludeTerms: string[] | null | undefined,
): boolean {
  if (!excludeTerms || excludeTerms.length === 0) return false
  const name = productName.toLowerCase()
  return excludeTerms.some((term) => name.includes(term.toLowerCase()))
}

/**
 * Check if a product name contains any of the prefer terms.
 * Used to boost relevance for expected product forms.
 */
export function isPreferred(
  productName: string,
  preferTerms: string[] | null | undefined,
): boolean {
  if (!preferTerms || preferTerms.length === 0) return false
  const name = productName.toLowerCase()
  return preferTerms.some((term) => name.includes(term.toLowerCase()))
}

/**
 * Score how relevant a keyword match is to a product name.
 * Higher = more relevant. Prioritizes products where the keyword
 * is the main subject, not a modifier in a compound or multi-word name.
 *
 * Scoring:
 * - 5: keyword match + product name is short (≤4 words) = likely the actual product
 * - 4: keyword is one of the first 2 words ("milch 1l", "bio milch 1l")
 * - 3: keyword is a standalone word later in the name ("schokolade milch nuss")
 * - 2: keyword is end of a compound word ("vollmilch 1l")
 * - 1: keyword appears as substring only (fallback)
 */
const QUALIFIERS = new Set(['bio', 'naturaplan', 'prix', 'garantie', 'm-budget', 'm-classic', 'coop', 'migros', 'aha!', 'free', 'from', 'optigal'])

export function matchRelevance(keyword: string, productName: string): number {
  const kw = keyword.toLowerCase()
  const name = productName.toLowerCase()
  const words = name.split(/[\s·,]+/).filter(Boolean)

  // Check if keyword is the first word or part of the first word
  // "milch 1l" → first word IS milch → 4
  // "vollmilch 1l" → first word ENDS with milch → 4
  // "pouletbrust" → first word STARTS with poulet → 4
  // "bio milch 1l" → second word IS milch and first word is a qualifier → 4
  const firstWord = words[0] ?? ''
  if (firstWord === kw || firstWord.endsWith(kw) || firstWord.startsWith(kw)) return 4

  // Check if keyword is second word AND first word is a common qualifier
  const secondWord = words[1] ?? ''
  if ((secondWord === kw || secondWord.endsWith(kw) || secondWord.startsWith(kw)) && QUALIFIERS.has(firstWord)) return 4

  // Check if keyword is a standalone word anywhere
  const standalonePattern = new RegExp(`(^|\\s)${escapeRegex(kw)}(\\s|\\d|$)`, 'i')
  if (standalonePattern.test(name)) return 3

  // Check if keyword is at end of a compound word (e.g., "vollmilch")
  if (keywordMatches(kw, name)) return 2

  // Check if keyword is at start of a compound word (e.g., "pouletbrust", "milchdrink")
  if (words.some((w) => w.startsWith(kw) && w.length > kw.length)) return 2

  // Substring match (e.g., "milch" in "milchschokolade")
  if (name.includes(kw)) return 1

  return 0
}

/**
 * Find the best deal matching a keyword for a given store.
 * Uses relevance-weighted scoring: products where the keyword is the
 * main subject rank higher than products where it's a modifier.
 * Among equally relevant matches, picks the highest discount.
 *
 * Supports exclude/prefer terms to filter out false positives and
 * boost expected product forms.
 */
export function findBestMatch(
  keyword: string,
  storeDeals: DealRow[],
  options?: {
    excludeTerms?: string[] | null
    preferTerms?: string[] | null
  },
): DealRow | null {
  const normalized = keyword.toLowerCase().trim()
  if (!normalized) return null

  // Score all deals by relevance, excluding 0% discount (not real deals)
  // and applying exclude terms to filter false positives
  const scored = storeDeals
    .filter((d) => (d.discount_percent ?? 0) > 0)
    .filter((d) => !isExcluded(d.product_name, options?.excludeTerms))
    .map((d) => {
      const relevance = matchRelevance(normalized, d.product_name)
      const words = d.product_name.toLowerCase().split(/[\s·,]+/).filter(Boolean)
      const preferred = isPreferred(d.product_name, options?.preferTerms)

      return {
        deal: d,
        relevance,
        // Bonus: short product names where keyword is the main subject
        // "milch 1l" (2 words, relevance 4) → more likely to BE milk
        // "tafelschokolade milch & nuss 12x100g" (5 words, relevance 3) → not milk
        shortNameBonus: (relevance >= 3 && words.length <= 4) ? 1 : 0,
        preferBonus: preferred ? 1 : 0,
      }
    })
    .filter((s) => s.relevance >= 2)

  if (scored.length === 0) return null

  // Sort: prefer bonus → short name bonus → relevance → discount
  scored.sort((a, b) => {
    if (a.preferBonus !== b.preferBonus) return b.preferBonus - a.preferBonus
    const aScore = a.relevance + a.shortNameBonus
    const bScore = b.relevance + b.shortNameBonus
    if (aScore !== bScore) return bScore - aScore
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
 * Find the best deal for a product group at a given store.
 * Matches deals by product_id — deals must have a product_id that
 * maps to a product in the given product group.
 */
export function findBestMatchByProductGroup(
  productGroupId: string,
  storeDeals: DealRow[],
  products: ProductRow[],
): DealRow | null {
  // Find all product IDs in this group for this store's deals
  const groupProductIds = new Set(
    products
      .filter((p) => p.product_group === productGroupId)
      .map((p) => p.id),
  )

  if (groupProductIds.size === 0) return null

  // Find deals that reference products in this group
  const matched = storeDeals
    .filter((d) => d.product_id != null && groupProductIds.has(d.product_id))
    .filter((d) => (d.discount_percent ?? 0) > 0)

  if (matched.length === 0) return null

  // Best deal = highest discount
  matched.sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))
  return matched[0]!
}

/**
 * Match all favorite items against active deals and produce comparisons.
 * This is the core function that powers the split shopping list.
 *
 * Two matching paths:
 * 1. Product group path: if favorite has product_group_id, match by product group (exact)
 * 2. Keyword path: fallback for favorites without product_group_id (fuzzy)
 *
 * Rule: if product_group_id is set, ONLY use product group matching.
 * No fallback to keyword — if no deals exist in the group, show "no deals."
 */
export function matchFavorites(
  favorites: FavoriteItemRow[],
  deals: DealRow[],
  products?: ProductRow[],
): FavoriteComparison[] {
  const migrosDeals = deals.filter((d) => d.store === 'migros')
  const coopDeals = deals.filter((d) => d.store === 'coop')

  return favorites.map((fav) => {
    let migrosDeal: DealRow | null = null
    let coopDeal: DealRow | null = null

    if (fav.product_group_id) {
      // Product group matching — exact, no fallback.
      // If products data is unavailable, result is "no deals" (never fall back to keyword).
      if (products && products.length > 0) {
        migrosDeal = findBestMatchByProductGroup(fav.product_group_id, migrosDeals, products)
        coopDeal = findBestMatchByProductGroup(fav.product_group_id, coopDeals, products)
      }
    } else {
      // Keyword matching — for favorites without a product group
      const matchOptions = {
        excludeTerms: fav.exclude_terms,
        preferTerms: fav.prefer_terms,
      }
      migrosDeal = findBestMatch(fav.keyword, migrosDeals, matchOptions)
      coopDeal = findBestMatch(fav.keyword, coopDeals, matchOptions)
    }

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
