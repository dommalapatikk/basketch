// All Supabase queries live here. Components never call supabase.from() directly.

import type {
  BasketItem,
  BasketItemRow,
  BasketRow,
  Basket,
  BrowseCategory,
  Category,
  DealRow,
  FavoriteItemRow,
  PipelineRun,
  ProductGroupRow,
  ProductRow,
  SearchResult,
  Store,
  StarterPackRow,
} from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'
import { matchRelevance, isExcluded } from './matching'

import { supabase } from './supabase'

/** Returns today's date as YYYY-MM-DD in Swiss local time (Europe/Zurich). */
const today = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' })
  return formatter.format(new Date())
}

// ============================================================
// Deal queries
// ============================================================

/**
 * Fetch all active deals, optionally filtered by store and/or category.
 * Date filter safety net: .gte('valid_to', today) prevents showing expired deals.
 */
export async function fetchActiveDeals(filters?: {
  store?: Store
  category?: Category
}): Promise<DealRow[]> {
  let query = supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today()}`)
    .order('discount_percent', { ascending: false })

  if (filters?.store) {
    query = query.eq('store', filters.store)
  }
  if (filters?.category) {
    query = query.eq('category', filters.category)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`[queries] fetchActiveDeals: ${error.message}`)
  }
  return data as DealRow[]
}

/**
 * Fetch deals that were active during a specific week (permalink verdict page).
 * Unlike fetchActiveDeals, this ignores is_active so historical weeks still return
 * rows after the pipeline deactivates them.
 *
 * A deal "covers" weekOf iff valid_from <= weekOf AND (valid_to IS NULL OR valid_to >= weekOf).
 */
export async function fetchDealsForWeek(weekOf: string): Promise<DealRow[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .lte('valid_from', weekOf)
    .or(`valid_to.is.null,valid_to.gte.${weekOf}`)
    .order('discount_percent', { ascending: false })

  if (error) {
    throw new Error(`[queries] fetchDealsForWeek: ${error.message}`)
  }
  return data as DealRow[]
}

/**
 * Fetch deals for a browse category (maps browse category to sub_categories).
 * Date filter safety net applied.
 */
export async function fetchDealsByCategory(
  browseCategory: BrowseCategory,
): Promise<DealRow[]> {
  if (browseCategory === 'all') {
    return fetchActiveDeals()
  }

  const info = BROWSE_CATEGORIES.find((c) => c.id === browseCategory)
  if (!info) return []

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today()}`)
    .in('sub_category', info.subCategories)
    .order('discount_percent', { ascending: false })

  if (error) {
    throw new Error(`[queries] fetchDealsByCategory: ${error.message}`)
  }
  return data as DealRow[]
}

/**
 * Search active deals by keyword (matches product_name).
 * Date filter safety net applied.
 */
export async function searchDeals(keyword: string): Promise<DealRow[]> {
  const normalized = keyword.toLowerCase().trim()
  if (!normalized) return []

  const escaped = normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today()}`)
    .ilike('product_name', `%${escaped}%`)
    .order('discount_percent', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[queries] searchDeals error:', error.message)
    return []
  }
  return data as DealRow[]
}

// ============================================================
// Starter pack queries
// ============================================================

/**
 * Fetch all active starter packs, sorted by sort_order.
 */
export async function fetchStarterPacks(): Promise<StarterPackRow[]> {
  const { data, error } = await supabase
    .from('starter_packs')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[queries] fetchStarterPacks: ${error.message}`)
  }
  return data as StarterPackRow[]
}

// ============================================================
// Basket (favorites) queries
// ============================================================

/**
 * Fetch a basket by ID (via RPC — no direct table access).
 */
