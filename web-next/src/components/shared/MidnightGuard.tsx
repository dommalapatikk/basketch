'use client'

import { useTranslations } from 'next-intl'

import { useTodayInZurich } from '@/lib/use-today-in-zurich'

type Props = {
  /** `WeeklySnapshot.today` — the Zurich date this render's counts and verdicts were computed for. */
  referenceDay: string
}

/**
 * D5, docs/rca/2026-09-27-architect-stale-expired-deals.md §6: correctness on
 * the homepage and /deals now comes from reading `today` at request time
 * (D1/D2) — but a tab left open across a Zurich midnight never makes another
 * request. It keeps showing the count and verdicts computed for
 * `referenceDay` indefinitely, with nothing to notice the day has changed.
 *
 * `useTodayInZurich` — the same hook `useActiveListItems` (stores/list-
 * store.ts) shares — polls the BROWSER's own clock, never the server's, and
 * never a refetch, at a coarse interval; this offers a manual refresh once it
 * disagrees with `referenceDay`, rather than silently keeping yesterday's
 * verdict on screen. `today` stays `null` until the first effect commits, so
 * `rolledOver` is derived state, never read during render (SF-5, review
 * 2026-09-28: this component is mounted at the top of both the homepage and
 * /deals, both of which prerender statically — a render-time clock read
 * there is the same class of bug commit 2c39e74 fixed for `ListDrawer`).
 */
export function MidnightGuard({ referenceDay }: Props) {
  const t = useTranslations('midnight_guard')
  const today = useTodayInZurich()
  const rolledOver = today !== null && today > referenceDay

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
        className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-3 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-page)]"
      >
        {t('refresh_cta')}
      </button>
    </div>
  )
}
