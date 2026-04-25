import { STORE_BRAND, type StoreKey } from '@/lib/store-tokens'

import { Chip, type ChipProps } from './chip'

export type StoreChipProps = Omit<ChipProps, 'children' | 'leading'> & {
  store: StoreKey
}

// Spec §6.2: 6px leading dot in store brand color, neutral chip background.
// Selected uses ink bg + dot drops to contrast color. Disabled (count 0) at 40% opacity.
export function StoreChip({ store, count, ...props }: StoreChipProps) {
  const brand = STORE_BRAND[store]
  const isEmpty = count === 0
  return (
    <Chip
      {...props}
      count={count}
      disabled={props.disabled || isEmpty}
      leading={
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: brand.color }}
        />
      }
    >
      {brand.label}
    </Chip>
  )
}
