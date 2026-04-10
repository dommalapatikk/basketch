// Categorizes UnifiedDeal into Deal by matching product name and source category against keyword rules.

import type { UnifiedDeal, Deal } from '../shared/types'
import { CATEGORY_RULES, DEFAULT_CATEGORY } from '../shared/category-rules'

/**
 * Categorize a unified deal by matching keywords against product name and source category.
 * First matching rule wins. Defaults to 'long-life' if no keywords match.
 * Ensures discount_percent is non-null after categorization.
 */
export function categorizeDeal(deal: UnifiedDeal): Deal {
  const nameLower = deal.productName.toLowerCase()
  const sourceCatLower = deal.sourceCategory?.toLowerCase() ?? ''

  let matchedCategory = DEFAULT_CATEGORY
  let matchedSubCategory: string | null = null

  for (const rule of CATEGORY_RULES) {
    const found = rule.keywords.some(
      (kw) => nameLower.includes(kw) || sourceCatLower.includes(kw),
    )
    if (found) {
      matchedCategory = rule.category
      matchedSubCategory = rule.subCategory ?? null
      break
    }
  }

  // Ensure discount_percent is non-null: calculate from prices if needed
  let discountPercent = deal.discountPercent
  if (discountPercent == null && deal.originalPrice != null && deal.originalPrice > 0) {
    discountPercent = Math.round(
      ((deal.originalPrice - deal.salePrice) / deal.originalPrice) * 100,
    )
  }
  // If still null (no original price), set to 0 so it's never null after processing
  if (discountPercent == null) {
    discountPercent = 0
  }

  return {
    ...deal,
    discountPercent,
    category: matchedCategory,
    subCategory: matchedSubCategory,
  }
}
