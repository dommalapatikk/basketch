// ProductImage — value object. Either a URL the retailer gave us, or a region
// of a flyer page. Never both, never neither-when-one-was-expected.
//
// WHY CropRegion holds FRACTIONS and not pixels or PDF points:
// the coordinates are extracted from a PDF text layer in points (595x842 for A4),
// but the browser renders a JPEG at whatever DPI we choose (1241x1754 at 150dpi).
// Storing raw points or pixels silently breaks the moment the render size changes.
// Fractions of the page (0..1) survive any render dimension.
//
// WHY we store coordinates instead of cropped files:
// Art. 2 Abs. 3bis URG protects Swiss product photographs by default. Storing a
// crop would reproduce the photo on basketch infrastructure. Storing a region and
// cropping in the browser via CSS means the visitor's browser fetches it from the
// retailer — the same request they would make opening the flyer themselves.
// See CLAUDE.md § Legal Constraints. Do NOT change this to saved crops.
//
// WP-1d (ADR-IMG-1): the TYPE moved into the shared kernel
// (`shared/product-image.ts`) so `dealToRow` can write it on the main upsert
// row without an import running pipeline -> shared -> pipeline. This module
// keeps the constructors and invariants — the ONLY functions that import
// `PRODUCT_IMAGE_BRAND`, which is what makes a bare object literal elsewhere
// fail to compile against `ProductImage` (see that file's own comment). The
// type is re-exported so every existing caller (the seven retailer adapters,
// `Offer`) keeps importing it from here, unchanged.

import { type Result, err, ok } from './result'
import { PRODUCT_IMAGE_BRAND } from '../../../shared/product-image'
import type { CropRegion, ProductImage } from '../../../shared/product-image'

export type { CropRegion, ProductImage }

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isFraction(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1
}

export function sourceUrlImage(url: string): Result<ProductImage> {
  if (!isHttpUrl(url)) return err(`ProductImage url must be an http(s) URL, got '${url}'`)
  return ok({ kind: 'source-url', url, [PRODUCT_IMAGE_BRAND]: true })
}

export function cropRegionImage(region: CropRegion): Result<ProductImage> {
  if (!isHttpUrl(region.pageImageUrl)) {
    return err(`CropRegion pageImageUrl must be an http(s) URL, got '${region.pageImageUrl}'`)
  }
  const { x, y, width, height } = region
  if (![x, y, width, height].every(isFraction)) {
    return err(`CropRegion coordinates must be fractions in 0..1, got ${JSON.stringify({ x, y, width, height })}`)
  }
  if (width === 0 || height === 0) return err('CropRegion must have non-zero width and height')
  if (x + width > 1 + 1e-9) return err(`CropRegion exceeds the page horizontally (x + width = ${x + width})`)
  if (y + height > 1 + 1e-9) return err(`CropRegion exceeds the page vertically (y + height = ${y + height})`)
  return ok({ kind: 'crop-region', region, [PRODUCT_IMAGE_BRAND]: true })
}

/**
 * Build a CropRegion from PDF-point coordinates. This is the only place points
 * are converted, so adapters never hand raw points to the domain.
 */
export function cropRegionFromPoints(
  pageImageUrl: string,
  points: { xMin: number; yMin: number; xMax: number; yMax: number },
  page: { widthPt: number; heightPt: number },
): Result<ProductImage> {
  if (!(page.widthPt > 0) || !(page.heightPt > 0)) {
    return err(`page dimensions must be positive, got ${page.widthPt}x${page.heightPt}`)
  }
  const { xMin, yMin, xMax, yMax } = points
  if (xMax <= xMin || yMax <= yMin) {
    return err(`invalid point box: ${JSON.stringify(points)}`)
  }
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  const x = clamp(xMin / page.widthPt)
  const y = clamp(yMin / page.heightPt)
  return cropRegionImage({
    pageImageUrl,
    x,
    y,
    width: clamp(xMax / page.widthPt) - x,
    height: clamp(yMax / page.heightPt) - y,
  })
}
