import { createAnonClient } from '@/lib/supabase/anon-server'
import { type CropRegion, createCropRegion } from '@/lib/domain/crop-region'
import { createPriceBasis } from '@/lib/domain/price-basis'
import { isOk } from '@/lib/domain/result'
import { parseStorageState } from '@/lib/domain/storage-state'
import { STORE_KEYS, type StoreKey } from '@/lib/store-tokens'
import type { Deal, DealCategory, SnapshotInput, WeeklySnapshot } from '@/lib/types'

import { ACTIVE_CATEGORIES } from '@/lib/category-rules'

import { computeAllVerdicts } from '../verdict/algorithm'

import type { DealsProvider } from './provider.contract'

type DealRow = {
  id: string
  store: string
  product_name: string
  category: string
  category_slug: string | null
  sub_category: string | null
  sale_price: number
  original_price: number | null
  discount_percent: number
  price_per_unit: number | null
  canonical_unit: string | null
  format: string | null
  image_url: string | null
  valid_from: string
  valid_to: string
  source_url: string | null
  product_id: string
  taxonomy_confidence: number
  is_uncertain: boolean | null
  storage: string | null
  price_basis: string | null
  loyalty_programme: string | null
  page_image_url: string | null
  crop_x: number | null
  crop_y: number | null
  crop_w: number | null
  crop_h: number | null
  attributes: Record<string, unknown> | null
  is_active: boolean
  updated_at: string
}

const SELECT_COLUMNS =
  'id,store,product_name,category,category_slug,sub_category,sale_price,original_price,discount_percent,price_per_unit,canonical_unit,format,image_url,valid_from,valid_to,source_url,product_id,taxonomy_confidence,is_uncertain,storage,price_basis,loyalty_programme,page_image_url,crop_x,crop_y,crop_w,crop_h,attributes,is_active,updated_at'

// Pipeline (basketch/pipeline/categorize.ts) writes DB-side category labels that
// don't match the spec's identifiers. Normalise here at the read boundary so
// web-next can use the cleaner names everywhere downstream.
const CATEGORY_ALIAS: Record<string, DealCategory> = {
  fresh: 'fresh',
  'long-life': 'longlife',
  longlife: 'longlife',
  'non-food': 'household',
  household: 'household',
}

// Supabase / PostgREST hard-caps a single response at max-rows (1000 by default).
// We page through results in chunks.
const PAGE_SIZE = 1000
const MAX_PAGES = 10

const isStoreKey = (s: string): s is StoreKey => (STORE_KEYS as readonly string[]).includes(s)

/**
 * The anti-corruption layer.
 *
 * Database vocabulary — `price_basis` beside `loyalty_programme`, `crop_x`,
 * snake_case, nullable columns that are only meaningful in pairs — dies here.
 * What comes out is domain value objects whose invariants have already been
 * checked, so nothing downstream has to remember to check them again.
 *
 * Returns null when the row cannot be turned into a deal we can honestly show.
 * The caller counts those rather than letting them vanish.
 */
export function mapRow(row: DealRow): Deal | null {
  if (!isStoreKey(row.store)) return null
  const category = CATEGORY_ALIAS[row.category]
  if (!category) return null

  // A member price we cannot label is the one row we refuse outright. Showing
  // it unlabelled is the Art. 3(1)(e) UWG problem; showing it as an open price
  // is worse. The database CHECK means it should be unreachable — if it ever
  // fires, the constraint has been bypassed and that is worth seeing.
  const priceBasis = createPriceBasis(row.price_basis, row.loyalty_programme)
  if (!isOk(priceBasis)) {
    console.error(`[supabase-provider] dropping deal ${row.id}: ${priceBasis.error}`)
    return null
  }

  return {
    id: row.id,
    store: row.store,
    productName: row.product_name,
    category,
    categorySlug: row.category_slug,
    subCategory: row.sub_category,
    salePrice: Number(row.sale_price),
    originalPrice: row.original_price == null ? null : Number(row.original_price),
    discountPercent: Number(row.discount_percent),
    pricePerUnit: row.price_per_unit == null ? null : Number(row.price_per_unit),
    canonicalUnit: row.canonical_unit,
    format: row.format,
    imageUrl: row.image_url,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    sourceUrl: row.source_url,
    productId: row.product_id,
    taxonomyConfidence: Number(row.taxonomy_confidence),
    // Defaults keep rows written before the 2026-09-11 migration readable.
    isUncertain: row.is_uncertain ?? false,
    storage: parseStorageState(row.storage),
    priceBasis: priceBasis.value,
    crop: toCropRegion(row),
    attributes: row.attributes ?? {},
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }
}

