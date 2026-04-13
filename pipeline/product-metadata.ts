// Extracts structured metadata from product names: brand, quantity, unit, organic flag, sub-category.

import type { ProductForm, ProductMetadata } from '../shared/types'
import { CATEGORY_RULES } from '../shared/category-rules'

/**
 * Known Swiss grocery store brands.
 * Ordered longest-first so "m-budget" matches before "m" or "budget".
 * Must be matched at word boundaries to avoid false positives (e.g., "emmi" vs "emmentaler").
 */
const KNOWN_BRANDS: string[] = [
  // Migros own brands
  'anna\'s best', 'm-budget', 'm-classic', 'migros bio', 'naturaplan', 'aha!',
  'heidi', 'farmer', 'aproz', 'elsa', 'rapelli', 'micarna', 'frey',
  // Coop own brands
  'prix garantie', 'qualité & prix', 'coop naturaplan', 'fine food',
  'betty bossi', 'karma', 'jamadu',
  // Cross-store brands
  'emmi', 'zweifel', 'lindt', 'cailler', 'thomy', 'barilla', 'knorr',
  'kellogg\'s', 'nestlé', 'coca-cola', 'rivella', 'hero', 'wander',
  'persil', 'swiffer', 'nivea', 'elmex', 'colgate', 'dove',
]

