// supabaseCatalogueStore — the real `CatalogueStore` (ARCH-X §2.2,
// "infrastructure/supabase-catalogue-store.ts"). Batched upserts; every id is
// mapped back to its draft BY NATURAL KEY, never by response order —
// PostgREST does not promise to return rows in input order (C-5).
//
// LAYERING: infrastructure. The only file in this module allowed to import
// the Supabase client.

import type { Deal } from '../../../shared/types'
import { normalizeProductName } from '../../../shared/types'
import type { Result } from '../../collection/domain/result'
import { err, ok } from '../../collection/domain/result'
import { supabase } from '../../supabase-client'
import type { ConceptDraft, ConceptFamilyDraft } from '../domain/catalogue-plan'
import type { ResolverRule } from '../domain/concept-resolution'
import { dealKey, dealKeyToString } from '../domain/deal-key'
import { skuKeyToString } from '../domain/sku-key'
import type { CatalogueStore, SkuUpsertInput } from '../application/resolve-catalogue'
import { resolveCatalogueIdentity, type CatalogueLinks } from '../application/resolve-catalogue'

const BATCH_SIZE = 100

export async function loadResolverRules(): Promise<Result<readonly ResolverRule[]>> {
  const { data, error } = await supabase
    .from('concept_resolver')
    .select('id, rule_type, pattern, concept_id, priority, is_active')
    .eq('is_active', true)
    .order('priority', { ascending: true })
  if (error) return err(error.message)
  return ok((data ?? []) as ResolverRule[])
}

export async function loadValidTaxonomySubcats(): Promise<Result<ReadonlySet<string>>> {
  const { data, error } = await supabase.from('taxonomy_subcategory').select('slug')
  if (error) return err(error.message)
  return ok(new Set((data ?? []).map((r: { slug: string }) => r.slug)))
}

export async function upsertFamilies(families: readonly ConceptFamilyDraft[]): Promise<Result<undefined>> {
  for (let i = 0; i < families.length; i += BATCH_SIZE) {
    const batch = families.slice(i, i + BATCH_SIZE).map((f) => ({
      slug: f.slug,
      display_name: f.displayName,
      category_slug: f.categorySlug,
      subcategory_slug: f.subcategorySlug,
      in_starter_pack: false,
      sort_order: 0,
    }))
    // Nothing reads a family's id — ignoreDuplicates is enough (TL cross-review §2.4).
    const { error } = await supabase.from('concept_family').upsert(batch, { onConflict: 'slug', ignoreDuplicates: true })
    if (error) return err(error.message)
  }
  return ok(undefined)
}

export async function upsertConcepts(concepts: readonly ConceptDraft[]): Promise<Result<ReadonlyMap<string, string>>> {
  const idBySlug = new Map<string, string>()
  for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
    const batch = concepts.slice(i, i + BATCH_SIZE).map((c) => ({
      slug: c.slug,
      display_name: c.displayName,
      family_slug: c.familySlug,
    }))
    // DO UPDATE (the default), not ignoreDuplicates — an ignored row returns
    // no id, and every existing concept's id IS read here (C-5).
    const { data, error } = await supabase.from('concept').upsert(batch, { onConflict: 'slug' }).select('id, slug')
    if (error) return err(error.message)
    // Mapped by NATURAL KEY (slug), never by response order.
    for (const row of (data ?? []) as { id: string; slug: string }[]) idBySlug.set(row.slug, row.id)
  }
  return ok(idBySlug)
}

type SkuRow = {
  concept_id: string
  store_slug: string
  region_slug: string
  source_product_id: string
  source_product_name: string
  regular_price?: number
  last_deal_seen_at: string
}

function toSkuRow(input: SkuUpsertInput): SkuRow {
  const row: SkuRow = {
    concept_id: input.key.conceptId,
    store_slug: input.key.store,
    region_slug: input.key.region,
    source_product_id: input.key.sourceProductId,
    source_product_name: input.sourceProductName,
    last_deal_seen_at: input.lastDealSeenAt,
  }
  // V-c / P2a: the key is genuinely absent from the row sent to Postgres when
  // no price was observed — never `regular_price: null`.
  if (input.regularPrice !== undefined) row.regular_price = input.regularPrice
  return row
}

export async function upsertSkus(skus: readonly SkuUpsertInput[]): Promise<Result<ReadonlyMap<string, string>>> {
  const idByKey = new Map<string, string>()
  // P2a: group by column-set presence of `regular_price` FIRST — PostgREST
  // requires every row in one upsert to carry the same columns, so a batch
  // can never mix "has a shelf price" rows with "omit the column" rows.
  const withPrice = skus.filter((s) => s.regularPrice !== undefined)
  const withoutPrice = skus.filter((s) => s.regularPrice === undefined)

  for (const group of [withPrice, withoutPrice]) {
    for (let i = 0; i < group.length; i += BATCH_SIZE) {
      const batch = group.slice(i, i + BATCH_SIZE).map(toSkuRow)
      const { data, error } = await supabase
        .from('sku')
        .upsert(batch, { onConflict: 'concept_id,store_slug,region_slug,source_product_id' })
        .select('id, concept_id, store_slug, region_slug, source_product_id')
      if (error) return err(error.message)
      // Mapped by NATURAL KEY, never by response order (C-5).
      for (const row of (data ?? []) as {
        id: string
        concept_id: string
        store_slug: string
        region_slug: string
        source_product_id: string
      }[]) {
        const key = skuKeyToString({
          conceptId: row.concept_id,
          store: row.store_slug,
          region: row.region_slug,
          sourceProductId: row.source_product_id,
        })
        idByKey.set(key, row.id)
      }
    }
  }
  return ok(idByKey)
}

