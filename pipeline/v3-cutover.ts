// v3 cutover: populates the new concept/sku layer + deals.sku_id from the
// freshly-stored deals. Runs at end of pipeline/run.ts as an additive step,
// so legacy v3.2 storage stays intact (per migration plan phase 3).
//
// Resolution strategy:
//   1. Apply concept_resolver rules (priority asc) to remap incoming product
//      strings to a canonical concept (e.g. "Almo Thunfisch" → cat-food, not
//      fish). Highest-priority match wins.
//   2. If no rule matched, fall back to one-concept-per-(sub_category +
//      product_name), mirroring the backfill heuristic.
//   3. Upsert sku rows on (concept_id, store, region, source_product_id).
//   4. Set sku.last_deal_seen_at = max(deal.created_at) for that sku.
//   5. Backfill deals.sku_id for rows just stored.
//   6. Refresh both materialised views.

import { supabase } from './supabase-client'
import type { Deal } from '../shared/types'

type ResolverRule = {
  id: string
  rule_type: 'exact' | 'contains' | 'regex' | 'brand' | 'multipack'
  pattern: string
  concept_id: string | null
  priority: number
  is_active: boolean
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200)
}

function regionForStore(store: string): string {
  if (store === 'migros') return 'aare'
  if (store === 'coop') return 'all'
  return `${store}-all`
}

function applyResolver(productName: string, rules: ResolverRule[]): string | null {
  // rules already sorted asc by priority; first match wins
  for (const r of rules) {
    if (!r.is_active || !r.concept_id) continue
    const haystack = productName.toLowerCase()
    const needle = r.pattern.toLowerCase()
    if (r.rule_type === 'exact' && haystack === needle) return r.concept_id
    if (r.rule_type === 'contains' && haystack.includes(needle)) return r.concept_id
    if (r.rule_type === 'brand' && haystack.includes(needle)) return r.concept_id
    if (r.rule_type === 'multipack' && /\b\d+\s*[x×]\s*\d/.test(haystack) && haystack.includes(needle)) return r.concept_id
    if (r.rule_type === 'regex') {
      try {
        if (new RegExp(r.pattern, 'i').test(productName)) return r.concept_id
      } catch {
        // bad regex — skip
      }
    }
  }
  return null
}

async function loadResolverRules(): Promise<ResolverRule[]> {
  const { data, error } = await supabase
    .from('concept_resolver')
    .select('id, rule_type, pattern, concept_id, priority, is_active')
    .eq('is_active', true)
    .order('priority', { ascending: true })
  if (error) {
    console.error('[v3] could not load concept_resolver rules:', error.message)
    return []
  }
  return (data ?? []) as ResolverRule[]
}

async function loadValidTaxonomySubcats(): Promise<Set<string>> {
  const { data } = await supabase.from('taxonomy_subcategory').select('slug')
  return new Set((data ?? []).map((r) => r.slug))
}

async function ensureConceptFamily(
  subCategory: string,
  categorySlug: string | null,
  validSubcats: Set<string>,
  cache: Set<string>,
): Promise<boolean> {
  if (cache.has(subCategory)) return true
  const { error } = await supabase.from('concept_family').upsert(
    {
      slug: subCategory,
      display_name: subCategory.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      category_slug: categorySlug,
      subcategory_slug: validSubcats.has(subCategory) ? subCategory : null,
      in_starter_pack: false,
      sort_order: 0,
    },
    { onConflict: 'slug', ignoreDuplicates: true },
  )
  if (error) {
    console.error(`[v3] failed to ensure concept_family ${subCategory}:`, error.message)
    return false
  }
  cache.add(subCategory)
  return true
}

