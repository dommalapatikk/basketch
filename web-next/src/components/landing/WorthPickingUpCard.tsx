'use client'

import { MoreHorizontal } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@/lib/utils'

// Card for one Worth-Picking-Up candidate (per design spec §3.3).
// PM-locked decisions:
//   D4 — "Hide forever" → "Don't suggest again" (reversible via Settings)
//   M4 — at <360 px collapse to [Add] [⋯] overflow menu
//   M7 — re-suggest copy variant when user added long ago + still strong deal

export type WorthPickingUpCandidate = {
  conceptId: string
  conceptName: string
  imageUrl: string | null
  storeSlug: string
  storeLabel: string
  dealPrice: number
  regularPrice: number
  discountPercent: number
  contextLine: string  // pre-rendered "You added these 6 weeks ago"
}

type Props = {
  candidate: WorthPickingUpCandidate
  onAdd: () => void
  onNotNow: () => void
  onDontSuggestAgain: () => void
}

export function WorthPickingUpCard({ candidate, onAdd, onNotNow, onDontSuggestAgain }: Props) {
  const t = useTranslations('worth_picking_up')
  const [confirming, setConfirming] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)

  if (confirming) {
    return (
      <article className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
        <p className="mb-3 text-sm text-[var(--color-ink)]">
          {t('confirm_stop', { name: candidate.conceptName })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDontSuggestAgain}
            className="h-11 flex-1 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)]"
          >
            {t('confirm_yes')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] text-sm font-medium text-[var(--color-ink)]"
          >
            {t('confirm_no')}
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
      <div className="flex gap-3">
        {candidate.imageUrl ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-page)]">
            <Image
              src={candidate.imageUrl}
              alt=""
              fill
              sizes="64px"
              className="object-contain"
              priority
            />
          </div>
        ) : (
          <div aria-hidden className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-page)]" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">{candidate.conceptName}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <StorePill label={candidate.storeLabel} />
            <span className="font-mono tabular-nums">−{Math.round(candidate.discountPercent)}%</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-base font-semibold tabular-nums text-[var(--color-ink)]">
              CHF {candidate.dealPrice.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-[var(--color-ink-3)] tabular-nums line-through">
              {candidate.regularPrice.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-3)]">{candidate.contextLine}</p>
        </div>
      </div>

      {/* Action row: ≥360 px = 3 buttons; <360 px = [Add] [⋯] (M4) */}
      <div className="mt-4 flex gap-2 max-[360px]:hidden">
        <button
          type="button"
          onClick={onAdd}
          className="h-11 flex-1 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)] hover:opacity-95"
        >
          {t('add')}
        </button>
        <button
          type="button"
          onClick={onNotNow}
          className="h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
        >
          {t('not_now')}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] text-sm font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-page)]"
        >
          {t('dont_suggest_again')}
        </button>
      </div>
      <div className="mt-4 hidden gap-2 max-[360px]:flex">
        <button
          type="button"
          onClick={onAdd}
          className="h-11 flex-1 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)]"
        >
          {t('add')}
        </button>
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            aria-label={t('more_actions')}
            onClick={() => setOverflowOpen((v) => !v)}
            className="h-11 w-11 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] text-[var(--color-ink-2)]"
          >
            <MoreHorizontal className="mx-auto h-5 w-5" aria-hidden />
          </button>
          {overflowOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[var(--shadow-md)]"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOverflowOpen(false)
                  onNotNow()
                }}
                className="block h-11 w-full px-3 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-page)]"
              >
                {t('not_now')}
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOverflowOpen(false)
                  setConfirming(true)
                }}
                className="block h-11 w-full px-3 text-left text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-page)]"
              >
                {t('dont_suggest_again')}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function StorePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-page)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink)]">
      <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-[var(--color-ink)]" />
      {label}
    </span>
  )
}
