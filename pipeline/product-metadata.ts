// Extracts structured metadata from product names: brand, organic flag, sub-category.
// Quantity/unit extraction is deferred to a later sprint (high regex risk, low priority).

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
  return {
    brand: extractBrand(productName),
    isOrganic: isOrganic(productName),
    subCategory: detectSubCategory(productName, sourceCategory),
    productForm: detectProductForm(productName),
  }
}
