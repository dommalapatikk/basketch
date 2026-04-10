// Normalizes raw Migros API promotion responses to UnifiedDeal shape.

import type { UnifiedDeal } from '../../shared/types'

const MIGROS_BASE_URL = 'https://www.migros.ch'

/**
 * Standardise a product name: lowercase, collapse whitespace,
 * normalise quantity patterns like "6 x 1.5 L" to "6x1.5l".
 */
export function normalizeProductName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d+)\s*x\s*(\d)/g, '$1x$2')
    .replace(/(\d)\s*(ml|cl|dl|l|g|kg)\b/g, '$1$2')
}

/**
 * Calculate discount percentage from original and sale prices.
 * Returns null if either price is missing or invalid.
 */
export function calculateDiscountPercent(
  originalPrice: number | null,
  salePrice: number | null,
): number | null {
  if (
    originalPrice == null ||
    salePrice == null ||
    originalPrice <= 0 ||
    salePrice <= 0 ||
    salePrice >= originalPrice
  ) {
    return null
  }
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100)
}

/**
 * Maps a single raw Migros API promotion item to a UnifiedDeal.
 * Returns null if the item cannot be meaningfully converted
 * (e.g. missing name or no usable price).
 */
export function normalizeMigrosDeal(raw: unknown): UnifiedDeal | null {
  try {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>

    const name = r.name
    if (!name || typeof name !== 'string') return null

    const offer = r.offer
    if (!offer || typeof offer !== 'object') return null
    const o = offer as Record<string, unknown>

    const price = o.price as Record<string, unknown> | null | undefined
    const promoPrice = o.promotionPrice as Record<string, unknown> | null | undefined
    const originalPrice = (price?.value as number) ?? null
    const salePrice = (promoPrice?.value as number) ?? null

    // We need at least one usable price
    if (originalPrice == null && salePrice == null) return null

    // Use sale price if available, otherwise fall back to original
    const effectiveSalePrice = salePrice ?? originalPrice
    if (effectiveSalePrice == null || effectiveSalePrice <= 0) return null

    const effectiveOriginalPrice =
      originalPrice != null && originalPrice > 0 ? originalPrice : null

    // Discount: prefer API-provided, then calculate, then null
    let discountPercent: number | null = null
    if (typeof o.promotionPercentage === 'number' && o.promotionPercentage > 0) {
      discountPercent = o.promotionPercentage
    } else {
      discountPercent = calculateDiscountPercent(effectiveOriginalPrice, effectiveSalePrice)
    }

    const availability = r.productAvailability as Record<string, unknown> | null | undefined
    const validFrom = (availability?.startDate as string) ?? new Date().toISOString().slice(0, 10)
    const validTo = (availability?.endDate as string) ?? null

    const image = r.image as Record<string, unknown> | null | undefined
    const imageUrl = (image?.original as string) ?? null

    const categories = r.categories as Array<Record<string, unknown>> | undefined
    const sourceCategory =
      Array.isArray(categories) && categories.length > 0
        ? (categories[0]?.name as string) ?? null
        : null

    const productUrls = r.productUrls as Record<string, unknown> | null | undefined
    const productUrl = (productUrls?.url as string) ?? null
    const sourceUrl = productUrl ? `${MIGROS_BASE_URL}${productUrl}` : null

    return {
      store: 'migros',
      productName: normalizeProductName(name),
      originalPrice: effectiveOriginalPrice,
      salePrice: effectiveSalePrice,
      discountPercent,
      validFrom,
      validTo,
      imageUrl,
      sourceCategory,
      sourceUrl,
    }
  } catch (_error) {
    return null
  }
}
