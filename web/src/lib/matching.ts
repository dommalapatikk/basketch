// Matching logic: pairs each favorite item with best Migros and Coop deals.

import type {
  Category,
  DealComparison,
  DealComparisonResult,
  DealRow,
  FavoriteComparison,
  FavoriteItemRow,
  ProductGroupRow,
  ProductRow,
  RegularPrice,
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

/**
 * Suffixes that change a product's fundamental form.
 * "tomatenpüree" is NOT "tomaten" — the suffix "püree" changes the product.
 * "milchschokolade" is NOT "milch" — the suffix "schokolade" changes the product.
 * "kartoffelstock" is NOT "kartoffel" — the suffix "stock" changes the product.
 */
const FORM_CHANGING_SUFFIXES = new Set([
  'püree', 'puree', 'sauce', 'mark', 'sugo', 'stock', 'konzentrat', 'paste',
  'gratin', 'cubes', 'nuggets', 'frites', 'chips', 'wedges', 'kroketten',
  'schokolade', 'branche', 'drink', 'pudding', 'eis', 'glacé', 'glace',
  'ketchup', 'senf', 'essig', 'sirup',
])

/**
 * Check if a word is a compound where the suffix changes the product form.
 * Returns true if kw starts the word but the remainder is a form-changing suffix.
 */
function isFormChangingCompound(kw: string, word: string): boolean {
  if (!word.startsWith(kw) || word.length <= kw.length) return false
  const suffix = word.slice(kw.length)
  return FORM_CHANGING_SUFFIXES.has(suffix)
}

export function matchRelevance(keyword: string, productName: string): number {
  const kw = keyword.toLowerCase()
  const name = productName.toLowerCase()
  const words = name.split(/[\s·,]+/).filter(Boolean)

  // Early reject: if keyword starts a compound word but suffix changes the product form,
  // this is NOT the same product (e.g., "tomatenpüree" is not "tomaten")
  if (words.some((w) => isFormChangingCompound(kw, w))) return 0

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
 * When deals exist, compare by discount/price.
 * When no deals exist, compare regular (shelf) prices.
 */
export function getRecommendation(
  migrosDeal: DealRow | null,
  coopDeal: DealRow | null,
  migrosRegularPrice?: RegularPrice | null,
  coopRegularPrice?: RegularPrice | null,
): FavoriteComparison['recommendation'] {
  // If both stores have deals, compare deals
  if (migrosDeal && coopDeal) {
    const migrosDiscount = migrosDeal.discount_percent ?? 0
    const coopDiscount = coopDeal.discount_percent ?? 0

    if (migrosDiscount === coopDiscount) {
      if (migrosDeal.sale_price < coopDeal.sale_price) return 'migros'
      if (coopDeal.sale_price < migrosDeal.sale_price) return 'coop'
      return 'both'
    }

    return migrosDiscount > coopDiscount ? 'migros' : 'coop'
  }

  // One store has a deal, the other doesn't
  if (migrosDeal && !coopDeal) return 'migros'
  if (!migrosDeal && coopDeal) return 'coop'

  // No deals — compare regular prices if available
  if (migrosRegularPrice && coopRegularPrice) {
    if (migrosRegularPrice.price < coopRegularPrice.price) return 'migros'
    if (coopRegularPrice.price < migrosRegularPrice.price) return 'coop'
    return 'both'
  }
  if (migrosRegularPrice) return 'migros'
  if (coopRegularPrice) return 'coop'

  return 'none'
}

/**
 * Find the cheapest regular (shelf) price for a product group at a given store.
 * Only considers products that have a regular_price set.
 */
export function findRegularPrice(
  productGroupId: string,
  store: 'migros' | 'coop',
  products: ProductRow[],
): RegularPrice | null {
  const candidates = products.filter(
    (p) => p.product_group === productGroupId && p.store === store && p.regular_price != null,
  )

  if (candidates.length === 0) return null

  // Pick cheapest
  candidates.sort((a, b) => (a.regular_price ?? Infinity) - (b.regular_price ?? Infinity))
  const cheapest = candidates[0]!

  return {
    productName: cheapest.source_name,
    price: cheapest.regular_price!,
    store,
  }
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

    // Look up regular prices when product group is available
    let migrosRegularPrice: RegularPrice | null = null
    let coopRegularPrice: RegularPrice | null = null

    if (fav.product_group_id && products && products.length > 0) {
      migrosRegularPrice = findRegularPrice(fav.product_group_id, 'migros', products)
      coopRegularPrice = findRegularPrice(fav.product_group_id, 'coop', products)
    }

    const recommendation = getRecommendation(migrosDeal, coopDeal, migrosRegularPrice, coopRegularPrice)

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
      migrosRegularPrice,
      coopRegularPrice,
      recommendation,
    }
  })
}

/**
 * Build side-by-side deal comparisons across Migros and Coop.
 *
 * Two-tier matching:
 * - Tier 1: Match deals via product_group. For each group with deals at BOTH
 *   stores, pick the best deal per store (highest discount_percent).
 * - Tier 2: For remaining unmatched deals, use matchRelevance() to find
 *   name-similar deals across stores. Threshold: relevance >= 3.
 *
 * Recommendation: compare sale_price — lower wins. If equal, 'both'.
 */
