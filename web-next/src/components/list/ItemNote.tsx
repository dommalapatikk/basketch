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
  const fromLabel = startsAfterToday(item, today)
    ? t('from_date', { date: formatValidFromShort(item.validFrom, locale) })
    : null
  if (!memberLabel && !fromLabel) return null
  return (
    <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--color-ink-3)]">
      {[memberLabel, fromLabel].filter(Boolean).join(' · ')}
    </p>
  )
}