export async function fetchBasket(id: string): Promise<Basket> {
  const { data, error } = await supabase.rpc('get_favorite', { p_id: id })

  if (error || !data) {
    throw new Error(`[queries] fetchBasket: ${error?.message ?? 'not found'}`)
  }

  const row = data as BasketRow
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Fetch all items in a basket (via RPC).
 */
export async function fetchBasketItems(
  basketId: string,
): Promise<BasketItem[]> {
  const { data, error } = await supabase.rpc('get_favorite_items', {
    p_favorite_id: basketId,
  })

  if (error) {
    throw new Error(`[queries] fetchBasketItems: ${error.message}`)
  }

  return ((data ?? []) as BasketItemRow[]).map((row) => ({
    id: row.id,
    basketId: row.favorite_id,
    keyword: row.keyword,
    label: row.label,
    category: row.category,
    excludeTerms: row.exclude_terms,
    preferTerms: row.prefer_terms,
    productGroupId: row.product_group_id,
    createdAt: row.created_at,
  }))
}

/**
 * Create a new basket (via RPC). Returns the Basket.
 */
export async function createBasket(email?: string): Promise<Basket> {
  const { data, error } = await supabase.rpc('create_favorite', {
    p_email: email ?? null,
  })

  if (error || !data) {
    throw new Error(`[queries] createBasket: ${error?.message ?? 'no data returned'}`)
  }

  const row = data as BasketRow
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Add an item to a basket (via RPC).
 */
export async function addBasketItem(
  basketId: string,
  item: {
    keyword: string
    label: string
    category: Category
    excludeTerms?: string[]
    preferTerms?: string[]
    productGroupId?: string
  },
): Promise<BasketItem> {
  const { data, error } = await supabase.rpc('add_favorite_item', {
    p_favorite_id: basketId,
    p_keyword: item.keyword,
    p_label: item.label,
    p_category: item.category,
    p_exclude_terms: item.excludeTerms ?? null,
    p_prefer_terms: item.preferTerms ?? null,
    p_product_group_id: item.productGroupId ?? null,
  })

  if (error || !data) {
    throw new Error(`[queries] addBasketItem: ${error?.message ?? 'no data returned'}`)
  }

  const row = data as BasketItemRow
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
 * Remove an item from a basket (via RPC — requires both IDs for ownership check).
 */
export async function removeBasketItem(
  basketId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_favorite_item', {
    p_favorite_id: basketId,
    p_item_id: itemId,
  })

  if (error) {
    throw new Error(`[queries] removeBasketItem: ${error.message}`)
  }
}

/**
 * Look up a basket by email. Returns the Basket or null.
 * Uses an RPC function to avoid exposing email column via PostgREST.
 */
export async function lookupBasketByEmail(
  email: string,
): Promise<Basket | null> {
  const { data, error } = await supabase
    .rpc('lookup_favorite_by_email', { lookup_email: email })

  if (error || !data) {
    return null
  }

  // RPC returns the favorite ID — fetch the full basket
  return fetchBasket(data as string)
}

/**
 * Save email to an existing basket (via RPC).
 */
export async function saveBasketEmail(
  basketId: string,
  email: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('update_favorite_email', {
    p_id: basketId,
    p_email: email,
  })

  if (error) {
    console.error('[queries] saveBasketEmail error:', error.message)
    return false
  }
  return true
}

/**
 * Add multiple items to a basket at once (via RPC — for starter pack import).
 */
export async function addBasketItemsBatch(
  basketId: string,
  items: {
    keyword: string
    label: string
    category: Category
    excludeTerms?: string[]
    preferTerms?: string[]
    productGroupId?: string
  }[],
): Promise<BasketItem[]> {
  const { data, error } = await supabase.rpc('add_favorite_items_batch', {
    p_favorite_id: basketId,
    p_items: JSON.stringify(items.map((i) => ({
      keyword: i.keyword,
      label: i.label,
      category: i.category,
      excludeTerms: i.excludeTerms ?? null,
      preferTerms: i.preferTerms ?? null,
      productGroupId: i.productGroupId ?? null,
    }))),
  })

  if (error) {
    console.error('[queries] addBasketItemsBatch error:', error.message)
    return []
  }

  return ((data ?? []) as BasketItemRow[]).map((row) => ({
    id: row.id,
    basketId: row.favorite_id,
    keyword: row.keyword,
    label: row.label,
    category: row.category,
    excludeTerms: row.exclude_terms,
    preferTerms: row.prefer_terms,
    productGroupId: row.product_group_id,
    createdAt: row.created_at,
  }))
}

// ============================================================
// ============================================================
// Pipeline run queries
// ============================================================

/**
 * Fetch the latest pipeline run record.
 */
export async function fetchLatestPipelineRun(): Promise<PipelineRun | null> {
  const { data, error } = await supabase
    .from('pipeline_runs_public')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[queries] fetchLatestPipelineRun error:', error.message)
    return null
  }
  return data as PipelineRun | null
}

// ============================================================
// Product queries
// ============================================================

/**
 * Fetch all products that have a product_group assigned.
 */
export async function fetchProductsWithGroups(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .not('product_group', 'is', null)

  if (error) {
    throw new Error(`[queries] fetchProductsWithGroups: ${error.message}`)
  }
  return data as ProductRow[]
}

/**
 * Fetch all product groups (~70 rows). Cached by useCachedQuery.
 */
export async function fetchAllProductGroups(): Promise<ProductGroupRow[]> {
  const { data, error } = await supabase
    .from('product_groups')
    .select('*')

  if (error) {
    throw new Error(`[queries] fetchAllProductGroups: ${error.message}`)
  }
  return data as ProductGroupRow[]
}

/**
 * Fetch products belonging to any of the given product group IDs.
 */
