// Patch F step 2: post-process the categoriser output through the alias
// table to attach a `categorySlug` to each deal. Kept separate from
// categorizeDeal so the categoriser stays pure + unit-testable without a
// DB-loaded alias map (Tech Lead's call from the team review).
//
// Pipeline call site:
//   const aliases = await loadAliases(sb)
//   const resolved = categorized.map((d) => resolveTaxonomy(d, aliases))
//   const unknowns = collectUnknownTags(categorized, aliases)
//   await reportUnknownTags(sb, unknowns)
//   await storeDeals(resolved, productIds)
//
// Unknown tags don't block ingest. The pipeline writes deals with
// categorySlug=null and logs the source_tag to pipeline_unknown_tags so
// the operator can add an alias row; next run catches up.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Deal } from '../shared/types'

const SOURCE = 'aktionis-internal'

export type AliasEntry = {
  categorySlug: string | null
  subcategorySlug: string | null
}

export type AliasMap = Map<string, AliasEntry>

/**
 * Loads all rows from `taxonomy_alias` for the current source, keyed by
 * the lowercased source_tag (= the value the categoriser emits as
 * `subCategory`). Throws on connection error so the pipeline fails fast
 * rather than silently writing NULL category_slug for every deal.
 */
export async function loadAliases(sb: SupabaseClient): Promise<AliasMap> {
  const { data, error } = await sb
    .from('taxonomy_alias')
    .select('source_tag, category_slug, subcategory_slug')
    .eq('source', SOURCE)
  if (error) throw new Error(`[resolve-taxonomy] loadAliases failed: ${error.message}`)
  const map: AliasMap = new Map()
  for (const row of data ?? []) {
    map.set(String(row.source_tag).toLowerCase(), {
      categorySlug: row.category_slug ?? null,
      subcategorySlug: row.subcategory_slug ?? null,
    })
  }
  return map
}

/**
 * Pure: attaches `categorySlug` to the deal if its `subCategory` is in
 * the alias map. Case-insensitive lookup. Returns the deal unchanged
 * when no match, so unmapped deals still write with NULL category_slug
 * (the missing-tag is captured separately via collectUnknownTags).
 */
export function resolveTaxonomy(deal: Deal, aliases: AliasMap): Deal {
  if (!deal.subCategory) return deal
  const entry = aliases.get(deal.subCategory.toLowerCase())
  if (!entry) return deal
  return { ...deal, categorySlug: entry.categorySlug }
}

export type UnknownTag = {
  source_tag: string
  product_name: string
  store: string
}

/**
 * Pure: returns one entry per unique (subCategory, store) tuple where
 * the alias map has no match. The product_name is one example deal —
 * helpful when the operator triages the unknown tag in the dashboard.
 */
export function collectUnknownTags(deals: Deal[], aliases: AliasMap): UnknownTag[] {
  const seen = new Set<string>()
  const out: UnknownTag[] = []
  for (const d of deals) {
    if (!d.subCategory) continue
    const key = d.subCategory.toLowerCase()
    if (aliases.has(key)) continue
    const dedupeKey = `${key}|${d.store}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      source_tag: d.subCategory,
      product_name: d.productName,
      store: d.store,
    })
  }
  return out
}

/**
 * Batch-insert unknown tags so the operator can review them. Logs (does
 * not throw) on Supabase error — pipeline run continues; we'd rather
 * lose the audit trail for one run than block a full ingest.
 */
export async function reportUnknownTags(sb: SupabaseClient, tags: UnknownTag[]): Promise<void> {
  if (tags.length === 0) return
  const rows = tags.map((t) => ({
    source: SOURCE,
    source_tag: t.source_tag,
    product_name: t.product_name,
    store: t.store,
  }))
  const { error } = await sb.from('pipeline_unknown_tags').insert(rows)
  if (error) {
    console.error(
      `[resolve-taxonomy] [WARN] reportUnknownTags failed: ${error.message}`,
    )
  } else {
    console.log(`[resolve-taxonomy] [INFO] Logged ${rows.length} unknown tag(s)`)
  }
}
