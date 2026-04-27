// Backfill the v3 concept layer from existing v3.2 `deals` rows.
//
// Strategy (coarse first pass):
//   1. Read every active `deals` row.
//   2. For each unique sub_category, create a `concept_family` (idempotent).
//   3. For each unique product_name, create a `concept` (one-per-name; no
//      cross-store deduplication yet — that's a follow-up requiring a real
//      resolver).
//   4. For each unique (product_name, store), create a `sku`.
//   5. Set sku.last_deal_seen_at = max(deals.created_at) for that sku.
//   6. Backfill deals.sku_id.
//
// Idempotent: re-runnable; uses upsert on natural keys. Skips rows already
// matched. Run via: cd pipeline && npx tsx migrate/seed-v3-from-deals.ts

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type DealRow = {
  id: string
  store: string
  product_name: string
  sub_category: string | null
  category: string | null
  category_slug: string | null
  sale_price: number | null
  original_price: number | null
  created_at: string
  sku_id: string | null
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

function titleCase(s: string): string {
  return s
    .split(/[-\s]/)
    .map((w) => {
      if (!w || w.length === 0) return ''
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

function regionForStore(store: string): string {
  if (store === 'migros') return 'aare'
  if (store === 'coop') return 'all'
  return `${store}-all`
}

async function fetchAllDeals(): Promise<DealRow[]> {
  const all: DealRow[] = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await supabase
      .from('deals')
      .select('id, store, product_name, sub_category, category, category_slug, sale_price, original_price, created_at, sku_id')
      .eq('is_active', true)
      .range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as DealRow[]))
    if (data.length < page) break
    from += page
  }
  return all
}

async function ensureConceptFamilies(deals: DealRow[]): Promise<Set<string>> {
  // Pre-fetch valid taxonomy_subcategory and taxonomy_category slugs so we
  // only set the FK columns when the deals string actually matches the
  // curated taxonomy. (Most deals.sub_category strings come from the
  // categorizer's free-text output, not the taxonomy list.)
  const { data: subcatRows } = await supabase.from('taxonomy_subcategory').select('slug')
  const { data: catRows } = await supabase.from('taxonomy_category').select('slug')
  const validSubcats = new Set((subcatRows ?? []).map((r) => r.slug))
  const validCats = new Set((catRows ?? []).map((r) => r.slug))

  const families = new Map<string, { slug: string; display_name: string; category_slug: string | null; subcategory_slug: string | null }>()
  for (const d of deals) {
    if (!d.sub_category) continue
    const slug = d.sub_category
    if (families.has(slug)) continue
    families.set(slug, {
      slug,
      display_name: titleCase(slug.replace(/-/g, ' ')),
      category_slug: d.category_slug && validCats.has(d.category_slug) ? d.category_slug : null,
      subcategory_slug: validSubcats.has(slug) ? slug : null,
    })
  }
  if (families.size === 0) return new Set()
  const rows = Array.from(families.values()).map((f) => ({ ...f, in_starter_pack: false, sort_order: 0 }))
  const { error } = await supabase.from('concept_family').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })
  if (error) throw error
  console.log(`  ensured ${rows.length} concept_family rows (${rows.filter((r) => r.subcategory_slug).length} mapped to taxonomy)`)
  return new Set(families.keys())
}

async function upsertConcepts(deals: DealRow[], existingFamilies: Set<string>): Promise<Map<string, string>> {
  // Map: normalized concept_slug → concept.id
  const conceptByName = new Map<string, { slug: string; display_name: string; family_slug: string }>()
  for (const d of deals) {
    if (!d.sub_category || !existingFamilies.has(d.sub_category)) continue
    const slug = slugify(`${d.sub_category}-${d.product_name}`).slice(0, 200)
    if (conceptByName.has(slug)) continue
    conceptByName.set(slug, {
      slug,
      display_name: d.product_name,
      family_slug: d.sub_category,
    })
  }
  if (conceptByName.size === 0) return new Map()

  const rows = Array.from(conceptByName.values())
  const inserted = new Map<string, string>()

  // Insert in chunks of 500 to keep payloads small.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await supabase
      .from('concept')
      .upsert(chunk, { onConflict: 'slug' })
      .select('id, slug')
    if (error) throw error
    for (const r of data ?? []) inserted.set(r.slug, r.id)
  }
  console.log(`  upserted ${inserted.size} concept rows`)
  return inserted
}

