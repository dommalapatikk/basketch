'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { WorthPickingUpCard, type WorthPickingUpCandidate } from './WorthPickingUpCard'

// Surface 3 — Worth Picking Up section (per docs/design-3-new-surfaces.md §3).
// PM-locked: Q9 = flat 30% threshold; Q11 = cold-start cutoff at exactly 5
// user_interest rows; Q12 = re-suggest after long gap is OK.
// Section is omitted entirely when N=0 (calm-by-absence). First-visit hint
// for new users lives in the MethodologyStrip (D2/S7) — not here.

const ABOVE_FOLD_LIMIT = 3

type Mode = 'personal' | 'cold-start'

type Props = {
  mode: Mode
  candidates: WorthPickingUpCandidate[]
  staleDaysAgo?: number  // when set, render the stale banner
  errored?: boolean
  onAdd: (candidate: WorthPickingUpCandidate) => void
  onNotNow: (candidate: WorthPickingUpCandidate) => void
  onDontSuggestAgain: (candidate: WorthPickingUpCandidate) => void
}

export function WorthPickingUp(props: Props) {
  const t = useTranslations('worth_picking_up')

  // §3.7 empty: when N=0 the section is omitted entirely. Caller decides not
  // to render this component. We return null defensively.
  if (props.candidates.length === 0 && !props.errored) return null

  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? props.candidates : props.candidates.slice(0, ABOVE_FOLD_LIMIT)
  const remaining = props.candidates.length - ABOVE_FOLD_LIMIT

  const title = props.mode === 'personal' ? t('title_personal') : t('title_cold_start')
  const subtitle =
    props.mode === 'personal' ? t('subtitle_personal') : t('subtitle_cold_start')

  return (
    <section
      aria-labelledby="worth-picking-up-title"
      className="border-t border-[var(--color-line)] bg-[var(--color-page)] py-6"
    >
      <div className="mx-auto max-w-screen-md px-4">
        <header className="mb-4">
          <h2 id="worth-picking-up-title" className="text-base font-semibold text-[var(--color-ink)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">{subtitle}</p>
        </header>

        {props.staleDaysAgo !== undefined && (
          <div
            role="status"
            className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-xs text-[var(--color-ink-3)]"
          >
            {t('stale_banner', { n: props.staleDaysAgo })}
          </div>
        )}

        {props.errored ? (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink-2)]"
          >
            {t('error_inline')}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {visible.map((c) => (
                <WorthPickingUpCard
                  key={c.conceptId}
                  candidate={c}
                  onAdd={() => props.onAdd(c)}
                  onNotNow={() => props.onNotNow(c)}
                  onDontSuggestAgain={() => props.onDontSuggestAgain(c)}
                />
              ))}
            </div>

            {!showAll && remaining > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-3 inline-flex h-11 items-center gap-1 text-sm font-medium text-[var(--color-ink-2)] hover:underline"
              >
                {t('show_all', { n: props.candidates.length })}
                <span aria-hidden>↓</span>
              </button>
            )}

            {props.mode === 'cold-start' && (
              <div className="mt-4">
                <a
                  href="#"
                  className="inline-flex h-11 items-center gap-1 text-sm font-medium text-[var(--color-ink)] hover:underline"
                >
                  {t('cold_start_cta')} <span aria-hidden>↗</span>
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
