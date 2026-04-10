// All Supabase queries live here. Components never call supabase.from() directly.

import type {
  Category,
  DealRow,
  FavoriteItemRow,
  ProductRow,
  StarterPackRow,
  Store,
} from '@shared/types'

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
 */
export async function lookupFavoriteByEmail(
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('email', email)
    .single()

  if (error) {
    return null
  }
  return data.id
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
  item: { keyword: string; label: string; category: Category; excludeTerms?: string[]; preferTerms?: string[] },
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
  items: { keyword: string; label: string; category: Category; excludeTerms?: string[]; preferTerms?: string[] }[],
): Promise<FavoriteItemRow[]> {
  const rows = items.map((item) => ({
    favorite_id: favoriteId,
    keyword: item.keyword,
    label: item.label,
    category: item.category,
    exclude_terms: item.excludeTerms ?? null,
    prefer_terms: item.preferTerms ?? null,
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