async function upsertSkus(
  deals: DealRow[],
  conceptIdBySlug: Map<string, string>,
): Promise<Map<string, string>> {
  // Map: `${concept_id}|${store}|${region}` → sku.id
  type SkuKey = string
  type SkuRow = {
    concept_id: string
    store_slug: string
    region_slug: string
    source_product_id: string
    source_product_name: string
    regular_price: number | null
    last_deal_seen_at: string
  }

  const skuByKey = new Map<SkuKey, SkuRow & { _key: SkuKey }>()
  for (const d of deals) {
    if (!d.sub_category) continue
    const conceptSlug = slugify(`${d.sub_category}-${d.product_name}`).slice(0, 200)
    const conceptId = conceptIdBySlug.get(conceptSlug)
    if (!conceptId) continue
    const region = regionForStore(d.store)
    const key = `${conceptId}|${d.store}|${region}|${d.product_name}`
    const existing = skuByKey.get(key)
    if (existing) {
      // Keep most-recent last_deal_seen_at and any non-null regular_price.
      if (d.created_at > existing.last_deal_seen_at) existing.last_deal_seen_at = d.created_at
      if (existing.regular_price === null && d.original_price !== null) existing.regular_price = d.original_price
      continue
    }
    skuByKey.set(key, {
      concept_id: conceptId,
      store_slug: d.store,
      region_slug: region,
      source_product_id: d.product_name,  // best-effort; real source IDs land via pipeline cutover
      source_product_name: d.product_name,
      regular_price: d.original_price,
      last_deal_seen_at: d.created_at,
      _key: key,
    })
  }

  const inserted = new Map<SkuKey, string>()
  const rows = Array.from(skuByKey.values()).map(({ _key, ...rest }) => rest)
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await supabase
      .from('sku')
      .upsert(chunk, { onConflict: 'concept_id,store_slug,region_slug,source_product_id' })
      .select('id, concept_id, store_slug, region_slug, source_product_id')
    if (error) throw error
    for (const r of data ?? []) {
      const key = `${r.concept_id}|${r.store_slug}|${r.region_slug}|${r.source_product_id}`
      inserted.set(key, r.id)
    }
  }
  console.log(`  upserted ${inserted.size} sku rows`)
  return inserted
}

async function backfillDealsSkuId(deals: DealRow[], skuIdByKey: Map<string, string>) {
  let linked = 0
  for (let i = 0; i < deals.length; i += 200) {
    const chunk = deals.slice(i, i + 200)
    for (const d of chunk) {
      if (d.sku_id || !d.sub_category) continue
      const conceptSlug = slugify(`${d.sub_category}-${d.product_name}`).slice(0, 200)
      // Reverse-lookup: we need conceptId for the deal's product_name+sub_category.
      // We didn't keep conceptIdBySlug here; cheaper to look up via the sku map key prefix.
      // Build the key we expect:
      const region = regionForStore(d.store)
      // Find the matching SKU id by scanning — small chunk so OK; or build a precomputed map upstream.
      // For correctness we reuse the same algorithm to compose the lookup key.
      // (We pass conceptId via the sku map only — so reconstruct key from product_name.)
      // Optimisation note: pre-build a conceptSlug → conceptId map at call time.
      // For simplicity here, query sku once.
      void conceptSlug; void region
    }
    // Optimised path: bulk update via SQL CTE-style query is tricky via REST.
    // We do per-deal updates only when batches > 0.
    linked += 0  // placeholder; per-deal update implemented below.
  }

  // Optimised approach: build a map of (store, region, source_product_id) → sku_id
  // using the sku_id map keys (which are concept_id|store|region|source_product_id).
  // From those, we can derive sku for each deal.
  const skuByDealKey = new Map<string, string>()
  for (const [key, skuId] of Array.from(skuIdByKey.entries())) {
    const [, store, region, source_product_id] = key.split('|')
    skuByDealKey.set(`${store}|${region}|${source_product_id}`, skuId)
  }

  for (const d of deals) {
    if (d.sku_id) continue
    const region = regionForStore(d.store)
    const lookupKey = `${d.store}|${region}|${d.product_name}`
    const skuId = skuByDealKey.get(lookupKey)
    if (!skuId) continue
    const { error } = await supabase.from('deals').update({ sku_id: skuId }).eq('id', d.id)
    if (error) {
      console.error(`  failed to update deal ${d.id}: ${error.message}`)
      continue
    }
    linked++
  }
  console.log(`  linked ${linked} deals.sku_id`)
}

async function refreshMaterialisedViews() {
  // Refresh both MVs after backfill so frontend has fresh denormalised data.
  for (const mv of ['concept_cheapest_now', 'worth_picking_up_candidates']) {
    const { error } = await supabase.rpc('exec_refresh_mv', { view_name: mv })
    if (error) {
      // RPC doesn't exist yet — skip silently. Builder/operator can refresh manually.
      console.log(`  (skipped MV refresh for ${mv}: ${error.message})`)
    } else {
      console.log(`  refreshed ${mv}`)
    }
  }
}

async function main() {
  console.log('v3 backfill — starting')
  console.log('1/5  fetching active deals…')
  const deals = await fetchAllDeals()
  console.log(`     fetched ${deals.length} active deals`)

  console.log('2/5  ensuring concept_family rows…')
  const families = await ensureConceptFamilies(deals)

  console.log('3/5  upserting concept rows…')
  const conceptIdBySlug = await upsertConcepts(deals, families)

  console.log('4/5  upserting sku rows…')
  const skuIdByKey = await upsertSkus(deals, conceptIdBySlug)

  console.log('5/5  backfilling deals.sku_id…')
  await backfillDealsSkuId(deals, skuIdByKey)

  console.log('refreshing materialised views…')
  await refreshMaterialisedViews()

  console.log('v3 backfill — done')
}

main().catch((err) => {
  console.error('backfill failed:', err)
  process.exit(1)
})
