// ProductTileLocator — groups positioned words into product tiles.
//
// A flyer page is a visual grid of product tiles. Each tile holds a discount
// badge, a name, a description, a big sale price and a "statt" line. They are
// separated by whitespace, not by markup, so the only way to recover them is
// spatial clustering.
//
// Single-linkage: two words join the same tile when the gap between their boxes
// is small in both axes. Thresholds were tuned against the real SPAR KW37 flyer
// (595x842pt A4) — dx=55 / dy=30 produced 82 tiles across 17 pages with clean
// boundaries; dx=70 started merging neighbouring products.
//
// The tile's bounding box, expanded upward to take in the product photo, is
// exactly the CropRegion the frontend needs. See product-image.ts for why that
// is stored as fractions and never as a saved crop.

import type { ProductImage } from '../../domain/product-image'
import { cropRegionFromPoints } from '../../domain/product-image'
import { isOk } from '../../domain/result'
import { type PdfPage, type Word, heightOf } from './pdf-words'

export type Tile = {
  readonly words: readonly Word[]
  readonly xMin: number
  readonly yMin: number
  readonly xMax: number
  readonly yMax: number
}

export type ClusterOptions = {
  /** Max horizontal gap between boxes that still counts as the same tile. */
  maxGapX?: number
  /** Max vertical gap. */
  maxGapY?: number
}

const DEFAULT_GAP_X = 55
const DEFAULT_GAP_Y = 30

function gap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, Math.max(aMin, bMin) - Math.min(aMax, bMax))
}

/**
 * Groups a page's words into tiles by proximity.
 * O(n^2) over words on one page (~100–400), which is nothing at this scale.
 */
export function clusterIntoTiles(words: readonly Word[], options: ClusterOptions = {}): Tile[] {
  const dx = options.maxGapX ?? DEFAULT_GAP_X
  const dy = options.maxGapY ?? DEFAULT_GAP_Y
  const n = words.length
  if (n === 0) return []

  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (a: number): number => {
    let x = a
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = words[i]!
      const b = words[j]!
      if (gap(a.xMin, a.xMax, b.xMin, b.xMax) <= dx && gap(a.yMin, a.yMax, b.yMin, b.yMax) <= dy) {
        union(i, j)
      }
    }
  }

  const groups = new Map<number, Word[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = groups.get(root)
    if (list) list.push(words[i]!)
    else groups.set(root, [words[i]!])
  }

  return [...groups.values()].map((ws) => ({
    words: ws,
    xMin: Math.min(...ws.map((w) => w.xMin)),
    yMin: Math.min(...ws.map((w) => w.yMin)),
    xMax: Math.max(...ws.map((w) => w.xMax)),
    yMax: Math.max(...ws.map((w) => w.yMax)),
  }))
}

/** Reading order within a tile: top to bottom, then left to right. */
export function tileWordsInOrder(tile: Tile): Word[] {
  return [...tile.words].sort((a, b) => {
    const rowA = Math.round(a.yMin / 6)
    const rowB = Math.round(b.yMin / 6)
    return rowA === rowB ? a.xMin - b.xMin : rowA - rowB
  })
}

export function tileText(tile: Tile): string {
  return tileWordsInOrder(tile)
    .map((w) => w.text)
    .join(' ')
}

/** Words whose font height falls in a range — the role signal in a flyer. */
export function wordsByHeight(tile: Tile, min: number, max: number): Word[] {
  return tileWordsInOrder(tile).filter((w) => {
    const h = heightOf(w)
    return h > min && h < max
  })
}

/**
 * Tile bounding box → CropRegion, expanded upward to include the product photo
 * that sits above the caption. `padTopPt` is how far above the text to reach.
 */
export function tileToCropRegion(
  tile: Tile,
  page: Pick<PdfPage, 'widthPt' | 'heightPt'>,
  pageImageUrl: string,
  padTopPt = 110,
  padSidePt = 8,
): ProductImage | null {
  const image = cropRegionFromPoints(
    pageImageUrl,
    {
      xMin: Math.max(0, tile.xMin - padSidePt),
      yMin: Math.max(0, tile.yMin - padTopPt),
      xMax: Math.min(page.widthPt, tile.xMax + padSidePt),
      yMax: Math.min(page.heightPt, tile.yMax + padSidePt),
    },
    page,
  )
  return isOk(image) ? image.value : null
}
