import { createAnonClient } from '@/lib/supabase/anon-server'
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
  is_active: boolean
  updated_at: string
}

const SELECT_COLUMNS =
  'id,store,product_name,category,category_slug,sub_category,sale_price,original_price,discount_percent,price_per_unit,canonical_unit,format,image_url,valid_from,valid_to,source_url,product_id,taxonomy_confidence,is_active,updated_at'

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

function mapRow(row: DealRow): Deal | null {
  if (!isStoreKey(row.store)) return null
  const category = CATEGORY_ALIAS[row.category]
  if (!category) return null
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
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }
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
