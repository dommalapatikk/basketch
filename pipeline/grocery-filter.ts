// pipeline/grocery-filter.ts — rejects non-grocery items at ingest.
// Hybrid rules: brand blocklist (LIDL DIY/textiles own-brands) + source-category
// denylist when source exposes one. Runs before categorizeDeal in run.ts so that
// items like Parkside rope kits never enter the dataset.

import type { UnifiedDeal } from '../shared/types'

/**
 * LIDL store-brand names that sit in non-grocery departments (DIY, textiles,
 * electronics, garden, tools). Any product whose name starts with or contains
 * these as a whole word is rejected.
 *
 * Source: LIDL Switzerland product lineup (aktionis.ch non-food categories).
 */
const NON_GROCERY_BRANDS = [
  'parkside',     // tools, DIY
  'crivit',       // sports, outdoor
  'livergy',      // men's clothing
  'esmara',       // women's clothing
  'lupilu',       // children's clothing (excluding baby food)
  'pepperts',     // kids clothing
  'silvercrest',  // electronics, kitchen appliances
  'powerfix',     // DIY hand tools
  'auriol',       // watches, weather instruments
  'florabest',    // garden tools
  'parkside performance',
  'ultimate speed', // automotive
  'sensiplast',   // sports wear
  'tronic',       // electronics
]

/**
 * Source category keywords (lowercase substring match) that indicate a
 * non-grocery department. Only fires when `sourceCategory` is non-null.
 * aktionis.ch typically emits sourceCategory=null, so this branch primarily
 * protects future source integrations.
 */
const NON_GROCERY_SOURCE_CATEGORIES = [
  'werkzeug', 'tools',
  'textilien', 'textile', 'bekleidung', 'clothing',
  'elektronik', 'electronics', 'elektro',
  'garten', 'garden',
  'heimwerk', 'diy',
  'spielzeug', 'toys',
  'auto', 'fahrzeug',
]

export interface GroceryFilterResult {
  keep: boolean
  reason?: 'brand-blocklist' | 'source-category-denylist'
  matched?: string
}

function wordBoundaryMatch(text: string, term: string): boolean {
  const idx = text.indexOf(term)
  if (idx === -1) return false
  const before = idx === 0 ? ' ' : text[idx - 1]!
  const after = idx + term.length >= text.length ? ' ' : text[idx + term.length]!
  const boundary = /[^a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/
  return boundary.test(before) && boundary.test(after)
}

/**
 * Decide whether to keep a deal at ingest. Returns keep=true for grocery items,
 * keep=false with a reason for filtered items.
 */
export function filterGrocery(deal: UnifiedDeal): GroceryFilterResult {
  const name = deal.productName.toLowerCase()

  // Check longest brand names first to avoid partial hits (e.g. "parkside performance" before "parkside").
  const brands = [...NON_GROCERY_BRANDS].sort((a, b) => b.length - a.length)
  for (const brand of brands) {
    if (wordBoundaryMatch(name, brand)) {
      return { keep: false, reason: 'brand-blocklist', matched: brand }
    }
  }

  if (deal.sourceCategory) {
    const sc = deal.sourceCategory.toLowerCase()
    for (const keyword of NON_GROCERY_SOURCE_CATEGORIES) {
      if (sc.includes(keyword)) {
        return { keep: false, reason: 'source-category-denylist', matched: keyword }
      }
    }
  }

  return { keep: true }
}
