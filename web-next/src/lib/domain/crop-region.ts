/**
 * CropRegion — a rectangle of a retailer's flyer page, as fractions of it.
 *
 * WHY COORDINATES AND NOT A CROPPED FILE. Art. 2 Abs. 3bis URG protects Swiss
 * product photographs by default. Storing a crop would reproduce the photo on
 * basketch infrastructure; storing a region and cropping in the browser means
 * the visitor fetches it from the retailer — the same request they would make
 * opening the flyer themselves. See CLAUDE.md § Legal Constraints.
 *
 * WHY FRACTIONS AND NOT PIXELS. The coordinates come out of a PDF text layer in
 * points (595×842 for A4), and the browser renders a JPEG at whatever DPI the
 * retailer chose. Points or pixels break silently the moment the render size
 * changes; fractions survive it.
 *
 * ⚠️ MIRRORS the invariants of pipeline/collection/domain/product-image.ts. The
 * pipeline builds these; web-next reads them back out of a database that may
 * hold rows written before any given rule existed. Both ends check, because the
 * row in between is the part neither controls.
 */

import { err, ok, type Result } from './result'

export type CropRegion = {
  /** Page image the crop applies to. Hotlinked, never copied. */
  readonly pageImageUrl: string
  /** All four are fractions of the page, 0..1. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type CropRegionInput = {
  pageImageUrl: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * Floating-point slack for the edge comparisons.
 *
 * 0.8 + 0.2 is 1.0000000000000002 in binary, so a strict `<= 1` rejects a crop
 * that ends exactly on the page edge — which is where a rightmost or bottom
 * product legitimately sits.
 */
const EPSILON = 1e-9

export function createCropRegion(input: CropRegionInput): Result<CropRegion> {
  const { pageImageUrl, x, y, width, height } = input

  if (!isHttpUrl(pageImageUrl)) {
    // A real defect this catches: an empty Issuu revision produced
    // 'https://image.isu.pub//jpg/page_5.jpg' — well-formed, and a 404 in every
    // visitor's browser while the pipeline reported a clean run.
    return err(`CropRegion pageImageUrl must be an http(s) URL, got '${pageImageUrl}'`)
  }

  if (![x, y, width, height].every(isFraction)) {
    return err(
      `CropRegion coordinates must be fractions in 0..1, got ${JSON.stringify({ x, y, width, height })}`,
    )
  }

  if (width <= 0 || height <= 0) {
    // Zero width divides by zero in the render and paints the entire flyer page
    // across the card.
    return err(`CropRegion must have a non-zero area, got width=${width} height=${height}`)
  }

  if (x + width > 1 + EPSILON) {
    return err(`CropRegion exceeds the page horizontally (x + width = ${x + width})`)
  }

  if (y + height > 1 + EPSILON) {
    return err(`CropRegion exceeds the page vertically (y + height = ${y + height})`)
  }

  return ok({ pageImageUrl, x, y, width, height })
}

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
