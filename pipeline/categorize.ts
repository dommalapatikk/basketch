// Categorizes UnifiedDeal into Deal using three-tier matching:
// brand → source category → keyword fallback.

import type { UnifiedDeal, Deal } from '../shared/types'
import { matchCategory } from '../shared/category-rules'

/**
 * Categorize a unified deal using the three-tier system in matchCategory.
 * Ensures discount_percent is non-null after categorization.
 */
export function categorizeDeal(deal: UnifiedDeal): Deal {
  const result = matchCategory(deal.productName, deal.sourceCategory)

  // Ensure discount_percent is non-null: calculate from prices if needed
  let discountPercent = deal.discountPercent
  if (discountPercent == null && deal.originalPrice != null && deal.originalPrice > 0) {
    discountPercent = Math.round(
      ((deal.originalPrice - deal.salePrice) / deal.originalPrice) * 100,
    )
  }
  if (discountPercent == null) {
    discountPercent = 0
  }

  return {
    ...deal,
    discountPercent,
    category: result.category,
    subCategory: result.subCategory,
  }
}
