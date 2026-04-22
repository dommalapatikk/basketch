// pipeline/format-extract.ts — v4 format + canonical unit extraction.
// Pure function. Consumes Python-extracted quantity fields as authoritative;
// falls back to regex on productName/description only when those are absent.

import type { CanonicalUnit, Container, Deal, Format, UnifiedDeal } from '../shared/types'
import { schemaFor } from '../shared/sub-category-schemas'

export interface FormatExtract {
  format?: Format
  container?: Container
  packSize?: number
  unitVolumeMl?: number
  unitWeightG?: number
  unitCount?: number
  canonicalUnit?: CanonicalUnit
  canonicalUnitValue?: number
  pricePerUnit?: number
}

// ============================================================
// Format (still / sparkling / flavoured) — keyword lookup on productName
// ============================================================

// Negation-specific keywords must come before their base form. "ohne kohlensäure"
// (still) MUST match before "kohlensäure" (sparkling), otherwise a still water
// gets labelled sparkling. Order within this list reflects priority.
const FORMAT_KEYWORDS: Array<{ keywords: string[]; format: Format }> = [
  // Specific negations first — protect against substring matches below.
  { keywords: ['ohne kohlensäure', 'naturelle', 'still water', 'stilles wasser', 'plat'], format: 'still' },
  { keywords: ['leicht prickelnd', 'lightly sparkling', 'leggermente frizzante'], format: 'lightly-sparkling' },
  { keywords: ['mit kohlensäure', 'sparkling', 'kohlensäure', 'gazeuse', 'frizzante', 'mineralwasser prickelnd'], format: 'sparkling' },
  { keywords: ['aromatisiert', 'flavoured', 'flavored'], format: 'flavoured' },
]

function detectFormat(haystack: string): Format | undefined {
  const lower = haystack.toLowerCase()
  for (const { keywords, format } of FORMAT_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return format
  }
  return undefined
}

// ============================================================
// Container — keyword lookup
// ============================================================

const CONTAINER_KEYWORDS: Array<{ keywords: string[]; container: Container }> = [
  { keywords: ['glasflasche', 'glass bottle', 'vetro', 'bouteille verre'], container: 'glass' },
  { keywords: ['pet', 'pet-flasche', 'pet flasche', 'plastikflasche'], container: 'pet' },
  { keywords: ['dose', 'can ', ' can.', 'lattina', 'canette'], container: 'can' },
  { keywords: ['tetra', 'karton', 'tetrapak', 'tetra-pak', 'carton'], container: 'carton' },
  { keywords: ['beutel', 'pouch', 'sachet'], container: 'pouch' },
]

function detectContainer(haystack: string): Container | undefined {
  const lower = haystack.toLowerCase()
  for (const { keywords, container } of CONTAINER_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return container
  }
  return undefined
}

// ============================================================
// Pack size + unit volume — prefer Python's quantityDisplay, fallback regex
// ============================================================

/**
 * Parse a multi-pack string like "6 x 1.5 L" or "12x50cl".
 * Returns packSize (e.g. 6) and perUnitValue in the original unit (e.g. 1.5).
 */
function parseMultiPack(raw: string): { packSize: number; perUnit: number; unit: string } | null {
  const m = raw.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|g|kg)/i)
  if (!m) return null
  const packSize = Number.parseInt(m[1]!, 10)
  const perUnit = Number.parseFloat(m[2]!.replace(',', '.'))
  const unit = m[3]!.toLowerCase() === 'liter' ? 'l' : m[3]!.toLowerCase()
  if (!Number.isFinite(packSize) || !Number.isFinite(perUnit)) return null
  return { packSize, perUnit, unit }
}

/** Parse a single-unit string like "1.5 L" or "500 g". */
function parseSingle(raw: string): { value: number; unit: string } | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|g|kg)\b/i)
  if (!m) return null
  const value = Number.parseFloat(m[1]!.replace(',', '.'))
  const unit = m[2]!.toLowerCase() === 'liter' ? 'l' : m[2]!.toLowerCase()
  if (!Number.isFinite(value)) return null
  return { value, unit }
}

function toMl(value: number, unit: string): number | null {
  switch (unit) {
    case 'l':  return value * 1000
    case 'dl': return value * 100
    case 'cl': return value * 10
    case 'ml': return value
    default:   return null
  }
}

