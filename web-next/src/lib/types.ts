import type { CategoryKey, StoreKey } from './store-tokens'

// The value objects live in lib/domain, where their invariants are enforced in
// the constructor rather than by whoever renders them. Re-exported here so the
// read-side shape stays one import for consumers.
export type { CropRegion } from './domain/crop-region'
export type { PriceBasis } from './domain/price-basis'
export type { StorageState } from './domain/storage-state'

import type { CropRegion } from './domain/crop-region'
import type { PriceBasis } from './domain/price-basis'
import type { StorageState } from './domain/storage-state'

export type DealCategory = 'fresh' | 'longlife' | 'household'

// Read-side shape after camelCase mapping from the deals table.
// Mirrors web-next's needs only — does NOT cover all DB columns.
export type Deal = {
  id: string
  store: StoreKey
  productName: string
  category: DealCategory
  // Patch F: mid-level Category slug (drinks, snacks-sweets, ...). Null when
  // pipeline couldn't map sub_category through taxonomy_alias — those deals
  // still render under their Type but have no Category to filter by.
  // Optional in the type to keep existing test fixtures + read paths working;
  // supabase-provider.mapRow always sets it explicitly (non-undefined).
  categorySlug?: string | null
  subCategory: string | null
  salePrice: number
  originalPrice: number | null
  discountPercent: number
  pricePerUnit: number | null
  canonicalUnit: string | null
  format: string | null
  imageUrl: string | null
  validFrom: string
  validTo: string
  sourceUrl: string | null
  productId: string
  taxonomyConfidence: number
  /**
   * True when the classifier was not confident.
   *
   * The DEAL is still shown — only its category label is hidden. The old
   * pipeline deleted these products outright, which is how tomato purée sat in
   * fresh vegetables for months with nobody able to see anything was wrong.
   */
  isUncertain: boolean
  /** Null when the retailer did not state it. Never "ambient by default". */
  storage: StorageState | null
  /**
   * Who can pay this price.
   *
   * A value object, not a string beside a nullable programme name: the LIDL
   * rule says a member price must NAME its programme, and the union makes the
   * programme reachable only through the branch that has one. There is no
   * unlabelled member price to render because there is no way to build one.
   */
  priceBasis: PriceBasis
  /** Set for flyer-sourced deals (Spar, Aldi, Migros) instead of imageUrl. */
  crop: CropRegion | null
  /** Per-category metadata: milk fat %, butter salted, wine vintage. */
  attributes: Record<string, unknown>
  isActive: boolean
  updatedAt: string
}

export type CategoryVerdictState = 'winner' | 'tied' | 'single-store' | 'no-data'

export type StoreScore = {
  store: StoreKey
  avgDiscountPct: number
  dealCount: number
}

export type CategoryVerdict = {
  category: DealCategory | CategoryKey
  state: CategoryVerdictState
  winner: StoreKey | null
  avgDiscountPct: number
  dealCount: number
  storeScores: StoreScore[]
}

export type StoreSummary = { store: StoreKey; dealCount: number }

export type WeeklySnapshot = {
  updatedAt: string
  totalDeals: number
  region: string
  locale: string
  stores: StoreSummary[]
  categories: CategoryVerdict[]
  deals: Deal[]
}

export type SnapshotInput = {
  region?: string
  locale?: string
}