async function fetchProductsByGroups(groupIds: string[]): Promise<ProductRow[]> {
  if (groupIds.length === 0) return []
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .in('product_group', groupIds)

  if (error) {
    console.error('[queries] fetchProductsByGroups:', error.message)
    return []
  }
  return data as ProductRow[]
}

/**
 * Fetch active deals linked to specific product IDs.
 * Date filter safety net applied.
 */
async function fetchActiveDealsForProducts(productIds: string[]): Promise<DealRow[]> {
  if (productIds.length === 0) return []
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today()}`)
    .in('product_id', productIds)
    .order('discount_percent', { ascending: false })

  if (error) {
    console.error('[queries] fetchActiveDealsForProducts:', error.message)
    return []
  }
  return data as DealRow[]
}

/**
 * Find the best deal for a keyword+store combination.
 * Returns the deal with the highest discount_percent.
 * Date filter safety net applied.
 */
export async function findBestDeal(
  keyword: string,
  store: Store,
): Promise<DealRow | null> {
  const normalized = keyword.toLowerCase().trim()
  if (!normalized) return null

  const escaped = normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today()}`)
    .eq('store', store)
    .ilike('product_name', `%${escaped}%`)
    .order('discount_percent', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return null
  }
  return data as DealRow
}

// ============================================================
// Product search
// ============================================================

/**
 * Search products across product groups, products table, and deals.
 * Uses matchRelevance for scoring and returns results from both stores.
 *
 * @param keyword — the user's search term (e.g., "bananen")
 * @param allGroups — all product groups (cached, passed in from hook)
 */
export async function searchProducts(
  keyword: string,
  allGroups: ProductGroupRow[],
): Promise<SearchResult[]> {
  const normalized = keyword.toLowerCase().trim()
  if (!normalized) return []

  // Phase 1: Find matching product groups via search_keywords
  const groupMatches: { group: ProductGroupRow; relevance: number }[] = []
  for (const group of allGroups) {
    let bestRelevance = 0
    for (const kw of group.search_keywords) {
      const r1 = matchRelevance(normalized, kw)
      const r2 = matchRelevance(kw, normalized)
      bestRelevance = Math.max(bestRelevance, r1, r2)
    }
    // Also check group label
    bestRelevance = Math.max(bestRelevance, matchRelevance(normalized, group.label.toLowerCase()))

    if (bestRelevance >= 2) {
      const excluded = group.exclude_keywords?.some(
        (ek) => ek && normalized.includes(ek.toLowerCase()),
      )
      if (!excluded) {
        groupMatches.push({ group, relevance: bestRelevance })
      }
    }
  }
  groupMatches.sort((a, b) => b.relevance - a.relevance)
  const topGroups = groupMatches.slice(0, 5)

  // Phase 2: Fetch products + deals for matched groups
  const groupIds = topGroups.map((g) => g.group.id)
  const [products, rawDeals] = await Promise.all([
    fetchProductsByGroups(groupIds),
    searchDeals(normalized),  // also fetch deal-only fallback
  ])

  const productIds = products.map((p) => p.id)
  const groupDeals = await fetchActiveDealsForProducts(productIds)

  const results: SearchResult[] = []
  const coveredProductIds = new Set(products.map((p) => p.id))

  for (const { group, relevance } of topGroups) {
    const groupProducts = products.filter((p) => p.product_group === group.id)
    const groupProductIds = new Set(groupProducts.map((p) => p.id))
    const dealsForGroup = groupDeals.filter((d) => d.product_id && groupProductIds.has(d.product_id))

    // Build a deal lookup by product_id
    const dealByProductId = new Map<string, DealRow>()
    for (const d of dealsForGroup) {
      if (d.product_id && !dealByProductId.has(d.product_id)) {
        dealByProductId.set(d.product_id, d)
      }
    }

    // Show individual products within the group (up to 8 per group)
    // Score each product by relevance to the search keyword
    const scoredProducts = groupProducts
      .filter((p) => p.regular_price != null || dealByProductId.has(p.id))
      .map((p) => ({
        product: p,
        score: matchRelevance(normalized, p.source_name),
        deal: dealByProductId.get(p.id) ?? null,
      }))
      .sort((a, b) => {
        // Deals first, then by relevance, then by price
        const aHasDeal = a.deal ? 1 : 0
        const bHasDeal = b.deal ? 1 : 0
        if (aHasDeal !== bHasDeal) return bHasDeal - aHasDeal
        if (a.score !== b.score) return b.score - a.score
        return (a.product.regular_price ?? Infinity) - (b.product.regular_price ?? Infinity)
      })
      .slice(0, 8)

    if (scoredProducts.length > 0) {
      for (const { product, deal } of scoredProducts) {
        const storeDeals: SearchResult['storeDeals'] = {}
        const regularPrices: SearchResult['regularPrices'] = {}
        if (deal) storeDeals[product.store] = deal
        if (product.regular_price != null) regularPrices[product.store] = product.regular_price
        results.push({
          productGroup: group,
          storeDeals,
          regularPrices,
          label: product.source_name
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          category: group.category,
          relevance,
        })
      }
    } else {
      // No products in group — show group header with no data
      results.push({
        productGroup: group,
        storeDeals: {},
        regularPrices: {},
        label: group.label,
        category: group.category,
        relevance,
      })
    }
  }

  // Phase 3: Fallback — deals not covered by product groups
  const seenNames = new Set<string>()
  for (const deal of rawDeals) {
    if (deal.product_id && coveredProductIds.has(deal.product_id)) continue
    if (seenNames.has(deal.product_name)) continue
    seenNames.add(deal.product_name)

    const relevance = matchRelevance(normalized, deal.product_name)
    if (relevance < 3) continue
    if (deal.category === 'non-food') continue

    if (isExcluded(deal.product_name, topGroups[0]?.group.exclude_keywords)) continue

    results.push({
      productGroup: null,
      storeDeals: { [deal.store]: deal },
      regularPrices: {},
      label: deal.product_name,
      category: deal.category,
      relevance,
    })
  }

  // Sort: relevance first, then prefer results with deals
  results.sort((a, b) => {
    if (a.relevance !== b.relevance) return b.relevance - a.relevance
    const aHasDeal = Object.keys(a.storeDeals).length > 0 ? 1 : 0
    const bHasDeal = Object.keys(b.storeDeals).length > 0 ? 1 : 0
    return bHasDeal - aHasDeal
  })

  return results.slice(0, 20)
}

