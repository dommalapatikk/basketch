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
  /**
   * How many items must be bought for `salePrice` to apply — Migros's
   * "ab N Stück" (WP-C4, Tech Lead ruling D2, PM decision TP-7a).
   *
   * `null` is the ordinary single-item price, the ordinary case. A value of
   * 2 or more must ALWAYS be shown with its "from N items" label
   * (`lib/format.ts` `formatMinQuantityLabel`) — never bare — and never
   * votes in the category verdict or wears the "Cheapest" tag
   * (`lib/domain/votes-in-verdict.ts`).
   *
   * Optional, not required: `mapRow` (`server/data/supabase-provider.ts`)
   * reads a row with no `min_quantity` key at all as `null` — see that
   * file's own comment on `SELECT_COLUMNS` for the deploy-ordering
   * constraint this depends on
   * (`supabase/migrations/20260916_quantity_requirement.sql` must be
   * applied before this code is deployed, not merely before it is read).
   */
  minQuantity?: number | null
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
  /**
   * The Zurich calendar date (`YYYY-MM-DD`) this snapshot was built against —
   * see `lib/domain/validity.ts`. Computed once, server-side, and carried on
   * the snapshot so every client-side consumer of `deals` (buildSections,
   * onlyStoreSubCategories) agrees with the category verdicts already baked
   * into `categories` about what "today" means, even though the snapshot
   * itself may be served from up to an hour-old cache.
   */
  today: string
  /**
   * True only for the fail-soft empty snapshot `SupabaseDealsProvider`
   * returns when the deals query itself errors (server/data/supabase-
   * provider.ts) — NOT "zero deals matched the filters", a real and
   * unremarkable state `totalDeals === 0` already covers on its own.
   *
   * Code review of 422bd51/F1: that fail-soft branch used to set
   * `updatedAt: new Date().toISOString()` — a snapshot that failed
   * completely read as "0 deals, updated just now", which made
   * `StaleBanner`'s own `isStale(updatedAt)` check pass (not stale) over a
   * page that could not load any data at all. A Playwright run against this
   * exact outage reported green because of it. `isDegraded` is the explicit
   * signal `StaleBanner` now also checks, independent of `updatedAt`'s age
   * — an outage a moment old is still an outage, not "fresh".
   *
   * Optional, defaulting to "not degraded" when absent: every existing
   * fixture that builds a `WeeklySnapshot` by hand (tests) describes a
   * successful snapshot and should not have to say so explicitly, the same
   * "claims less" reasoning `Deal.minQuantity` and `PriceBasis` already use
   * for an absent field.
   */
  isDegraded?: boolean
}

export type SnapshotInput = {
  region?: string
  locale?: string
}
