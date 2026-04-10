// shared/types.ts — Single source of truth for all data types.
// Consumed by pipeline (TypeScript) and frontend (React).
// Python Coop scraper outputs JSON matching UnifiedDeal shape (camelCase).

export type Store = 'migros' | 'coop'
export type Category = 'fresh' | 'long-life' | 'non-food'

/**
 * Raw deal from a source, before categorization.
 * Both Migros (TS) and Coop (Python) normalize to this shape.
 */
export interface UnifiedDeal {
  store: Store
  productName: string
  originalPrice: number | null
  salePrice: number
  discountPercent: number | null // null only when originalPrice is null
  validFrom: string             // ISO date: "2026-04-09"
  validTo: string | null
  imageUrl: string | null
  sourceCategory: string | null // Original category from source
  sourceUrl: string | null      // Link to deal on source site
}

/**
 * Categorized deal, ready for storage.
 */
export interface Deal extends UnifiedDeal {
  category: Category
  subCategory?: string | null
}

/**
 * Deal as stored in Supabase (snake_case column names).
 */
export interface DealRow {
  id: string
  store: Store
  product_name: string
  category: Category
  original_price: number | null
  sale_price: number
  discount_percent: number | null
  valid_from: string
  valid_to: string | null
  image_url: string | null
  source_category: string | null
  source_url: string | null
  product_id: string | null
  is_active: boolean
  fetched_at: string
  created_at: string
  updated_at: string
}

/**
 * Pipeline run log entry.
 */
export interface PipelineRun {
  id: string
  run_at: string
  migros_status: 'success' | 'failed' | 'skipped'
  migros_count: number
  coop_status: 'success' | 'failed' | 'skipped'
  coop_count: number
  total_stored: number
  duration_ms: number
  error_log: string | null
}

/**
 * Verdict per category.
 */
export interface CategoryVerdict {
  category: Category
  winner: Store | 'tie'
  migrosScore: number  // 0-100
  coopScore: number    // 0-100
  migrosDeals: number
  coopDeals: number
  migrosAvgDiscount: number
  coopAvgDiscount: number
}

/**
 * Full weekly verdict.
 */
export interface WeeklyVerdict {
  weekOf: string           // ISO date of the Thursday
  categories: CategoryVerdict[]
  dataFreshness: 'current' | 'stale' | 'partial'
  lastUpdated: string
}

/**
 * Category rule for keyword matching.
 */
export interface CategoryRule {
  keywords: string[]
  category: Category
  subCategory?: string
}

// ============================================================
// Product identity types (product data architecture)
// ============================================================

/**
 * Product group — links equivalent products across stores.
 * E.g., "milk-whole-1l" groups Migros Vollmilch and Coop Milch.
 */
export interface ProductGroupRow {
  id: string              // slug: "milk-whole-1l"
  label: string           // "Whole Milk (1L)"
  category: Category
  sub_category: string | null
  search_keywords: string[]
  created_at: string
}

/**
 * Product — one real-world product at a specific store.
 * Has stable identity across weeks (unlike deals which are per-week).
 */
export interface ProductRow {
  id: string
  canonical_name: string
  brand: string | null
  store: Store
  category: Category
  sub_category: string | null
  is_organic: boolean
  product_group: string | null  // FK to product_groups.id
  source_name: string           // raw product_name from deal
  first_seen_at: string
  updated_at: string
}

/**
 * Metadata extracted from a product name during pipeline processing.
 */
export interface ProductMetadata {
  brand: string | null
  isOrganic: boolean
  subCategory: string | null
}

/**
 * Converts a Deal (camelCase) to a DealRow-compatible object (snake_case) for Supabase upsert.
 */
export function dealToRow(deal: Deal, productId?: string | null): Omit<DealRow, 'id' | 'fetched_at' | 'created_at' | 'updated_at'> {
  return {
    store: deal.store,
    product_name: deal.productName,
    category: deal.category,
    original_price: deal.originalPrice,
    sale_price: deal.salePrice,
    discount_percent: deal.discountPercent,
    valid_from: deal.validFrom,
    valid_to: deal.validTo,
    image_url: deal.imageUrl,
    source_category: deal.sourceCategory,
    source_url: deal.sourceUrl,
    product_id: productId ?? null,
    is_active: true,
  }
}

// ============================================================
// Favorites types (favorites-first pivot)
// ============================================================

/**
 * Starter pack template — pre-loaded product lists for onboarding.
 * Stored in Supabase starter_packs table.
 */
export interface StarterPack {
  id: string
  name: string        // machine name: 'swiss-basics', 'indian-kitchen'
  label: string       // display name: 'Swiss Basics', 'Indian Kitchen'
  description: string | null
  items: StarterPackItem[]
  sortOrder: number
  isActive: boolean
}

export interface StarterPackItem {
  keyword: string           // search keyword: 'milch', 'poulet'
  label: string             // display name: 'Milk', 'Chicken'
  category: Category
  excludeTerms?: string[]   // products containing these terms are excluded from matching
  preferTerms?: string[]    // products containing these terms get a relevance boost
  productGroupId?: string   // links to product_groups.id for exact matching
}

/**
 * User's saved favorites list.
 * Email is optional — null until the user chooses to save.
 */
export interface Favorite {
  id: string
  email: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Single item in a user's favorites list.
 */
export interface FavoriteItem {
  id: string
  favoriteId: string
  keyword: string     // search keyword used to match deals
  label: string       // display name shown to user
  category: Category
  createdAt: string
}

/**
 * Supabase row shape for favorite_items (snake_case).
 */
export interface FavoriteItemRow {
  id: string
  favorite_id: string
  keyword: string
  label: string
  category: Category
  exclude_terms: string[] | null
  prefer_terms: string[] | null
  product_group_id: string | null
  created_at: string
}

/**
 * Supabase row shape for starter_packs (snake_case).
 */
export interface StarterPackRow {
  id: string
  name: string
  label: string
  description: string | null
  items: StarterPackItem[]  // JSONB column
  sort_order: number
  is_active: boolean
  created_at: string
}

/**
 * Result of matching a favorite item against active deals.
 * Used by the comparison view to build the split shopping list.
 */
export interface FavoriteComparison {
  favorite: FavoriteItem
  migrosDeal: DealRow | null
  coopDeal: DealRow | null
  recommendation: 'migros' | 'coop' | 'both' | 'none'
}

/**
 * Product search result — used when adding items to favorites.
 */
export interface ProductSearchResult {
  productName: string
  category: Category
  store: Store
}
