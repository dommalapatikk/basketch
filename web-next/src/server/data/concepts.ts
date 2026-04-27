import 'server-only'

import { createAnonClient } from '@/lib/supabase/anon-server'
import type { Concept, ConceptFamily, ConceptVariantTile } from '@/lib/v3-types'
import { CONCEPT_FAMILY_DEFAULT_TILES, shouldUseDefaultTiles } from '@/lib/concept-family-defaults'

// Server-side reads against the v3 concept layer. Anon-key + RLS protected.
// Used by the Variant Picker (Surface 1) at request time.

export async function getConceptFamily(slug: string): Promise<ConceptFamily | null> {
  const sb = createAnonClient()
  const { data, error } = await sb
    .from('concept_family')
    .select('slug, display_name, category_slug, subcategory_slug, in_starter_pack, sort_order')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('[concepts] getConceptFamily failed', error)
    return null
  }
  return data
}

export async function getConceptsForFamily(familySlug: string): Promise<Concept[]> {
  const sb = createAnonClient()
  const { data, error } = await sb
    .from('concept')
    .select(
      'id, slug, display_name, family_slug, fat_pct, volume_ml, weight_g, shelf_life, origin, is_organic, is_vegan, is_vegetarian, is_lactose_free, is_gluten_free, allergens, in_starter_pack',
    )
    .eq('family_slug', familySlug)
    .order('display_name', { ascending: true })
  if (error) {
    console.error('[concepts] getConceptsForFamily failed', error)
    return []
  }
  return data ?? []
}

/**
 * Returns the 4 default tiles for a family, sourced from `pipeline_run.deal_count`
 * when there's enough clean data. Falls back to CONCEPT_FAMILY_DEFAULT_TILES
 * when pipeline data is sparse (<4 rows or >14 days stale).
 */
export async function getDefaultTilesForFamily(familySlug: string): Promise<ConceptVariantTile[]> {
  const sb = createAnonClient()

  const { data: run } = await sb
    .from('pipeline_run')
    .select('finished_at, skus_resolved')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastRunAt = run?.finished_at ? new Date(run.finished_at) : null
  const useDefault = shouldUseDefaultTiles({
    rowCount: run?.skus_resolved ?? null,
    lastRunAt,
  })

  if (useDefault) {
    return CONCEPT_FAMILY_DEFAULT_TILES[familySlug] ?? []
  }

  // Live tile derivation from pipeline_run aggregations is the S8 follow-up.
  // For now even with fresh data we use the constant — the schema isn't yet
  // populated with concepts, so the default constant is the only honest source.
  return CONCEPT_FAMILY_DEFAULT_TILES[familySlug] ?? []
}
