// enrich — extracting the per-category metadata.
//
// Classification says WHAT a product is. Enrichment says what is TRUE of it:
// milk fat %, butter salted or not, wine vintage, detergent wash loads, toilet
// paper ply count. Without it a price comparison is between names, not products.
//
// THE ORDER IS FORCED: you cannot know which attributes to ask for until you
// know what the product is. `Findus Plätzli Chäs` needs the frozen schema;
// `Le Gruyère AOP` needs the dairy one. So enrichment runs after classification,
// never beside it.
//
// ── THE RULE THAT MATTERS MORE THAN THE FEATURE ─────────────────────────────
//
// EXTRACT ONLY WHAT IS WRITTEN. NEVER INFER.
//
// `Emmi Milch 1L` does not state a fat percentage. Asked for one, a model
// answers 3.5% because that is the most common milk — right often enough to look
// fine, wrong often enough to matter. That is fabricated product data shown as
// fact, and under UWG Art. 3(1)(e) a price comparison must be objectively
// correct.
//
// Measured on the 2026-09-10 Denner pull: NOT ONE of the twelve dairy product
// names stated a fat percentage. `null` is the normal answer here, not a failure.

import { attributesFor } from '../../../shared/attribute-schemas'
import type { ClassificationRequest } from '../domain/classifier'

/** Bump when this prompt changes — it is part of the cache key. */
export const ENRICH_SCHEMA_VERSION = 1

export type EnrichRequest = {
  readonly request: ClassificationRequest
  readonly subCategory: string
}

/**
 * Builds the extraction prompt for one sub-category.
 *
 * Batched by SUB-CATEGORY, not by arbitrary groups of products: every item in a
 * batch shares one schema, so the field list is sent once instead of per product.
 */
export function buildEnrichPrompt(subCategory: string, batch: readonly EnrichRequest[]): string {
  const specs = attributesFor(subCategory)

  const fields = specs
    .map((s) => {
      const values = s.values ? ` — one of: ${s.values.join(', ')}` : ''
      const unit = s.unit ? ` (${s.unit})` : ''
      return `  ${s.id} (${s.type}${unit})${values}\n      why: ${s.why}`
    })
    .join('\n')

  const products = batch
    .map((b, i) => `${i}. ${b.request.productName}${b.request.descriptor ? ` — ${b.request.descriptor}` : ''}`)
    .join('\n')

  return `Extract product attributes from Swiss supermarket product text.
These products are all "${subCategory}".

THE ONE RULE
Return a value ONLY if it is written in the product text. If it is not stated,
return null. Do NOT infer, do NOT use typical values for the brand or category,
do NOT calculate. "Emmi Milch 1L" states no fat percentage — the answer is null,
not 3.5. A wrong value published beside a price is worse than no value.

FIELDS
${fields}

PRODUCTS
${products}

Return a JSON array, one object per product, with only the fields you found:
{"i": <number>, "attributes": {"<field>": <value or null>}}`
}

export type ExtractedAttributes = { i?: number; attributes?: Record<string, unknown> }

/**
 * Validates extracted attributes against the schema.
 *
 * Drops anything the schema does not define, anything of the wrong type, and any
 * enum value outside its allowed list. A model returning `fatPercent: "whole"`
 * or inventing a `freshness` field must not reach the database.
 */
export function validateAttributes(subCategory: string, raw: Record<string, unknown>): Record<string, unknown> {
  const specs = new Map(attributesFor(subCategory).map((s) => [s.id, s]))
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw ?? {})) {
    const spec = specs.get(key)
    // A field the schema does not define is a hallucination, not a bonus.
    if (!spec) continue
    // null is a first-class answer here, and the commonest correct one.
    if (value === null || value === undefined) continue

    switch (spec.type) {
      case 'number':
        if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
        break
      case 'boolean':
        if (typeof value === 'boolean') out[key] = value
        break
      case 'enum':
        if (typeof value === 'string' && spec.values?.includes(value)) out[key] = value
        break
      case 'text':
        if (typeof value === 'string' && value.trim()) out[key] = value.trim()
        break
    }
  }

  return out
}

/** Groups products by sub-category so each batch shares one schema. */
export function groupBySubCategory(items: readonly EnrichRequest[]): Map<string, EnrichRequest[]> {
  const groups = new Map<string, EnrichRequest[]>()
  for (const item of items) {
    const list = groups.get(item.subCategory) ?? []
    list.push(item)
    groups.set(item.subCategory, list)
  }
  return groups
}
