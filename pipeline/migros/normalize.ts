// Normalizes raw Migros API product card responses to UnifiedDeal shape.

import type { UnifiedDeal } from '../../shared/types'

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
 * Resolve a Migros image URL from the rokka CDN format.
 * The API returns template URLs like "https://image.migros.ch/d/{stack}/hash/name.jpg"
 * We replace {stack} with a reasonable size.
 */
function resolveImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Try transparent image first, then regular images
  const url = (r.url as string) ?? null
  if (!url) return null

  return url.replace('{stack}', 'original')
}

/**
 * Extract discount percentage from badges array.
 * Badges look like: [{ type: "PERCENTAGE_PROMOTION", description: "20%" }]
 */
function extractDiscountFromBadges(badges: unknown): number | null {
  if (!Array.isArray(badges)) return null
  for (const badge of badges) {
    if (badge?.type === 'PERCENTAGE_PROMOTION' && typeof badge.description === 'string') {
      const match = badge.description.match(/(\d+)%/)
      if (match) return parseInt(match[1]!, 10)
    }
  }
  return null
}

/**
 * Maps a single raw Migros product card to a UnifiedDeal.
 * Product cards come from getProductCards (v4) and have this shape:
 * { uid, name, title, offer: { price, promotionPrice, badges, promotionDateRange }, images, ... }
 *
 * Returns null if the item cannot be meaningfully converted.
 */
export function normalizeMigrosDeal(raw: unknown): UnifiedDeal | null {
  try {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>

    // Use title (includes variant info) or fall back to name
    const name = (r.title as string) ?? (r.name as string) ?? null
    if (!name) return null

    const offer = r.offer
    if (!offer || typeof offer !== 'object') return null
    const o = offer as Record<string, unknown>

    // New format: offer.price.advertisedValue and offer.promotionPrice.advertisedValue
    const price = o.price as Record<string, unknown> | null | undefined
    const promoPrice = o.promotionPrice as Record<string, unknown> | null | undefined

    const originalPrice = typeof price?.advertisedValue === 'number' ? price.advertisedValue : null
    const salePrice = typeof promoPrice?.advertisedValue === 'number' ? promoPrice.advertisedValue : null

    // We need at least one usable price
    if (originalPrice == null && salePrice == null) return null

    const effectiveSalePrice = salePrice ?? originalPrice
    if (effectiveSalePrice == null || effectiveSalePrice <= 0) return null

    const effectiveOriginalPrice =
      originalPrice != null && originalPrice > 0 ? originalPrice : null

    // Discount: prefer badge percentage, then calculate from prices
    let discountPercent: number | null = null
    const badges = o.badges as unknown
    discountPercent = extractDiscountFromBadges(badges)
    if (discountPercent == null) {
      discountPercent = calculateDiscountPercent(effectiveOriginalPrice, effectiveSalePrice)
    }

    // Dates from promotionDateRange
    const dateRange = o.promotionDateRange as Record<string, unknown> | null | undefined
    const validFrom = (dateRange?.startDate as string) ?? new Date().toISOString().slice(0, 10)
    const validTo = (dateRange?.endDate as string) ?? null

    // Image: try imageTransparent first, then first image in images array
    let imageUrl: string | null = null
    const imgTransparent = r.imageTransparent as Record<string, unknown> | null | undefined
    if (imgTransparent) {
      imageUrl = resolveImageUrl(imgTransparent)
    }
    if (!imageUrl) {
      const images = r.images as Array<Record<string, unknown>> | undefined
      if (Array.isArray(images) && images.length > 0) {
        imageUrl = resolveImageUrl(images[0])
      }
    }

    // Category from breadcrumb
    const breadcrumb = r.breadcrumb as Array<Record<string, unknown>> | undefined
    const sourceCategory =
      Array.isArray(breadcrumb) && breadcrumb.length > 0
        ? (breadcrumb[0]?.name as string) ?? null
        : null

    // Source URL
    const productUrl = (r.productUrls as string) ?? null

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
      sourceUrl: productUrl,
    }
  } catch (_error) {
    return null
  }
}
