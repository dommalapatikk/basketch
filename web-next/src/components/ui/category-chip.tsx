import { CATEGORY_ACCENT, type CategoryKey } from '@/lib/store-tokens'

import { Chip, type ChipProps } from './chip'

export type CategoryChipProps = Omit<ChipProps, 'leading'> & {
  category: CategoryKey
}

export function CategoryChip({ category, children, ...props }: CategoryChipProps) {
  return (
    <Chip
      {...props}
      leading={
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: CATEGORY_ACCENT[category] }}
        />
      }
    >
      {children}
    </Chip>
  )
}
