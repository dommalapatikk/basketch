'use client'

import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { DealsFilters } from '@/lib/filters'
import { buildShareText, buildWhatsAppHref } from '@/lib/share'
import { buildShareUrl } from '@/lib/share-url'
import type { DealFacet } from '@/server/data/filter-deals'
import { useListStore } from '@/stores/list-store'

import { MyListButton } from '@/components/list/MyListButton'

import { FilterSheet } from './FilterSheet'

type Props = {
  filters: DealsFilters
  facets: DealFacet[]
  matchedCount: number
  locale: string
}

// Mobile-only sticky action bar — three equal slots separated by 1px dividers.
// Spec §5.3: My list | Filters · n | Share. Share lights up once the Zustand
// list store has ≥ 1 item.
export function BottomBar({ filters, facets, matchedCount, locale }: Props) {
  const t = useTranslations('deals')
  const items = useListStore((s) => s.items)
  const shareDisabled = items.length === 0

  // Build the WhatsApp URL lazily on click — `window.location.origin` is not
  // available during the server-side prerender pass of this client component,
  // and `new URL()` rejects empty bases. Computing on click also keeps the
  // text fresh as items are added without re-rendering the bar.
  function onShareClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (shareDisabled) {
      e.preventDefault()
      return
    }
    const origin = window.location.origin
    const text = buildShareText({
      items,
      shareUrl: buildShareUrl({ origin, locale, items }),
      locale,
    })
    e.currentTarget.href = buildWhatsAppHref(text)
  }

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
            facets={facets}
            matchedCount={matchedCount}
            locale={locale}
          />
        </div>

        <a
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={shareDisabled}
          tabIndex={shareDisabled ? -1 : 0}
          onClick={onShareClick}
          className={`flex flex-1 items-center justify-center gap-2 text-sm font-medium text-[var(--color-ink)] ${
            shareDisabled ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t('share')}
        </a>
      </nav>
    </div>
  )
}
