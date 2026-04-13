// All Supabase queries live here. Components never call supabase.from() directly.

import type {
  BasketItem,
  BasketItemRow,
  BasketRow,
  Basket,
  BrowseCategory,
  Category,
  DealRow,
  FavoriteComparison,
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

const today = () => new Date().toISOString().slice(0, 10)

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
 * Fetch a basket by ID.
 */
export async function fetchBasket(id: string): Promise<Basket> {
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(`[queries] fetchBasket: ${error.message}`)
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
 * Fetch all items in a basket.
 */
export async function fetchBasketItems(
  basketId: string,
): Promise<BasketItem[]> {
  const { data, error } = await supabase
    .from('favorite_items')
    .select('*')
    .eq('favorite_id', basketId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`[queries] fetchBasketItems: ${error.message}`)
  }

  return (data as BasketItemRow[]).map((row) => ({
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
 * Create a new basket (favorites list). Returns the Basket.
 */
export async function createBasket(email?: string): Promise<Basket> {
  const insertData = email ? { email } : {}

  const { data, error } = await supabase
    .from('favorites')
    .insert(insertData)
    .select('*')
    .single()

  if (error) {
    throw new Error(`[queries] createBasket: ${error.message}`)
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
 * Add an item to a basket.
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
  const { data, error } = await supabase
    .from('favorite_items')
    .insert({
      favorite_id: basketId,
      keyword: item.keyword,
      label: item.label,
      category: item.category,
      exclude_terms: item.excludeTerms ?? null,
      prefer_terms: item.preferTerms ?? null,
      product_group_id: item.productGroupId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`[queries] addBasketItem: ${error.message}`)
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
 * Remove an item from a basket.
 */
export async function removeBasketItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('favorite_items')
    .delete()
    .eq('id', itemId)

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
 * Save email to an existing basket.
 */
export async function saveBasketEmail(
  basketId: string,
  email: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('favorites')
    .update({ email })
    .eq('id', basketId)

  if (error) {
    console.error('[queries] saveBasketEmail error:', error.message)
    return false
  }
  return true
}

/**
 * Add multiple items to a basket at once (for starter pack import).
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
  const rows = items.map((item) => ({
    favorite_id: basketId,
    keyword: item.keyword,
    label: item.label,
    category: item.category,
    exclude_terms: item.excludeTerms ?? null,
    prefer_terms: item.preferTerms ?? null,
    product_group_id: item.productGroupId ?? null,
  }))

  const { data, error } = await supabase
    .from('favorite_items')
    .insert(rows)
    .select('*')

  if (error) {
    console.error('[queries] addBasketItemsBatch error:', error.message)
    return []
  }

  return (data as BasketItemRow[]).map((row) => ({
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
// Favorite comparisons
// ============================================================

/**
 * Fetch favorite comparisons for a basket.
 * Matches each basket item against active deals at both stores.
 * Includes coopProductKnown flag for two-tier Coop status.
 * Date filter safety net applied on deal queries.
 */
export async function fetchFavoriteComparisons(
  basketId: string,
): Promise<FavoriteComparison[]> {
  // Fetch basket items
  const { data: itemData, error: itemError } = await supabase
    .from('favorite_items')
    .select('*')
    .eq('favorite_id', basketId)
    .order('created_at', { ascending: true })

  if (itemError) {
    throw new Error(`[queries] fetchFavoriteComparisons items: ${itemError.message}`)
  }

  const items = itemData as BasketItemRow[]
  if (items.length === 0) return []

  // Fetch all active deals (date filter safety net)
  const { data: dealData, error: dealError } = await supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .or(`valid_to.is.null,valid_to.gte.${today()}`)
    .order('discount_percent', { ascending: false })

  if (dealError) {
    throw new Error(`[queries] fetchFavoriteComparisons deals: ${dealError.message}`)
  }

  const deals = dealData as DealRow[]
  const migrosDeals = deals.filter((d) => d.store === 'migros')
  const coopDeals = deals.filter((d) => d.store === 'coop')

  // Build comparisons
  const comparisons: FavoriteComparison[] = []

  for (const item of items) {
    const keyword = item.keyword.toLowerCase()

    // Find best Migros deal
    const migrosDeal = findBestDealForItem(keyword, migrosDeals, item.exclude_terms) ?? null

    // Find best Coop deal
    const coopDeal = findBestDealForItem(keyword, coopDeals, item.exclude_terms) ?? null

    // Check if Coop product is known (two-tier status)
    let coopProductKnown = coopDeal !== null
    if (!coopProductKnown) {
      coopProductKnown = await checkCoopProductExists(
        item.keyword,
        item.product_group_id,
      )
    }

    // Determine recommendation
    let recommendation: FavoriteComparison['recommendation'] = 'none'
    if (migrosDeal && coopDeal) {
      if (migrosDeal.sale_price < coopDeal.sale_price) recommendation = 'migros'
      else if (coopDeal.sale_price < migrosDeal.sale_price) recommendation = 'coop'
      else recommendation = 'both'
    } else if (migrosDeal) {
      recommendation = 'migros'
    } else if (coopDeal) {
      recommendation = 'coop'
    }

    comparisons.push({
      favorite: {
        id: item.id,
        basketId: item.favorite_id,
        keyword: item.keyword,
        label: item.label,
        category: item.category,
        excludeTerms: item.exclude_terms,
        preferTerms: item.prefer_terms,
        productGroupId: item.product_group_id,
        createdAt: item.created_at,
      },
      migrosDeal,
      coopDeal,
      migrosRegularPrice: null,
      coopRegularPrice: null,
      coopProductKnown,
      recommendation,
    })
  }

  return comparisons
}

/**
 * Find best deal for a keyword within a set of deals.
 */
function findBestDealForItem(
  keyword: string,
  deals: DealRow[],
  excludeTerms: string[] | null,
): DealRow | undefined {
  return deals.find((d) => {
    const name = d.product_name.toLowerCase()
    if (!name.includes(keyword)) return false
    if (excludeTerms) {
      for (const term of excludeTerms) {
        if (name.includes(term.toLowerCase())) return false
      }
    }
    return true
  })
}

/**
 * Check if a Coop product exists in the products table.
 * Used for two-tier Coop status: known product vs never seen.
 */
async function checkCoopProductExists(
  keyword: string,
  productGroupId: string | null,
): Promise<boolean> {
  // Check by product group first
  if (productGroupId) {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store', 'coop')
      .eq('product_group', productGroupId)

    if (!error && count && count > 0) return true
  }

  // Fallback: check by keyword
  const escaped = keyword.toLowerCase().replace(/%/g, '\\%').replace(/_/g, '\\_')
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store', 'coop')
    .ilike('canonical_name', `%${escaped}%`)

  if (error) return false
  return (count ?? 0) > 0
}

// ============================================================
// Pipeline run queries
// ============================================================

/**
 * Fetch the latest pipeline run record.
 */
export async function fetchLatestPipelineRun(): Promise<PipelineRun | null> {
  const { data, error } = await supabase
    .from('pipeline_runs')
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

    // Show individual products within the group (up to 4 per store)
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
      .slice(0, 8) // up to 8 individual products per group

    if (scoredProducts.length > 0) {
      for (const { product, deal } of scoredProducts) {
        results.push({
          productGroup: group,
          migrosDeal: product.store === 'migros' ? deal : null,
          coopDeal: product.store === 'coop' ? deal : null,
          migrosRegularPrice: product.store === 'migros' ? product.regular_price : null,
          coopRegularPrice: product.store === 'coop' ? product.regular_price : null,
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
        migrosDeal: null,
        coopDeal: null,
        migrosRegularPrice: null,
        coopRegularPrice: null,
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
    if (relevance < 2) continue

    if (isExcluded(deal.product_name, topGroups[0]?.group.exclude_keywords)) continue

    results.push({
      productGroup: null,
      migrosDeal: deal.store === 'migros' ? deal : null,
      coopDeal: deal.store === 'coop' ? deal : null,
      migrosRegularPrice: null,
      coopRegularPrice: null,
      label: deal.product_name,
      category: deal.category,
      relevance,
    })
  }

  // Sort: relevance first, then prefer results with deals
  results.sort((a, b) => {
    if (a.relevance !== b.relevance) return b.relevance - a.relevance
    const aHasDeal = (a.migrosDeal || a.coopDeal) ? 1 : 0
    const bHasDeal = (b.migrosDeal || b.coopDeal) ? 1 : 0
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
  const { data, error } = await supabase
    .from('favorite_items')
    .select('*')
    .eq('favorite_id', favoriteId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`[queries] fetchFavoriteItems: ${error.message}`)
  }
  return data as FavoriteItemRow[]
}

/** @deprecated Use addBasketItem */
export async function addFavoriteItem(
  favoriteId: string,
  item: { keyword: string; label: string; category: Category; excludeTerms?: string[]; preferTerms?: string[]; productGroupId?: string },
): Promise<FavoriteItemRow | null> {
  const { data, error } = await supabase
    .from('favorite_items')
    .insert({
      favorite_id: favoriteId,
      keyword: item.keyword,
      label: item.label,
      category: item.category,
      exclude_terms: item.excludeTerms ?? null,
      prefer_terms: item.preferTerms ?? null,
      product_group_id: item.productGroupId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[queries] addFavoriteItem error:', error.message)
    return null
  }
  return data as FavoriteItemRow
}

/** @deprecated Use removeBasketItem */
export async function removeFavoriteItem(itemId: string): Promise<boolean> {
  try {
    await removeBasketItem(itemId)
    return true
  } catch {
    return false
  }
}

/** @deprecated Use addBasketItemsBatch */
export async function addFavoriteItemsBatch(
  favoriteId: string,
  items: { keyword: string; label: string; category: Category; excludeTerms?: string[]; preferTerms?: string[]; productGroupId?: string }[],
): Promise<FavoriteItemRow[]> {
  const rows = items.map((item) => ({
    favorite_id: favoriteId,
    keyword: item.keyword,
    label: item.label,
    category: item.category,
    exclude_terms: item.excludeTerms ?? null,
    prefer_terms: item.preferTerms ?? null,
    product_group_id: item.productGroupId ?? null,
  }))

  const { data, error } = await supabase
    .from('favorite_items')
    .insert(rows)
    .select('*')

  if (error) {
    console.error('[queries] addFavoriteItemsBatch error:', error.message)
    return []
  }
  return data as FavoriteItemRow[]
}
