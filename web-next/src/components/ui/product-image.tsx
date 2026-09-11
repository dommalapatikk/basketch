import Image from 'next/image'

import type { CropRegion } from '@/lib/domain/crop-region'

/**
 * The image slot on a deal card — either a retailer's product photo URL, or a
 * rectangle cut out of a flyer page.
 *
 * Spar, Aldi and Migros publish no per-product images at all. What they publish
 * is a flyer, and the product sits somewhere inside a page of it. Without the
 * crop path below those three retailers render as empty grey squares.
 */

type Props = {
  imageUrl?: string | null
  crop?: CropRegion | null
  /** Rendered px for the photo path — next/image needs intrinsic dimensions. */
  dimension: number
  sizes: string
  className?: string
}

export function ProductImage({ imageUrl, crop, dimension, sizes, className }: Props) {
  // ProductImage is exactly one of SourceUrl | CropRegion — a domain invariant
  // and a database CHECK (deals_one_image_kind). Photo wins if both somehow
  // arrive, because it is the one that needs no arithmetic to be right.
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={dimension}
        height={dimension}
        sizes={sizes}
        className={className}
      />
    )
  }

  if (crop) return <FlyerCrop crop={crop} />

  return null
}

/**
 * Shows one product from a flyer page without ever copying the photograph.
 *
 * Art. 2 Abs. 3bis URG protects Swiss product photographs by default, so
 * basketch stores COORDINATES, never pixels. The visitor's browser fetches the
 * page straight from the retailer and CSS shows the relevant rectangle of it.
 * The image is never reproduced on basketch infrastructure.
 *
 * ⚠️ This must stay a plain <img>. Routing it through next/image would fetch
 * the page onto Vercel, re-encode it, and serve a derived copy from our own
 * domain — which is the one thing the constraint above forbids. It would also
 * need every retailer's CDN in `images.remotePatterns`, and the Migros pages
 * (image.isu.pub) are not there.
 *
 * HOW THE GEOMETRY WORKS, because it is not obvious:
 *
 *   The wrapper is a zero-height line across the middle of the container, so
 *   percentage transforms on the <img> resolve against the IMAGE's own box
 *   rather than the container's.
 *
 *   width: 100/cw %     scales the page so the crop is exactly container-wide
 *   height: auto        keeps the page's real aspect ratio — no stretching
 *   translateX(-cx)     brings the crop's left edge to the container's left
 *   translateY(-(cy + ch/2))
 *                       brings the crop's vertical CENTRE to the middle line
 *
 * The result fills the width exactly and centres vertically, clipping evenly
 * top and bottom when the crop is taller than the slot. Nothing is distorted,
 * and no JavaScript needs to know the page's pixel dimensions.
 */
function FlyerCrop({ crop }: { crop: CropRegion }) {
  const style = cropImageStyle(crop)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-x-0 top-1/2">
        {/* biome-ignore lint/performance/noImgElement: see the URG note above — next/image would serve a derived copy from our own domain */}
        <img
          src={crop.pageImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="block h-auto max-w-none"
          style={style}
        />
      </div>
    </div>
  )
}

/**
 * The geometry, separated from the markup so it can be checked arithmetically.
 *
 * TOTAL, by construction. It used to return null for a degenerate crop, which
 * meant every caller had to remember the check and the invariant lived in a
 * render function. A `CropRegion` can now only be built through
 * `createCropRegion`, which refuses a zero area, a fraction outside 0..1 and a
 * rectangle running off the page — so by the time one reaches here there is no
 * failing case left to handle.
 */
export function cropImageStyle(crop: CropRegion): {
  width: string
  transform: string
  clipPath: string
} {
  return {
    width: `${pct(100 / crop.width)}%`,
    transform: `translate(${pct(-crop.x * 100)}%, ${pct(-(crop.y + crop.height / 2) * 100)}%)`,
    // Hides everything outside the rectangle. Without this, a crop WIDER than
    // the square slot underfills it vertically and the neighbouring products on
    // the flyer page bleed in above and below — verified in a browser, not
    // reasoned about: the row-spanning case rendered three rows of other
    // products inside one card. `overflow: hidden` cannot fix that, because it
    // clips what leaves the slot and not what surrounds the crop.
    //
    // inset() percentages resolve against the IMAGE's own box, the same space
    // the fractions are expressed in, and the clip travels with the transform.
    clipPath: `inset(${pct(crop.y * 100)}% ${pct((1 - crop.x - crop.width) * 100)}% ${pct(
      (1 - crop.y - crop.height) * 100,
    )}% ${pct(crop.x * 100)}%)`,
  }
}

/**
 * Rounds a percentage to something a stylesheet should contain.
 *
 * `-(0.5 + 0.1 / 2) * 100` is -55.00000000000001 in binary floating point, and
 * that string ends up in the DOM verbatim. Four decimals is far finer than a
 * device pixel on any flyer page and keeps the markup stable between renders.
 */
function pct(value: number): number {
  return Math.round(value * 1e4) / 1e4
}
