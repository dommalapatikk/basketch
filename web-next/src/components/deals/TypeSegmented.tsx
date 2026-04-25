'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import type { DealsFilters } from '@/lib/filters'
import type { DealCategory } from '@/lib/types'

const TYPES: Array<DealCategory | 'all'> = ['all', 'fresh', 'longlife', 'household']

type Props = {
  filters: DealsFilters
  onChange: (next: DealsFilters) => void
  locale: string
}

// Mobile-only type selector — sits at the top of /deals on small screens.
// Desktop uses the FilterRail's radio list instead. Filter changes call
// the parent's onChange (DealsClient), which handles state + URL update
// purely in the browser — no router.replace, no server roundtrip.
export function TypeSegmented({ filters, onChange, locale }: Props) {
  const t = useTranslations('filters')
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN

  // Patch F: Type change clears both Category AND Sub-category per spec §E2.
  const apply = useCallback(
    (type: DealCategory | 'all') => {
      onChange({ ...filters, type, category: null, subCategory: null })
    },
    [filters, onChange],
  )

  return (
    <div
      role="tablist"
      aria-label={t('type_legend')}
      className="lg:hidden -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1"
    >
      {TYPES.map((tp) => {
        const selected = filters.type === tp
        const label = tp === 'all' ? t('type_all') : labels[tp]
        return (
          <button
            key={tp}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => apply(tp)}
            className={`shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] border px-4 py-2 text-sm transition-colors ${
              selected
                ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                : 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-2)] hover:bg-[var(--color-page)]'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