export function buildDealComparisons(
  deals: DealRow[],
  products: ProductRow[],
  productGroups: ProductGroupRow[],
): DealComparisonResult {
  const migrosDeals = deals.filter((d) => d.store === 'migros')
  const coopDeals = deals.filter((d) => d.store === 'coop')

  // Build product_id -> product_group lookup
  const productToGroup = new Map<string, string>()
  for (const p of products) {
    if (p.product_group) {
      productToGroup.set(p.id, p.product_group)
    }
  }

  // Build product_group label lookup
  const groupLabelMap = new Map<string, ProductGroupRow>()
  for (const g of productGroups) {
    groupLabelMap.set(g.id, g)
  }

  // Tier 1: Group deals by product_group
  const migrosGroupDeals = new Map<string, DealRow[]>()
  const coopGroupDeals = new Map<string, DealRow[]>()
  const matchedDealIds = new Set<string>()

  for (const deal of migrosDeals) {
    if (!deal.product_id) continue
    const groupId = productToGroup.get(deal.product_id)
    if (!groupId) continue
    const arr = migrosGroupDeals.get(groupId) ?? []
    arr.push(deal)
    migrosGroupDeals.set(groupId, arr)
  }

  for (const deal of coopDeals) {
    if (!deal.product_id) continue
    const groupId = productToGroup.get(deal.product_id)
    if (!groupId) continue
    const arr = coopGroupDeals.get(groupId) ?? []
    arr.push(deal)
    coopGroupDeals.set(groupId, arr)
  }

  // Find groups with deals at BOTH stores
  const matched: DealComparison[] = []
  const allGroupIds = new Set([...migrosGroupDeals.keys(), ...coopGroupDeals.keys()])

  for (const groupId of allGroupIds) {
    const mDeals = migrosGroupDeals.get(groupId)
    const cDeals = coopGroupDeals.get(groupId)
    if (!mDeals || !cDeals) continue

    // Pick best deal per store (highest discount)
    const bestMigros = [...mDeals].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))[0]!
    const bestCoop = [...cDeals].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))[0]!

    const group = groupLabelMap.get(groupId)
    const label = group?.label ?? bestMigros.product_name
    const category: Category | null = group?.category ?? bestMigros.category ?? null

    let recommendation: DealComparison['recommendation'] = 'both'
    if (bestMigros.sale_price < bestCoop.sale_price) recommendation = 'migros'
    else if (bestCoop.sale_price < bestMigros.sale_price) recommendation = 'coop'

    matched.push({
      id: `pg-${groupId}`,
      label,
      matchType: 'product-group',
      category,
      migrosDeal: bestMigros,
      coopDeal: bestCoop,
      recommendation,
    })

    // Mark these deals as matched
    for (const d of mDeals) matchedDealIds.add(d.id)
    for (const d of cDeals) matchedDealIds.add(d.id)
  }

  // Tier 2: Name-similarity matching for remaining unmatched deals
  const unmatchedMigros = migrosDeals.filter((d) => !matchedDealIds.has(d.id))
  const unmatchedCoop = coopDeals.filter((d) => !matchedDealIds.has(d.id))

  const tier2MatchedMigrosIds = new Set<string>()
  const tier2MatchedCoopIds = new Set<string>()

  for (const mDeal of unmatchedMigros) {
    if (tier2MatchedMigrosIds.has(mDeal.id)) continue

    let bestMatch: DealRow | null = null
    let bestRelevance = 0

    for (const cDeal of unmatchedCoop) {
      if (tier2MatchedCoopIds.has(cDeal.id)) continue

      // Check both directions for name similarity
      const r1 = matchRelevance(mDeal.product_name, cDeal.product_name)
      const r2 = matchRelevance(cDeal.product_name, mDeal.product_name)
      const relevance = Math.max(r1, r2)

      if (relevance >= 3 && relevance > bestRelevance) {
        bestRelevance = relevance
        bestMatch = cDeal
      }
    }

    if (bestMatch) {
      tier2MatchedMigrosIds.add(mDeal.id)
      tier2MatchedCoopIds.add(bestMatch.id)

      // Use shorter name as label
      const label = mDeal.product_name.length <= bestMatch.product_name.length
        ? mDeal.product_name
        : bestMatch.product_name

      let recommendation: DealComparison['recommendation'] = 'both'
      if (mDeal.sale_price < bestMatch.sale_price) recommendation = 'migros'
      else if (bestMatch.sale_price < mDeal.sale_price) recommendation = 'coop'

      matched.push({
        id: `ns-${mDeal.id}-${bestMatch.id}`,
        label,
        matchType: 'name-similarity',
        category: mDeal.category ?? null,
        migrosDeal: mDeal,
        coopDeal: bestMatch,
        recommendation,
      })
    }
  }

  // Sort matched: product-group first, then by best discount
  matched.sort((a, b) => {
    if (a.matchType !== b.matchType) {
      return a.matchType === 'product-group' ? -1 : 1
    }
    const aDiscount = Math.max(
      a.migrosDeal?.discount_percent ?? 0,
      a.coopDeal?.discount_percent ?? 0,
    )
    const bDiscount = Math.max(
      b.migrosDeal?.discount_percent ?? 0,
      b.coopDeal?.discount_percent ?? 0,
    )
    return bDiscount - aDiscount
  })

  // Final unmatched
  const finalUnmatchedMigros = unmatchedMigros.filter((d) => !tier2MatchedMigrosIds.has(d.id))
  const finalUnmatchedCoop = unmatchedCoop.filter((d) => !tier2MatchedCoopIds.has(d.id))

  return {
    matched,
    unmatchedMigros: finalUnmatchedMigros,
    unmatchedCoop: finalUnmatchedCoop,
  }
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