// ============================================================
// Legacy aliases (backward compatibility with existing components)
// ============================================================

/** @deprecated Use createBasket */
export async function createFavorite(): Promise<string | null> {
  try {
    const basket = await createBasket()
    return basket.id
  } catch {
    return null
  }
}

/** @deprecated Use saveBasketEmail */
export const saveFavoriteEmail = saveBasketEmail

/** @deprecated Use lookupBasketByEmail */
export async function lookupFavoriteByEmail(
  email: string,
): Promise<string | null> {
  const basket = await lookupBasketByEmail(email)
  return basket?.id ?? null
}

/** @deprecated Use fetchBasketItems (returns BasketItem[], not FavoriteItemRow[]) */
export async function fetchFavoriteItems(
  favoriteId: string,
): Promise<FavoriteItemRow[]> {
  const { data, error } = await supabase.rpc('get_favorite_items', {
    p_favorite_id: favoriteId,
  })

  if (error) {
    throw new Error(`[queries] fetchFavoriteItems: ${error.message}`)
  }
  return (data ?? []) as FavoriteItemRow[]
}

/** @deprecated Use addBasketItem */
export async function addFavoriteItem(
  favoriteId: string,
  item: { keyword: string; label: string; category: Category; excludeTerms?: string[]; preferTerms?: string[]; productGroupId?: string },
): Promise<FavoriteItemRow | null> {
  try {
    const basketItem = await addBasketItem(favoriteId, item)
    // Map BasketItem (camelCase) back to FavoriteItemRow (snake_case) for legacy callers
    return {
      id: basketItem.id,
      favorite_id: basketItem.basketId,
      keyword: basketItem.keyword,
      label: basketItem.label,
      category: basketItem.category,
      exclude_terms: basketItem.excludeTerms,
      prefer_terms: basketItem.preferTerms,
      product_group_id: basketItem.productGroupId,
      created_at: basketItem.createdAt,
    }
  } catch (err) {
    console.error('[queries] addFavoriteItem error:', err instanceof Error ? err.message : err)
    return null
  }
}

/** @deprecated Use removeBasketItem */
export async function removeFavoriteItem(
  favoriteId: string,
  itemId: string,
): Promise<void> {
  await removeBasketItem(favoriteId, itemId)
}

/** @deprecated Use addBasketItemsBatch */
export async function addFavoriteItemsBatch(
  favoriteId: string,
  items: { keyword: string; label: string; category: Category; excludeTerms?: string[]; preferTerms?: string[]; productGroupId?: string }[],
): Promise<FavoriteItemRow[]> {
  try {
    const basketItems = await addBasketItemsBatch(favoriteId, items)
    return basketItems.map((bi) => ({
      id: bi.id,
      favorite_id: bi.basketId,
      keyword: bi.keyword,
      label: bi.label,
      category: bi.category,
      exclude_terms: bi.excludeTerms,
      prefer_terms: bi.preferTerms,
      product_group_id: bi.productGroupId,
      created_at: bi.createdAt,
    }))
  } catch (err) {
    console.error('[queries] addFavoriteItemsBatch error:', err instanceof Error ? err.message : err)
    return []
  }
}
