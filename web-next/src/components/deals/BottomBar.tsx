'use client'

import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { DealsFilters } from '@/lib/filters'
import { createShareTarget } from '@/lib/share-target'
import { useOrigin } from '@/lib/use-origin'
import type { DealFacet } from '@/server/data/filter-deals'
import { useListStore } from '@/stores/list-store'

import { MyListButton } from '@/components/list/MyListButton'

import { FilterSheet } from './FilterSheet'

type Props = {
  filters: DealsFilters
  onChange: (next: DealsFilters) => void
  facets: DealFacet[]
  matchedCount: number
  locale: string
}

// Mobile-only sticky action bar — three equal slots separated by 1px dividers.
// Spec §5.3: My list | Filters · n | Share. Share lights up once the Zustand
// list store has ≥ 1 item.
export function BottomBar({ filters, onChange, facets, matchedCount, locale }: Props) {
  const t = useTranslations('deals')
  const items = useListStore((s) => s.items)

  // The destination is decided during RENDER, not inside a click handler. The
  // previous version assigned `e.currentTarget.href` on click, which meant
  // middle click, Cmd+click and "Copy link address" — none of which fire
  // onClick — followed `href="#"` straight back to basketch.
  const shareTarget = createShareTarget({ origin: useOrigin(), locale, items })

  const shareSlot = 'flex flex-1 items-center justify-center gap-2 text-sm font-medium'

  return (
    <div className="lg:hidden pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <nav
        aria-label={t('headline')}
        className="pointer-events-auto mx-auto flex h-16 max-w-[1240px] items-stretch divide-x divide-[var(--color-line)] border-t border-[var(--color-line)] bg-[var(--color-paper)]/95 backdrop-blur"
      >
        <div className="flex flex-1 items-stretch">
          <MyListButton variant="bottombar" />
        </div>

        <div className="flex flex-1 items-stretch">
          <FilterSheet
            filters={filters}
            onChange={onChange}
            facets={facets}
            matchedCount={matchedCount}
            locale={locale}
          />
        </div>

        {shareTarget.kind === 'ready' ? (
          <a
            href={shareTarget.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${shareSlot} text-[var(--color-ink)]`}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            {t('share')}
          </a>
        ) : (
          // A control that cannot navigate is a disabled button, not a dimmed
          // link. `disabled` is announced by screen readers and removes it from
          // the tab order without the tabIndex={-1} workaround.
          <button
            type="button"
            disabled
            className={`${shareSlot} text-[var(--color-ink-2)] opacity-60`}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            {t('share')}
          </button>
        )}
      </nav>
    </div>
  )
}