async function ensureConcept(
  productName: string,
  subCategory: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const slug = slugify(`${subCategory}-${productName}`).slice(0, 200)
  const cached = cache.get(slug)
  if (cached) return cached
  const { data, error } = await supabase
    .from('concept')
    .upsert(
      { slug, display_name: productName, family_slug: subCategory },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()
  if (error || !data) {
    console.error(`[v3] failed to upsert concept ${slug}:`, error?.message)
    return null
  }
  cache.set(slug, data.id)
  return data.id
}

async function ensureSku(input: {
  conceptId: string
  store: string
  region: string
  sourceProductId: string
  sourceProductName: string
  regularPrice: number | null
  lastDealSeenAt: string
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('sku')
    .upsert(
      {
        concept_id: input.conceptId,
        store_slug: input.store,
        region_slug: input.region,
        source_product_id: input.sourceProductId,
        source_product_name: input.sourceProductName,
        regular_price: input.regularPrice,
        last_deal_seen_at: input.lastDealSeenAt,
      },
      { onConflict: 'concept_id,store_slug,region_slug,source_product_id' },
    )
    .select('id')
    .single()
  if (error || !data) {
    console.error('[v3] failed to upsert sku:', error?.message)
    return null
  }
  return data.id
}

async function backfillRecentDealsSkuId(deals: Deal[], skuByDeal: Map<string, string>) {
  // For each deal, find its DB row by (store, product_name, valid_from) and
  // update sku_id. The existing storeDeals upsert returns no IDs, so we read
  // back via a single query.
  if (deals.length === 0) return 0
  let linked = 0
  for (let i = 0; i < deals.length; i += 100) {
    const chunk = deals.slice(i, i + 100)
    // Query DB rows for this chunk
    const productNames = Array.from(new Set(chunk.map((d) => d.productName)))
    const stores = Array.from(new Set(chunk.map((d) => d.store)))
    const { data, error } = await supabase
      .from('deals')
      .select('id, store, product_name, valid_from, sku_id')
      .in('store', stores)
      .in('product_name', productNames)
      .eq('is_active', true)
    if (error) {
      console.error('[v3] failed to read back deals:', error.message)
      continue
    }
    for (const row of data ?? []) {
      const key = `${row.store}|${row.product_name}`
      const skuId = skuByDeal.get(key)
      if (!skuId || row.sku_id === skuId) continue
      const { error: updateErr } = await supabase
        .from('deals')
        .update({ sku_id: skuId })
        .eq('id', row.id)
      if (!updateErr) linked++
    }
  }
  return linked
}

async function refreshMvs() {
  for (const view of ['concept_cheapest_now', 'worth_picking_up_candidates']) {
    const { error } = await supabase.rpc('exec_refresh_mv', { view_name: view })
    if (error) {
      console.error(`[v3] failed to refresh ${view}:`, error.message)
    } else {
      console.log(`[v3] refreshed ${view}`)
    }
  }
}

/**
 * Main entry — run after storeDeals(). Resolves every deal to concept+sku,
 * sets deals.sku_id, refreshes MVs. Idempotent.
 */
export async function populateV3Layer(deals: Deal[]): Promise<{
  concepts_resolved: number
  skus_upserted: number
  deals_linked: number
}> {
  if (deals.length === 0) {
    return { concepts_resolved: 0, skus_upserted: 0, deals_linked: 0 }
  }

  console.log('[v3] cutover step — resolving concepts + skus for', deals.length, 'deals')

  const rules = await loadResolverRules()
  const validSubcats = await loadValidTaxonomySubcats()
  const familyCache = new Set<string>()
  const conceptCache = new Map<string, string>()
  const skuByDeal = new Map<string, string>()

  let conceptsResolved = 0
  let skusUpserted = 0
  const now = new Date().toISOString()

  for (const deal of deals) {
    const subCategory = deal.subCategory
    if (!subCategory) continue

    // Step 1: try resolver rules first (highest priority wins).
    let conceptId = applyResolver(deal.productName, rules)

    // Step 2: fallback to one-concept-per-(sub_category + product_name).
    if (!conceptId) {
      await ensureConceptFamily(subCategory, deal.categorySlug ?? null, validSubcats, familyCache)
      conceptId = await ensureConcept(deal.productName, subCategory, conceptCache)
    }
    if (!conceptId) continue
    conceptsResolved++

    // Step 3: upsert sku.
    const skuId = await ensureSku({
      conceptId,
      store: deal.store,
      region: regionForStore(deal.store),
      sourceProductId: deal.productName,
      sourceProductName: deal.productName,
      regularPrice: deal.originalPrice ?? null,
      lastDealSeenAt: now,
    })
    if (!skuId) continue
    skusUpserted++
    skuByDeal.set(`${deal.store}|${deal.productName}`, skuId)
  }

  // Step 4: backfill deals.sku_id for rows just stored.
  const dealsLinked = await backfillRecentDealsSkuId(deals, skuByDeal)
  console.log(`[v3] linked ${dealsLinked} deals.sku_id`)

  // Step 5: refresh both materialised views.
  await refreshMvs()

  return {
    concepts_resolved: conceptsResolved,
    skus_upserted: skusUpserted,
    deals_linked: dealsLinked,
  }
}
