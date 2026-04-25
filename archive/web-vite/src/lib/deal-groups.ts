// web/src/lib/deal-groups.ts — pure helpers for grouping deals into bands.
// Kept free of React and Supabase imports so it can be unit-tested without
// env setup (VITE_SUPABASE_URL/KEY are required to import queries → supabase).

import type { DealRow, Store } from '@shared/types'

import type { BandDeal } from '../components/SubCategoryBand'

// Sub-category display metadata — emoji + label per DB sub_category value.
export const SUB_CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  fruit: { label: 'Fruit', emoji: '🍎' },
  vegetables: { label: 'Vegetables', emoji: '🥦' },
  meat: { label: 'Meat', emoji: '🥩' },
  poultry: { label: 'Poultry', emoji: '🍗' },
  fish: { label: 'Fish', emoji: '🐟' },
  deli: { label: 'Deli', emoji: '🧆' },
  dairy: { label: 'Dairy', emoji: '🥛' },
  eggs: { label: 'Eggs', emoji: '🥚' },
  bread: { label: 'Bakery', emoji: '🍞' },
  snacks: { label: 'Snacks', emoji: '🍿' },
  chocolate: { label: 'Chocolate', emoji: '🍫' },
  'pasta-rice': { label: 'Pasta & Rice', emoji: '🍝' },
  water: { label: 'Water', emoji: '💧' },
  juice: { label: 'Juice', emoji: '🧃' },
  beer: { label: 'Beer', emoji: '🍺' },
  wine: { label: 'Wine', emoji: '🍷' },
  'soft-drinks': { label: 'Soft Drinks', emoji: '🥤' },
  coffee: { label: 'Coffee', emoji: '☕' },
  tea: { label: 'Tea', emoji: '🍵' },
  drinks: { label: 'Drinks', emoji: '🧃' },
  'coffee-tea': { label: 'Coffee & Tea', emoji: '☕' },
  'ready-meals': { label: 'Ready Meals', emoji: '🍕' },
  frozen: { label: 'Frozen', emoji: '🧊' },
  canned: { label: 'Canned Goods', emoji: '🥫' },
  condiments: { label: 'Condiments', emoji: '🧂' },
  cleaning: { label: 'Cleaning', emoji: '🧹' },
  laundry: { label: 'Laundry', emoji: '🧺' },
  'paper-goods': { label: 'Paper Goods', emoji: '🧻' },
  household: { label: 'Household', emoji: '🏠' },
  'personal-care': { label: 'Personal Care', emoji: '🧴' },
}

/**
 * Group key used for deals whose sub_category is null. Rendered as "Other"
 * per v4 spec §13. The literal underscore must never leak into the DOM.
 */
export const OTHER_BAND_KEY = 'other'
export const OTHER_LABEL = 'Other'
export const OTHER_EMOJI = '📦'

/**
 * Map a single DealRow to a BandDeal, copying v4 format fields when present.
 * Null DB columns become undefined on the view model per view-model conventions.
 */
function rowToBandDeal(deal: DealRow, hasPromo: boolean): BandDeal {
  return {
    id: deal.id,
    store: deal.store,
    productName: deal.product_name,
    salePrice: deal.sale_price,
    regularPrice: deal.original_price,
    discountPercent: deal.discount_percent,
    hasPromo,
    pricePerUnit: deal.price_per_unit ?? undefined,
    canonicalUnit: deal.canonical_unit ?? undefined,
    format: deal.format ?? undefined,
    container: deal.container ?? undefined,
    packSize: deal.pack_size ?? undefined,
    unitVolumeMl: deal.unit_volume_ml ?? undefined,
    imageUrl: deal.image_url,
  }
}

export interface BandGroup {
  subCategory: string
  label: string
  emoji: string
  bandDeals: BandDeal[]
  /** Total raw deal count in this sub-category before per-store collapsing. */
  totalDealCount: number
}

/**
 * Group DealRows by sub_category and map them to BandDeal[].
 * Returns an array of band data sorted by promo count (most promos first).
 * Deals with null sub_category are bucketed under a single "Other" band so
 * the literal `_uncategorised` key never reaches the UI.
 * Each band also carries `totalDealCount` (the raw count before per-store
 * collapsing) so headers can render "N stores · best per store · See all M →".
 */
export function groupDealsBySubCategory(deals: DealRow[]): BandGroup[] {
  const grouped = new Map<string, DealRow[]>()

  for (const deal of deals) {
    const key = deal.sub_category ?? OTHER_BAND_KEY
    const existing = grouped.get(key) ?? []
    existing.push(deal)
    grouped.set(key, existing)
  }

  const bands: BandGroup[] = []

  for (const [key, groupDeals] of grouped) {
    const meta = SUB_CATEGORY_META[key]
    const label = key === OTHER_BAND_KEY
      ? OTHER_LABEL
      : (meta?.label ?? key.replace(/-/g, ' '))
    const emoji = key === OTHER_BAND_KEY
      ? OTHER_EMOJI
      : (meta?.emoji ?? '📦')

    // Per-store best deal: cheapest promo deal per store, then cheapest regular per store
    const storePromoMap = new Map<Store, DealRow>()
    const storeRegularMap = new Map<Store, DealRow>()

    for (const deal of groupDeals) {
      const hasPromo = deal.discount_percent > 0
      if (hasPromo) {
        const existing = storePromoMap.get(deal.store)
        if (!existing || deal.sale_price < existing.sale_price) {
          storePromoMap.set(deal.store, deal)
        }
      } else {
        const existing = storeRegularMap.get(deal.store)
        if (!existing || deal.sale_price < existing.sale_price) {
          storeRegularMap.set(deal.store, deal)
        }
      }
    }

    const bandDeals: BandDeal[] = []

    const promoDeals = [...storePromoMap.values()].sort((a, b) => a.sale_price - b.sale_price)
    for (const deal of promoDeals) {
      bandDeals.push(rowToBandDeal(deal, true))
    }

    const regularDeals = [...storeRegularMap.values()]
      .filter((d) => !storePromoMap.has(d.store))
      .sort((a, b) => a.sale_price - b.sale_price)
    for (const deal of regularDeals) {
      bandDeals.push(rowToBandDeal(deal, false))
    }

    if (bandDeals.length > 0) {
      bands.push({ subCategory: key, label, emoji, bandDeals, totalDealCount: groupDeals.length })
    }
  }

  return bands.sort((a, b) => {
    const aPromos = a.bandDeals.filter((d) => d.hasPromo).length
    const bPromos = b.bandDeals.filter((d) => d.hasPromo).length
    return bPromos - aPromos
  })
}
