// All Supabase queries live here. Components never call supabase.from() directly.

import type {
  Category,
  DealRow,
  FavoriteItemRow,
  ProductGroupRow,
  ProductRow,
  SearchResult,
  StarterPackRow,
  Store,
} from '@shared/types'
import { matchRelevance, isExcluded } from './matching'

import { supabase } from './supabase'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Fetch all active deals, optionally filtered by store and/or category.
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
 * Search active deals by keyword (matches product_name).
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

/**
 * Create a new favorites list. Returns the favorite ID.
 */
export async function createFavorite(): Promise<string | null> {
  const { data, error } = await supabase
    .from('favorites')
    .insert({})
    .select('id')
    .single()

  if (error) {
    console.error('[queries] createFavorite error:', error.message)
    return null
  }
  return data.id
}

/**
 * Save email to an existing favorites list.
 */
export async function saveFavoriteEmail(
  favoriteId: string,
  email: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('favorites')
    .update({ email })
    .eq('id', favoriteId)

  if (error) {
    console.error('[queries] saveFavoriteEmail error:', error.message)
    return false
  }
  return true
}

/**
 * Look up a favorites list by email. Returns the favorite ID or null.
 * Uses an RPC function to avoid exposing email column via PostgREST.
 */
export async function lookupFavoriteByEmail(
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .rpc('lookup_favorite_by_email', { lookup_email: email })

  if (error || !data) {
    return null
  }
  return data as string
}

/**
 * Fetch all items in a favorites list.
 */
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

/**
 * Add an item to a favorites list.
 */
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

/**
 * Remove an item from a favorites list.
 */
export async function removeFavoriteItem(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('favorite_items')
    .delete()
    .eq('id', itemId)

  if (error) {
    console.error('[queries] removeFavoriteItem error:', error.message)
    return false
  }
  return true
}

/**
 * Add multiple items to a favorites list at once (for starter pack import).
 */
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

/**
 * Find the best deal for a keyword+store combination.
 * Returns the deal with the highest discount_percent.
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

/**
 * Fetch all products that have a product_group assigned.
 * Used by the matching engine to resolve product-group-based favorites.
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
 * Fetch all product groups (~70 rows). Meant to be cached by react-query.
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
