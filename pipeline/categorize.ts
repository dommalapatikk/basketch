// Categorizes UnifiedDeal into Deal using three-tier matching:
// brand → source category → keyword fallback.
// Also computes taxonomy confidence per tier and derives v4 format fields.

import type { Deal, UnifiedDeal } from '../shared/types'
import type { CategoryMatchTier } from '../shared/category-rules'
import { matchCategory, TAXONOMY_CONFIDENCE_BY_TIER } from '../shared/category-rules'

import { extractFormat } from './format-extract'

/** Confidence score in [0, 1] for the given match tier. See v4 spec §13. */
export function confidenceForTier(tier: CategoryMatchTier): number {
  return TAXONOMY_CONFIDENCE_BY_TIER[tier]
}

/**
 * Categorize a unified deal using the three-tier system in matchCategory.
 * Ensures discount_percent is non-null after categorization and attaches
 * taxonomy confidence + v4 format fields.
 */
export function categorizeDeal(deal: UnifiedDeal): Deal {
  const match = matchCategory(deal.productName, deal.sourceCategory)

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

  const base: Deal = {
    ...deal,
    discountPercent,
    category: match.category,
    subCategory: match.subCategory,
    taxonomyConfidence: confidenceForTier(match.tier),
  }

  // v4: derive format / container / pack size / canonical unit pricing
  const extracted = extractFormat(base)
  return { ...base, ...extracted }
}
