'use client'

import { useTranslations } from 'next-intl'

import { formatShortDate, isStale } from '@/lib/format'

type Props = {
  updatedAt: string
  locale: string
}

// Client island: Cache Components forbids `new Date()` in cached/server scopes,
// so the staleness check runs in the browser. The component renders nothing
// when the snapshot is fresh — no layout shift.
export function StaleBanner({ updatedAt, locale }: Props) {
  const t = useTranslations('home')
  if (!isStale(updatedAt)) return null
  return (
    <div
      role="status"
      className="mb-8 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]"
    >
      {t('stale_banner', { date: formatShortDate(updatedAt, locale) })}
    </div>
  )
}