export const supabaseCatalogueStore: CatalogueStore = {
  loadResolverRules,
  loadValidTaxonomySubcats,
  upsertFamilies,
  upsertConcepts,
  upsertSkus,
}

/**
 * Refreshes `concept_cheapest_now` only. `worth_picking_up_candidates` is
 * DROPPED from this refresh (tech-lead cross-review §7 WP-1a) — Surface 3
 * ("Worth a look") is being removed (WP-11), and refreshing an MV nothing
 * reads any more is wasted work every run.
 */
export async function refreshConceptCheapestNow(): Promise<void> {
  const { error } = await supabase.rpc('exec_refresh_mv', { view_name: 'concept_cheapest_now' })
  if (error) {
    console.error('[catalogue] failed to refresh concept_cheapest_now:', error.message)
  } else {
    console.log('[catalogue] refreshed concept_cheapest_now')
  }
}

/**
 * Links each stored deal to the sku `resolveCatalogueIdentity` resolved for
 * it, by reading the just-written rows back and updating `sku_id` — the same
 * read-back mechanism `v3-cutover.ts`'s `backfillRecentDealsSkuId` used,
 * moved here unchanged in shape. KNOWN LIMITATION, carried forward
 * deliberately: this is still one round trip PER CHANGED ROW, which WP-1b
 * removes by having `sku_id` ride `storeDeals`'s own upsert instead
 * (ARCH-X §2.3) — `store.ts` is out of scope for this package (tech-lead
 * cross-review §7, "WP-1a ... Keep behaviour otherwise identical").
 *
 * Keyed by (store, product_name, valid_from) — `DealKey`, not the old
 * (store, product_name)-only key — so a deal is never linked to the wrong
 * row when a store has more than one active window for the same name.
 */
export async function linkDealsToSkus(deals: readonly Deal[], skuIdByDeal: CatalogueLinks['skuIdByDeal']): Promise<{ readonly linked: number }> {
  if (deals.length === 0 || skuIdByDeal.size === 0) return { linked: 0 }

  let linked = 0
  let matchedRows = 0

  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const chunk = deals.slice(i, i + BATCH_SIZE)
    const productNames = Array.from(new Set(chunk.map((d) => normalizeProductName(d.productName))))
    const stores = Array.from(new Set(chunk.map((d) => d.store)))

    const { data, error } = await supabase
      .from('deals')
      .select('id, store, product_name, valid_from, sku_id')
      .in('store', stores)
      .in('product_name', productNames)
      .eq('is_active', true)

    if (error) {
      console.error('[catalogue] failed to read back deals:', error.message)
      continue
    }

    matchedRows += (data ?? []).length
    for (const row of (data ?? []) as { id: string; store: string; product_name: string; valid_from: string; sku_id: string | null }[]) {
      const key = dealKeyToString(dealKey(row.store, row.product_name, row.valid_from))
      const skuId = skuIdByDeal.get(key)
      if (!skuId || row.sku_id === skuId) continue

      const { data: updated, error: updateErr } = await supabase.from('deals').update({ sku_id: skuId }).eq('id', row.id).select('id')
      if (updateErr) {
        console.error(`[catalogue] failed to link sku for deal ${row.id}:`, updateErr.message)
        continue
      }
      if (!updated || updated.length === 0) continue
      linked++
    }
  }

  if (matchedRows === 0 && deals.length > 0) {
    console.error(
      `[catalogue] read back ZERO of ${deals.length} deals — the lookup key does not match what storage wrote. No sku_id was linked.`,
    )
  }

  return { linked }
}

export type CatalogueRunStats = {
  readonly concepts_resolved: number
  readonly skus_upserted: number
  readonly deals_linked: number
}

/**
 * The whole catalogue step, wired with the real Supabase-backed port —
 * called once per run from `composition.ts`, replacing `populateV3Layer`.
 * Never throws (same contract `v3-cutover.ts` had).
 */
export async function runCatalogueStep(deals: Deal[]): Promise<CatalogueRunStats> {
  if (deals.length === 0) return { concepts_resolved: 0, skus_upserted: 0, deals_linked: 0 }

  const now = new Date().toISOString()
  const links = await resolveCatalogueIdentity(deals, supabaseCatalogueStore, now)
  const { linked } = await linkDealsToSkus(deals, links.skuIdByDeal)
  await refreshConceptCheapestNow()

  return { concepts_resolved: links.conceptsResolved, skus_upserted: links.skusUpserted, deals_linked: linked }
}
