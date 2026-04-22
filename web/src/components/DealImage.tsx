// v4 photo slot with neutral fallback tile (§5 row 6).
// No photoUrl prop today — aktionis.ch doesn't expose photos and we have
// no CDN. When real photos land, extend this component with `photoUrl` +
// `loading='lazy'` without changing its callers.

import type { Store } from '@shared/types'
import { STORE_META } from '@shared/types'

interface DealImageProps {
  store: Store
  size: 72 | 48 | 40
}

const MONOGRAM_CLASS: Record<72 | 48 | 40, string> = {
  72: 'text-[24px]',
  48: 'text-[18px]',
  40: 'text-[14px]',
}

export function DealImage({ store, size }: DealImageProps) {
  const meta = STORE_META[store]
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