function toG(value: number, unit: string): number | null {
  switch (unit) {
    case 'kg': return value * 1000
    case 'g':  return value
    default:   return null
  }
}

// ============================================================
// Main extraction
// ============================================================

/**
 * Derive format + canonical unit fields for a Deal.
 * Accepts the full Deal (has category + subCategory + Python-extracted quantity fields).
 * Returns undefined for fields that cannot be derived with confidence.
 */
export function extractFormat(deal: Deal | (UnifiedDeal & { subCategory?: string | null })): FormatExtract {
  const result: FormatExtract = {}
  const schema = schemaFor(deal.subCategory ?? null)
  const haystack = `${deal.productName} ${deal.description ?? ''}`.toLowerCase()

  // Format + container (keyword-based, independent of schema)
  const format = detectFormat(haystack)
  if (format) result.format = format
  const container = detectContainer(haystack)
  if (container) result.container = container

  let totalMl: number | undefined
  let totalG: number | undefined
  let packSize: number | undefined
  let unitVolumeMl: number | undefined
  let unitWeightG: number | undefined

  // Tier 1 (authoritative): Python already parsed quantity + unit. Use when both present.
  if (deal.quantity != null && deal.quantityUnit) {
    const asMl = toMl(deal.quantity, deal.quantityUnit)
    const asG = toG(deal.quantity, deal.quantityUnit)
    if (asMl != null) totalMl = asMl
    else if (asG != null) totalG = asG

    // Try to recover packSize from quantityDisplay even when total is known,
    // so hero copy can still say "6 × 1.5 L".
    const displayMulti = deal.quantityDisplay ? parseMultiPack(deal.quantityDisplay) : null
    if (displayMulti) {
      packSize = displayMulti.packSize
      const perMl = toMl(displayMulti.perUnit, displayMulti.unit)
      const perG = toG(displayMulti.perUnit, displayMulti.unit)
      if (perMl != null) unitVolumeMl = perMl
      else if (perG != null) unitWeightG = perG
    } else {
      packSize = 1
      if (totalMl != null) unitVolumeMl = totalMl
      if (totalG != null) unitWeightG = totalG
    }
  }

  // Tier 2: regex on quantityDisplay, then productName. Only runs if Tier 1 missed.
  if (packSize == null) {
    const rawQty = deal.quantityDisplay ?? deal.productName
    const multi = parseMultiPack(rawQty) ?? (rawQty !== deal.productName ? parseMultiPack(deal.productName) : null)
    const single = multi ? null : (parseSingle(rawQty) ?? parseSingle(deal.productName))

    if (multi) {
      packSize = multi.packSize
      const perMl = toMl(multi.perUnit, multi.unit)
      const perG = toG(multi.perUnit, multi.unit)
      if (perMl != null) {
        unitVolumeMl = perMl
        totalMl = perMl * multi.packSize
      } else if (perG != null) {
        unitWeightG = perG
        totalG = perG * multi.packSize
      }
    } else if (single) {
      packSize = 1
      const asMl = toMl(single.value, single.unit)
      const asG = toG(single.value, single.unit)
      if (asMl != null) {
        unitVolumeMl = asMl
        totalMl = asMl
      } else if (asG != null) {
        unitWeightG = asG
        totalG = asG
      }
    }
  }

  if (packSize != null) result.packSize = packSize
  if (unitVolumeMl != null) result.unitVolumeMl = unitVolumeMl
  if (unitWeightG != null) result.unitWeightG = unitWeightG

  // Canonical unit — driven by schema when available, otherwise inferred from what we parsed.
  const canonicalUnit: CanonicalUnit | undefined = schema?.canonicalUnit
    ?? (totalMl != null ? 'L' : totalG != null ? 'kg' : undefined)

  if (canonicalUnit) {
    result.canonicalUnit = canonicalUnit
    let canonicalValue: number | undefined
    switch (canonicalUnit) {
      case 'L':
        if (totalMl != null) canonicalValue = totalMl / 1000
        break
      case 'kg':
        if (totalG != null) canonicalValue = totalG / 1000
        break
      case '100g':
        if (totalG != null) canonicalValue = totalG / 100
        break
      case 'piece':
        canonicalValue = packSize ?? 1
        break
    }
    if (canonicalValue != null && canonicalValue > 0) {
      result.canonicalUnitValue = canonicalValue
      result.pricePerUnit = Math.round((deal.salePrice / canonicalValue) * 100) / 100
    }
  }

  return result
}
