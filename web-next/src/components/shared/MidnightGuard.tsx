'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { todayInZurich } from '@/lib/domain/validity'

type Props = {
  /** `WeeklySnapshot.today` — the Zurich date this render's counts and verdicts were computed for. */
  referenceDay: string
}

const CHECK_INTERVAL_MS = 60_000

/**
 * D5, docs/rca/2026-09-27-architect-stale-expired-deals.md §6: correctness on
 * the homepage and /deals now comes from reading `today` at request time
 * (D1/D2) — but a tab left open across a Zurich midnight never makes another
 * request. It keeps showing the count and verdicts computed for
 * `referenceDay` indefinitely, with nothing to notice the day has changed.
 *
 * This polls `todayInZurich()` — the BROWSER's own clock, never the
 * server's, and never a refetch — at a coarse interval and offers a manual
 * refresh once it disagrees with `referenceDay`, rather than silently
 * keeping yesterday's verdict on screen. Same client-island shape as
 * `StaleBanner` (reads the wall clock, so it must run in the browser, not a
 * cached/server scope).
 */
export function MidnightGuard({ referenceDay }: Props) {
  const t = useTranslations('midnight_guard')
  const [rolledOver, setRolledOver] = useState(false)

  useEffect(() => {
    const check = () => {
      if (todayInZurich() > referenceDay) setRolledOver(true)
    }
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [referenceDay])

  if (!rolledOver) return null

  return (
    <div
      role="status"
      className="mb-8 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]"
    >
      <span>{t('refresh')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-3 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-page)]"
      >
        {t('refresh_cta')}
      </button>
    </div>
  )
}
