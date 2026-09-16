'use client'

import { useTranslations } from 'next-intl'
import { Fragment, type ReactNode } from 'react'

import { startsAfterToday } from '@/lib/domain/validity'
import {
  formatMemberPriceLabel,
  formatMinQuantityLabel,
  formatValidFromShort,
  splitAroundDate,
} from '@/lib/format'
import type { ListItem } from '@/stores/list-store'

/**
 * Same three facts DealCard labels on the deals page — a member-only price,
 * a "from N items" conditional price (both Art. 3(1)(e) UWG, WP-C4/D2/TP-7a)
 * and a "from <date>" not-yet-started deal — carried through to the list
 * drawer, because CLAUDE.md requires each label wherever the price is
 * shown, and the drawer shows the price again.
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
  const memberLabel = formatMemberPriceLabel(item.priceBasis, locale)
  const minQuantityLabel = formatMinQuantityLabel(item.minQuantity, locale)
  // The `item.validFrom &&` guard is what lets TypeScript narrow it to
  // `string` below — startsAfterToday already returns false for
  // `undefined`, so this never changes which branch runs.
  const showsFromDate = Boolean(item.validFrom) && startsAfterToday(item, today)
  if (!memberLabel && !minQuantityLabel && !showsFromDate) return null

  // All three facts are independent and can co-occur (a Lidl Plus price
  // that also has not started yet, for example) — built as a list rather
  // than a fixed two-slot template so the separator only ever appears
  // between two facts that are BOTH present.
  const parts: ReactNode[] = []
  if (memberLabel) parts.push(memberLabel)
  if (minQuantityLabel) parts.push(minQuantityLabel)
  if (showsFromDate && item.validFrom) {
    parts.push(<FromDate iso={item.validFrom} locale={locale} />)
  }

  return (
    <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--color-ink-3)]">
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts is rebuilt fresh every render from the same three facts in the same order
        <Fragment key={index}>
          {index > 0 ? ' · ' : null}
          {part}
        </Fragment>
      ))}
    </p>
  )
}

/**
 * "From <time dateTime="2026-09-17">Thu 17.9.</time>" — only the date goes
 * inside the `<time>` element (code review NEW-4), not the words around it.
 * Same rule as DealCard's own label, so the drawer and the card agree.
 */
function FromDate({ iso, locale }: { iso: string; locale: string }) {
  const t = useTranslations('deals')
  const date = formatValidFromShort(iso, locale)
  const label = t('from_date', { date })
  const split = splitAroundDate(label, date)
  if (!split) return <>{label}</>
  return (
    <>
      {split.before}
      <time dateTime={iso}>{date}</time>
      {split.after}
    </>
  )
}