/**
 * A crop is only usable when the page url AND all four fractions are present
 * and describe a rectangle that is actually on the page.
 *
 * Both halves matter. A partial crop renders as a wrong rectangle over someone
 * else's product photograph, which is worse than showing no image at all — so
 * a region the domain refuses becomes no image, never a guess.
 */
function toCropRegion(row: DealRow): CropRegion | null {
  const { page_image_url, crop_x, crop_y, crop_w, crop_h } = row
  if (!page_image_url) return null
  if (crop_x == null || crop_y == null || crop_w == null || crop_h == null) return null

  const region = createCropRegion({
    pageImageUrl: page_image_url,
    x: Number(crop_x),
    y: Number(crop_y),
    width: Number(crop_w),
    height: Number(crop_h),
  })

  if (!isOk(region)) {
    // Loud, because a stored crop that the domain rejects means the pipeline
    // wrote a rectangle it should not have.
    console.error(`[supabase-provider] unusable crop on deal ${row.id}: ${region.error}`)
    return null
  }
  return region.value
}

class SupabaseDealsProvider implements DealsProvider {
  async getWeeklySnapshot(input: SnapshotInput = {}): Promise<WeeklySnapshot> {
    const region = input.region ?? 'all'
    const locale = input.locale ?? 'de'
    const today = new Date().toISOString().slice(0, 10)

    const supabase = createAnonClient()
    // Pull active, non-expired rows in pages of 1000 (PostgREST max).
    // Region filtering is post-fetch for now; a canton column can replace this
    // once the data layer supports it (M4+).
    let allRows: DealRow[] = []
    let error: Error | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const result = await supabase
        .from('deals')
        .select(SELECT_COLUMNS)
        .eq('is_active', true)
        .gte('valid_to', today)
        .order('discount_percent', { ascending: false })
        .range(from, to)

      if (result.error) {
        error = result.error as unknown as Error
        break
      }
      const rows = (result.data ?? []) as DealRow[]
      allRows = allRows.concat(rows)
      if (rows.length < PAGE_SIZE) break
    }

    if (error) {
      // Fail soft: return an empty snapshot so the page can render a stale-data banner.
      return {
        updatedAt: new Date().toISOString(),
        totalDeals: 0,
        region,
        locale,
        stores: [],
        categories: ACTIVE_CATEGORIES.map((category) => ({
          category,
          state: 'no-data' as const,
          winner: null,
          avgDiscountPct: 0,
          dealCount: 0,
          storeScores: [],
        })),
        deals: [],
      }
    }

    const deals: Deal[] = []
    for (const row of allRows) {
      const mapped = mapRow(row)
      if (mapped) deals.push(mapped)
    }

    const storeCounts = new Map<StoreKey, number>()
    let latestUpdate = ''
    for (const d of deals) {
      storeCounts.set(d.store, (storeCounts.get(d.store) ?? 0) + 1)
      if (d.updatedAt > latestUpdate) latestUpdate = d.updatedAt
    }

    return {
      updatedAt: latestUpdate || new Date().toISOString(),
      totalDeals: deals.length,
      region,
      locale,
      stores: STORE_KEYS.map((store) => ({ store, dealCount: storeCounts.get(store) ?? 0 })),
      categories: computeAllVerdicts(deals, ACTIVE_CATEGORIES),
      deals,
    }
  }
}

export const supabaseDealsProvider: DealsProvider = new SupabaseDealsProvider()
