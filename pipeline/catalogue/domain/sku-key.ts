// SkuKey — the natural identity of a `sku` row: (concept_id, store_slug,
// region_slug, source_product_id), the UNIQUE constraint from
// `supabase/migrations/20260427_v3_concept_layer.sql:142`.
//
// Replaces the '|'-joined string the old `v3-cutover.ts` used at :196 and
// :291 (ARCH-X §2.2). A value object here, not a template literal, so every
// caller builds and compares the key the same way — the exact "primitive
// obsession" the tech-lead cross-review names at §4.

export type SkuKey = {
  readonly conceptId: string
  readonly store: string
  readonly region: string
  readonly sourceProductId: string
}

export function skuKey(conceptId: string, store: string, region: string, sourceProductId: string): SkuKey {
  return { conceptId, store, region, sourceProductId }
}

export function skuKeyToString(key: SkuKey): string {
  return `${key.conceptId}|${key.store}|${key.region}|${key.sourceProductId}`
}

export function skuKeyEquals(a: SkuKey, b: SkuKey): boolean {
  return skuKeyToString(a) === skuKeyToString(b)
}
