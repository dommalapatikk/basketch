// v4 photo slot (spec §5 P5 + row 6).
// Renders the real product image when provided by the scraper, falls back to
// a neutral #F5F5F4 tile with store monogram + brand accent when the image is
// missing or fails to load.

import { useState } from 'react'

import type { Store } from '@shared/types'
import { STORE_META } from '@shared/types'

interface DealImageProps {
  store: Store
  size: 72 | 48 | 40
  /** Scraped product image URL. Null/undefined falls back to the monogram tile. */
  photoUrl?: string | null
  /** Optional alt text override — defaults to the store label. */
  alt?: string
}

const MONOGRAM_CLASS: Record<72 | 48 | 40, string> = {
  72: 'text-[24px]',
  48: 'text-[18px]',
  40: 'text-[14px]',
}

export function DealImage({ store, size, photoUrl, alt }: DealImageProps) {
  const meta = STORE_META[store]
  const [failed, setFailed] = useState(false)
  const showPhoto = photoUrl != null && photoUrl !== '' && !failed

  if (showPhoto) {
    return (
      <div
        className='relative flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-white'
        style={{ width: size, height: size }}
      >
        <span
          className='absolute inset-y-0 left-0 w-1 z-10'
          style={{ backgroundColor: meta.hex }}
          aria-hidden='true'
        />
        <img
          src={photoUrl}
          alt={alt ?? `${meta.label} product`}
          loading='lazy'
          decoding='async'
          onError={() => setFailed(true)}
          className='max-h-full max-w-full object-contain'
          style={{ padding: 4 }}
        />
      </div>
    )
  }

  // Fallback tile
  const monogram = meta.label.charAt(0).toUpperCase()
  return (
    <div
      className='relative flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]'
      style={{ width: size, height: size, backgroundColor: '#F5F5F4' }}
      aria-label={`${meta.label} product placeholder`}
    >
      <span
        className='absolute left-0 top-0 h-full w-1'
        style={{ backgroundColor: meta.hex }}
        aria-hidden='true'
      />
      <span
        className={`${MONOGRAM_CLASS[size]} font-extrabold`}
        style={{ color: meta.hexText }}
      >
        {monogram}
      </span>
    </div>
  )
}
