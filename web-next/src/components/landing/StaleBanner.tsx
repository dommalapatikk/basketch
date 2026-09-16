'use client'

import { useTranslations } from 'next-intl'

import { formatShortDate, isStale } from '@/lib/format'

type Props = {
  updatedAt: string
  locale: string
  /**
   * `WeeklySnapshot.isDegraded` — true only when the deals query itself
   * errored (server/data/supabase-provider.ts), not "zero deals matched".
   * Checked independently of `updatedAt`'s age: a fail-soft snapshot's
   * `updatedAt` is set to the moment of the failure, so age-based staleness
   * alone would never catch it (code review of 422bd51/F1).
   */
  isDegraded?: boolean
}

// Client island: Cache Components forbids `new Date()` in cached/server scopes,
// so the staleness check runs in the browser. The component renders nothing
// when the snapshot is fresh — no layout shift.
export function StaleBanner({ updatedAt, locale, isDegraded }: Props) {
  const t = useTranslations('home')
  if (!isDegraded && !isStale(updatedAt)) return null
  return (
    <div
      role="status"
      className="mb-8 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]"
    >
      {t('stale_banner', { date: formatShortDate(updatedAt, locale) })}
    </div>
  )
}
