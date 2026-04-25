'use client'

import { Check, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { StoreKey } from '@/lib/store-tokens'
import type { DealCategory } from '@/lib/types'
import { useListStore } from '@/stores/list-store'

type Props = {
  id: string
  store: StoreKey
  productName: string
  category: DealCategory
  salePrice: number
  imageUrl?: string | null
  sourceUrl?: string | null
  size?: 'sm' | 'md'
}

// Renders the same hit area regardless of icon size — spec §5.3 wants 44×44 on
// mobile. We keep min-h-/w-[44px] on the small variant too, only padding shrinks.
export function AddToListButton({
  id,
  store,
  productName,
  category,
  salePrice,
  imageUrl,
  sourceUrl,
  size = 'md',
}: Props) {
  const t = useTranslations('deals')
  const inList = useListStore((s) => s.items.some((i) => i.id === id))
  const add = useListStore((s) => s.add)
  const remove = useListStore((s) => s.remove)

  function toggle() {
    if (inList) {
      remove(id)
    } else {
      add({ id, store, productName, category, salePrice, imageUrl: imageUrl ?? null, sourceUrl: sourceUrl ?? null })
    }
  }

  const dims = size === 'sm' ? 'h-11 w-11 sm:h-8 sm:w-8' : 'h-11 w-11 sm:h-10 sm:w-10'
  const radius = size === 'sm' ? 'rounded-[var(--radius-sm)]' : 'rounded-[var(--radius-md)]'
  const bg = inList
    ? 'border-[var(--color-positive)] bg-[color-mix(in_oklab,var(--color-positive)_12%,var(--color-paper))] text-[var(--color-positive)]'
    : 'border-[var(--color-line-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)] hover:bg-[var(--color-page)]'
  const border = size === 'sm' ? 'border-0 sm:border' : 'border'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inList}
      aria-label={inList ? t('remove_from_list') : t('add_to_list')}
      title={inList ? t('remove_from_list') : t('add_to_list')}
      className={`inline-flex shrink-0 items-center justify-center transition-colors ${dims} ${radius} ${border} ${bg}`}
    >
      {inList ? (
        // key={inList} forces a remount whenever the icon switches, which
        // restarts the .motion-pop keyframe — the visual cue the user added
        // something. Reduced-motion users get the swap without animation.
        <Check key="check" className="h-4 w-4 motion-pop" aria-hidden />
      ) : (
        <Plus key="plus" className="h-4 w-4" aria-hidden />
      )}
    </button>
  )
}
