'use client'

import { useTranslations } from 'next-intl'

import { startsAfterToday } from '@/lib/domain/validity'
import { formatMemberPriceLabel, formatValidFromShort } from '@/lib/format'
import type { ListItem } from '@/stores/list-store'

/**
 * Same two facts DealCard labels on the deals page — a member-only price
 * (Art. 3(1)(e) UWG) and a "from <date>" not-yet-started deal — carried
 * through to the list drawer, because CLAUDE.md requires the member label
 * wherever the price is shown, and the drawer shows the price again.
 */
export function ItemNote({
  item,
  locale,
  today,
}: {
  item: ListItem
  locale: string
  today: string
}) {
  const t = useTranslations('deals')
  const memberLabel = formatMemberPriceLabel(item.priceBasis, locale)
  // The `item.validFrom &&` guard is what lets TypeScript narrow it to
  // `string` below — startsAfterToday already returns false for
  // `undefined`, so this never changes which branch runs.
  const showsFromDate = Boolean(item.validFrom) && startsAfterToday(item, today)
  if (!memberLabel && !showsFromDate) return null
  return (
    <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--color-ink-3)]">
      {memberLabel}
      {memberLabel && showsFromDate ? ' · ' : null}
      {showsFromDate && item.validFrom ? (
        // The date itself is wrapped in <time dateTime> (code review LOW,
        // a11y) — validFrom is already machine-readable ISO (YYYY-MM-DD).
        <time dateTime={item.validFrom}>
          {t('from_date', { date: formatValidFromShort(item.validFrom, locale) })}
        </time>
      ) : null}
    </p>
  )
}
