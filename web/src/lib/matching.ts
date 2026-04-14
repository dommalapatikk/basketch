// Matching logic: pairs each favorite item with best deals across all stores.

import type {
  BasketItem,
  Category,
  DealComparison,
  DealComparisonResult,
  DealRow,
  FavoriteComparison,
  FavoriteItemRow,
  ProductGroupRow,
  ProductRow,
  RegularPrice,
  Store,
  StoreMatch,
} from '@shared/types'
import { ALL_STORES } from '@shared/types'

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
 * Find the cheapest regular (shelf) price for a product group at a given store.
 * Only considers products that have a regular_price set.
 */
export function findRegularPrice(
  productGroupId: string,
  store: Store,
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
    productId: cheapest.id,
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
 * Normalize a FavoriteItemRow (snake_case) to BasketItem (camelCase).
 */
function toBasketItem(row: FavoriteItemRow): BasketItem {
  return {
    id: row.id,
    basketId: row.favorite_id,
    keyword: row.keyword,
    label: row.label,
    category: row.category,
    excludeTerms: row.exclude_terms,
    preferTerms: row.prefer_terms,
    productGroupId: row.product_group_id,
    createdAt: row.created_at,
  }
}

/**
 * Detect whether an item is FavoriteItemRow (has favorite_id) or BasketItem (has basketId).
 */
function isLegacyRow(item: FavoriteItemRow | BasketItem): item is FavoriteItemRow {
  return 'favorite_id' in item
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
 *
 * Builds stores: Partial<Record<Store, StoreMatch>> for all stores.
 * bestStore = store with lowest sale_price among matched deals.
 * bestDeal = deal at bestStore.
 */
export function matchFavorites(
  favorites: (FavoriteItemRow | BasketItem)[],
  deals: DealRow[],
  products?: ProductRow[],
): FavoriteComparison[] {
  // Group deals by store once
  const dealsByStore = new Map<Store, DealRow[]>()
  for (const store of ALL_STORES) {
    dealsByStore.set(store, deals.filter((d) => d.store === store))
  }

  return favorites.map((raw) => {
    const item = isLegacyRow(raw) ? toBasketItem(raw) : raw

    const stores: Partial<Record<Store, StoreMatch>> = {}

    for (const store of ALL_STORES) {
      const storeDeals = dealsByStore.get(store) ?? []
      let deal: DealRow | null = null
      let regularPrice: RegularPrice | null = null

      if (item.productGroupId) {
        if (products && products.length > 0) {
          deal = findBestMatchByProductGroup(item.productGroupId, storeDeals, products)
          regularPrice = findRegularPrice(item.productGroupId, store, products)
        }
      } else {
        deal = findBestMatch(item.keyword, storeDeals, {
          excludeTerms: item.excludeTerms,
          preferTerms: item.preferTerms,
        })
      }

      const productKnown = !deal && regularPrice !== null
      stores[store] = { deal, regularPrice, productKnown }
    }

    // bestStore = store with lowest sale_price among matched deals
    let bestStore: Store | 'none' = 'none'
    let bestDeal: DealRow | null = null

    for (const store of ALL_STORES) {
      const match = stores[store]
      if (!match?.deal) continue
      if (!bestDeal || match.deal.sale_price < bestDeal.sale_price) {
        bestDeal = match.deal
        bestStore = store
      }
    }

    return {
      favorite: item,
      stores,
      bestStore,
      bestDeal,
    }
  })
}

/**
 * Build side-by-side deal comparisons across all stores.
 *
 * Two-tier matching:
 * - Tier 1: Match deals via product_group. For each group with deals at 2+ stores,
 *   pick the best deal per store (highest discount_percent).
 * - Tier 2: For remaining unmatched deals, use matchRelevance() to find
 *   name-similar deals across stores. Threshold: relevance >= 3.
 *
 * bestStore = store with lowest sale_price. All unmatched deals go into a single array.
 */
export function buildDealComparisons(
  deals: DealRow[],
  products: ProductRow[],
  productGroups: ProductGroupRow[],
): DealComparisonResult {
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

  // Tier 1: Group deals by product_group per store
  const groupDealsByStore = new Map<Store, Map<string, DealRow[]>>()
  for (const store of ALL_STORES) {
    groupDealsByStore.set(store, new Map())
  }

  const matchedDealIds = new Set<string>()

  for (const deal of deals) {
    if (!deal.product_id) continue
    const groupId = productToGroup.get(deal.product_id)
    if (!groupId) continue
    const storeMap = groupDealsByStore.get(deal.store)
    if (!storeMap) continue
    const arr = storeMap.get(groupId) ?? []
    arr.push(deal)
    storeMap.set(groupId, arr)
  }

  // Find groups with deals at 2+ stores
  const matched: DealComparison[] = []
  const allGroupIds = new Set<string>()
  for (const storeMap of groupDealsByStore.values()) {
    for (const gId of storeMap.keys()) {
      allGroupIds.add(gId)
    }
  }

  for (const groupId of allGroupIds) {
    const storeDeals: Partial<Record<Store, DealRow>> = {}
    let storeCount = 0

    for (const store of ALL_STORES) {
      const storeGroupDeals = groupDealsByStore.get(store)?.get(groupId)
      if (!storeGroupDeals || storeGroupDeals.length === 0) continue

      // Best deal per store = highest discount
      const best = [...storeGroupDeals].sort(
        (a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0),
      )[0]!
      storeDeals[store] = best
      storeCount++
    }

    // Only create a comparison if 2+ stores have the product
    if (storeCount < 2) continue

    const group = groupLabelMap.get(groupId)
    const firstDeal = Object.values(storeDeals)[0]!
    const label = group?.label ?? firstDeal.product_name
    const category: Category | null = group?.category ?? firstDeal.category ?? null

    // bestStore = store with lowest sale_price
    let bestStore: Store | 'tie' = 'tie'
    let lowestPrice = Infinity
    for (const [store, deal] of Object.entries(storeDeals) as [Store, DealRow][]) {
      if (deal.sale_price < lowestPrice) {
        lowestPrice = deal.sale_price
        bestStore = store
      } else if (deal.sale_price === lowestPrice) {
        bestStore = 'tie'
      }
    }

    matched.push({
      id: `pg-${groupId}`,
      label,
      matchType: 'product-group',
      category,
      storeDeals,
      bestStore,
    })

    // Mark all deals in this group as matched
    for (const deal of Object.values(storeDeals) as DealRow[]) {
      matchedDealIds.add(deal.id)
    }
  }

  // Tier 2: Name-similarity matching for remaining unmatched deals
  const unmatchedDeals = deals.filter((d) => !matchedDealIds.has(d.id))

  // Group unmatched deals by store for iteration
  const unmatchedByStore = new Map<Store, DealRow[]>()
  for (const store of ALL_STORES) {
    unmatchedByStore.set(store, unmatchedDeals.filter((d) => d.store === store))
  }

  const tier2MatchedIds = new Set<string>()

  // Use migros as the anchor store for name-similarity matching
  const anchorStore: Store = 'migros'
  const anchorDeals = unmatchedByStore.get(anchorStore) ?? []

  for (const anchorDeal of anchorDeals) {
    if (tier2MatchedIds.has(anchorDeal.id)) continue

    const candidateStoreDeals: Partial<Record<Store, DealRow>> = {
      [anchorStore]: anchorDeal,
    }

    for (const store of ALL_STORES) {
      if (store === anchorStore) continue
      const storeUnmatched = unmatchedByStore.get(store) ?? []
      let bestMatch: DealRow | null = null
      let bestRelevance = 0

      for (const cDeal of storeUnmatched) {
        if (tier2MatchedIds.has(cDeal.id)) continue
        const r1 = matchRelevance(anchorDeal.product_name, cDeal.product_name)
        const r2 = matchRelevance(cDeal.product_name, anchorDeal.product_name)
        const relevance = Math.max(r1, r2)
        if (relevance >= 3 && relevance > bestRelevance) {
          bestRelevance = relevance
          bestMatch = cDeal
        }
      }

      if (bestMatch) {
        candidateStoreDeals[store] = bestMatch
      }
    }

    const storeCount = Object.keys(candidateStoreDeals).length
    if (storeCount < 2) continue

    // Mark all as matched
    for (const deal of Object.values(candidateStoreDeals) as DealRow[]) {
      tier2MatchedIds.add(deal.id)
    }

    // Use shortest name as label
    const allDeals = Object.values(candidateStoreDeals) as DealRow[]
    const label = allDeals.reduce(
      (shortest, d) => d.product_name.length < shortest.length ? d.product_name : shortest,
      allDeals[0]!.product_name,
    )

    // bestStore = lowest sale_price
    let bestStore: Store | 'tie' = 'tie'
    let lowestPrice = Infinity
    for (const [store, deal] of Object.entries(candidateStoreDeals) as [Store, DealRow][]) {
      if (deal.sale_price < lowestPrice) {
        lowestPrice = deal.sale_price
        bestStore = store
      } else if (deal.sale_price === lowestPrice) {
        bestStore = 'tie'
      }
    }

    matched.push({
      id: `ns-${anchorDeal.id}`,
      label,
      matchType: 'name-similarity',
      category: anchorDeal.category ?? null,
      storeDeals: candidateStoreDeals,
      bestStore,
    })
  }

  // Sort matched: product-group first, then by best discount
  matched.sort((a, b) => {
    if (a.matchType !== b.matchType) {
      return a.matchType === 'product-group' ? -1 : 1
    }
    const aDiscount = Math.max(...(Object.values(a.storeDeals) as DealRow[]).map((d) => d.discount_percent ?? 0))
    const bDiscount = Math.max(...(Object.values(b.storeDeals) as DealRow[]).map((d) => d.discount_percent ?? 0))
    return bDiscount - aDiscount
  })

  // Final unmatched = all deals not in any comparison
  const allMatchedIds = new Set([...matchedDealIds, ...tier2MatchedIds])
  const unmatched = deals.filter((d) => !allMatchedIds.has(d.id))

  return { matched, unmatched }
}

/**
 * Split comparisons into shopping lists grouped by bestStore.
 * Returns a map of store -> FavoriteComparison[], plus 'none' for no-deal items.
 */
export function splitShoppingList(comparisons: FavoriteComparison[]): {
  byStore: Partial<Record<Store, FavoriteComparison[]>>
  noDeals: FavoriteComparison[]
} {
  const byStore: Partial<Record<Store, FavoriteComparison[]>> = {}
  const noDeals: FavoriteComparison[] = []

  for (const comp of comparisons) {
    if (comp.bestStore === 'none') {
      noDeals.push(comp)
    } else {
      const arr = byStore[comp.bestStore] ?? []
      arr.push(comp)
      byStore[comp.bestStore] = arr
    }
  }

  return { byStore, noDeals }
}
