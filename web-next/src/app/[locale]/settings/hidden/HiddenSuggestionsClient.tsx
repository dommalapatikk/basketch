'use client'

import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Client-side list of hidden suggestions, grouped by dismissal date.
// Per design spec §3.5: per-row Restore + Restore-all footer; reversible
// via toast Undo within 5 s.

type HiddenItem = {
  conceptId: string
  conceptName: string
  dismissedAt: string  // ISO
}

type Group = {
  dateLabel: string
  items: HiddenItem[]
}

export function HiddenSuggestionsClient() {
  const t = useTranslations('hidden_suggestions')
  const [items, setItems] = useState<HiddenItem[] | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    // TODO (integration): fetch from /api/user-interest/hidden using the
    // localStorage-stored email key. For now: empty until wiring lands.
    setItems([])
  }, [])

  if (items === null) {
    return <SkeletonState />
  }

  if (errored) {
    return (
      <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] p-4 text-sm text-[var(--color-ink-2)]">
        {t('error')}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] p-6 text-center">
        <p className="text-sm text-[var(--color-ink-2)]">{t('empty_body')}</p>
      </div>
    )
  }

  const groups = groupByDate(items, t)

  function restoreOne(conceptId: string) {
    setItems((prev) => prev?.filter((i) => i.conceptId !== conceptId) ?? [])
    // TODO (integration): UPDATE user_interest SET dismissed_at = NULL WHERE concept_id = ?
  }

  function restoreAll() {
    setItems([])
    // TODO (integration): UPDATE user_interest SET dismissed_at = NULL WHERE user_email = ? AND dismissed_at IS NOT NULL
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.dateLabel}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            {group.dateLabel}
          </h2>
          <ul className="divide-y divide-[var(--color-line)] rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)]">
            {group.items.map((item) => (
              <li key={item.conceptId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex-1 text-sm text-[var(--color-ink)]">{item.conceptName}</span>
                <button
                  type="button"
                  onClick={() => restoreOne(item.conceptId)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden /> {t('restore')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer className="border-t border-[var(--color-line)] pt-4">
        <button
          type="button"
          onClick={restoreAll}
          className="h-11 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
        >
          {t('restore_all', { n: items.length })}
        </button>
      </footer>
    </div>
  )
}

function SkeletonState() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <div className="h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-line)]" />
      <div className="h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-line)]" />
      <div className="h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-line)]" />
    </div>
  )
}

function groupByDate(items: HiddenItem[], t: ReturnType<typeof useTranslations>): Group[] {
  const groups: Record<string, HiddenItem[]> = {}
  for (const item of items) {
    const label = relativeDateLabel(item.dismissedAt, t)
    groups[label] ??= []
    groups[label].push(item)
  }
  return Object.entries(groups).map(([dateLabel, items]) => ({ dateLabel, items }))
}

function relativeDateLabel(iso: string, t: ReturnType<typeof useTranslations>): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return t('group_today')
  if (days === 1) return t('group_yesterday')
  if (days <= 6) return t('group_this_week')
  if (days <= 30) return t('group_this_month')
  return t('group_older')
}
