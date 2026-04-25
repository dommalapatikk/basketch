import type { CategoryKey, StoreKey } from './store-tokens'

export type DealCategory = 'fresh' | 'longlife' | 'household'

// Read-side shape after camelCase mapping from the deals table.
// Mirrors web-next's needs only — does NOT cover all DB columns.
export type Deal = {
  id: string
  store: StoreKey
  productName: string
  category: DealCategory
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