// Pre-compiled regex patterns for brands (word-boundary aware)
const BRAND_PATTERNS: { brand: string; regex: RegExp }[] = KNOWN_BRANDS.map((brand) => ({
  brand,
  regex: new RegExp(`(^|\\s)${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i'),
}))

/**
 * Extract brand from a product name.
 * Returns the brand name (title-cased) or null if no known brand found.
 */
export function extractBrand(productName: string): string | null {
  const nameLower = productName.toLowerCase()

  for (const { brand, regex } of BRAND_PATTERNS) {
    if (regex.test(nameLower)) {
      // Title-case each word, preserving hyphenated parts
      return brand.split(/\s+/).map((w) =>
        w.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('-'),
      ).join(' ')
    }
  }

  return null
}

/**
 * Detect if a product is organic based on keywords in the name.
 */
export function isOrganic(productName: string): boolean {
  const nameLower = productName.toLowerCase()
  return /\b(bio|naturaplan|demeter|knospe|organic)\b/.test(nameLower)
}

/**
 * Determine sub-category from product name using the shared category rules.
 * Returns the sub-category string or null if none matched.
 */
export function detectSubCategory(productName: string, sourceCategory: string | null): string | null {
  const nameLower = productName.toLowerCase()
  const sourceCatLower = sourceCategory?.toLowerCase() ?? ''

  for (const rule of CATEGORY_RULES) {
    if (!rule.subCategory) continue
    const found = rule.keywords.some(
      (kw) => nameLower.includes(kw) || sourceCatLower.includes(kw),
    )
    if (found) return rule.subCategory
  }

  return null
}

// ============================================================
// Quantity + unit extraction
// ============================================================

/** Standard unit aliases mapped to canonical form. */
const UNIT_ALIASES: Record<string, string> = {
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  liter: 'l',
  litre: 'l',
  g: 'g',
  gr: 'g',
  kg: 'kg',
  stück: 'pcs',
  stk: 'pcs',
  pcs: 'pcs',
  pack: 'pack',
  rollen: 'pcs',
  stücke: 'pcs',
}

/** Conversion factors to base unit (ml for liquids, g for weight). */
const TO_BASE_UNIT: Record<string, { factor: number; base: string }> = {
  ml: { factor: 1, base: 'ml' },
  cl: { factor: 10, base: 'ml' },
  dl: { factor: 100, base: 'ml' },
  l: { factor: 1000, base: 'ml' },
  g: { factor: 1, base: 'g' },
  kg: { factor: 1000, base: 'g' },
}

export interface QuantityInfo {
  quantity: number
  unit: string
}

/**
 * Extract quantity and unit from a product name.
 * Handles: "1.5L", "500g", "2x 250ml", "6 Stück", "3x200g"
 * Returns null if no quantity/unit found.
 */
export function extractQuantity(productName: string): QuantityInfo | null {
  const name = productName.toLowerCase()

  // Multi-pack pattern: "2x 1.5l", "3x200g", "2 x 250ml", "6x 330ml"
  const multiPackRe = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|litre|g|gr|kg)/i
  const multiMatch = multiPackRe.exec(name)
  if (multiMatch) {
    const count = parseInt(multiMatch[1]!, 10)
    const perUnit = parseFloat(multiMatch[2]!.replace(',', '.'))
    const rawUnit = multiMatch[3]!.toLowerCase()
    const canonical = UNIT_ALIASES[rawUnit] ?? rawUnit
    const conversion = TO_BASE_UNIT[canonical]
    if (conversion) {
      const totalBase = count * perUnit * conversion.factor
      // Convert back to human-friendly unit
      if (conversion.base === 'ml' && totalBase >= 1000) {
        return { quantity: totalBase / 1000, unit: 'l' }
      }
      if (conversion.base === 'g' && totalBase >= 1000) {
        return { quantity: totalBase / 1000, unit: 'kg' }
      }
      return { quantity: totalBase, unit: conversion.base }
    }
    return { quantity: count * perUnit, unit: canonical }
  }

  // Single quantity pattern: "1.5l", "500g", "250ml"
  const singleRe = /(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|litre|g|gr|kg)\b/i
  const singleMatch = singleRe.exec(name)
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]!.replace(',', '.'))
    const rawUnit = singleMatch[2]!.toLowerCase()
    const canonical = UNIT_ALIASES[rawUnit] ?? rawUnit
    return { quantity: value, unit: canonical }
  }

  // Piece count: "6 Stück", "10 stk", "24 Rollen"
  const pieceRe = /(\d+)\s*(stück|stücke|stk|pcs|rollen|pack)\b/i
  const pieceMatch = pieceRe.exec(name)
  if (pieceMatch) {
    const count = parseInt(pieceMatch[1]!, 10)
    const rawUnit = pieceMatch[2]!.toLowerCase()
    const canonical = UNIT_ALIASES[rawUnit] ?? rawUnit
    return { quantity: count, unit: canonical }
  }

  return null
}

/**
 * Detect the product form (raw, processed, ready-meal, canned, frozen, dried).
 * Default: 'raw' (unprocessed).
 */
const FORM_INDICATORS: { form: ProductForm; keywords: string[] }[] = [
  {
    form: 'ready-meal',
    keywords: ['cubes', 'nuggets', 'gratin', 'rösti', 'fertig', 'ready',
      'convenience', 'mikrowelle', 'aufwärmen', 'bratfertig', 'backfertig',
      'knusperli', 'crispy', 'cordon bleu', 'stäbchen'],
  },
  {
    form: 'frozen',
    keywords: ['tiefkühl', 'tiefgefroren', 'frozen', 'tk-', 'frites', 'wedges'],
  },
  {
    form: 'canned',
    keywords: ['dose', 'konserve', 'pelati', 'in eigenem saft', 'eingelegt'],
  },
  {
    form: 'processed',
    keywords: ['püree', 'puree', 'sauce', 'mark', 'konzentrat', 'sugo',
      'passata', 'ketchup', 'senf', 'stock', 'paste', 'sirup',
      'geräuchert', 'räucher', 'gepökelt', 'mariniert'],
  },
  {
    form: 'dried',
    keywords: ['getrocknet', 'getrocknete', 'dörr', 'gedörrt'],
  },
]

export function detectProductForm(productName: string): ProductForm {
  const nameLower = productName.toLowerCase()
  for (const { form, keywords } of FORM_INDICATORS) {
    if (keywords.some((kw) => nameLower.includes(kw))) return form
  }
  return 'raw'
}

/**
 * Detect meat cut from product name.
 */
const MEAT_CUTS: { cut: string; keywords: string[] }[] = [
  { cut: 'breast', keywords: ['brust', 'brustfilet', 'brustschnitzel'] },
  { cut: 'wings', keywords: ['flügeli', 'flügel', 'wings'] },
  { cut: 'thigh', keywords: ['schenkel', 'oberschenkel'] },
  { cut: 'minced', keywords: ['hackfleisch', 'gehacktes'] },
  { cut: 'schnitzel', keywords: ['schnitzel'] },
]

export function detectMeatCut(productName: string): string | null {
  const nameLower = productName.toLowerCase()
  for (const { cut, keywords } of MEAT_CUTS) {
    if (keywords.some((kw) => nameLower.includes(kw))) return cut
  }
  return null
}

/**
 * Extract all available metadata from a product name.
 */
export function extractProductMetadata(
  productName: string,
  sourceCategory: string | null,
): ProductMetadata {
  const qty = extractQuantity(productName)
  return {
    brand: extractBrand(productName),
    quantity: qty?.quantity ?? null,
    unit: qty?.unit ?? null,
    isOrganic: isOrganic(productName),
    subCategory: detectSubCategory(productName, sourceCategory),
    productForm: detectProductForm(productName),
  }
}
