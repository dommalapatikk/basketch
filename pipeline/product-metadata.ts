// Extracts structured metadata from product names: brand, organic flag, sub-category.
// Quantity/unit extraction is deferred to a later sprint (high regex risk, low priority).

import type { ProductMetadata } from '../shared/types'
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
  }
}
