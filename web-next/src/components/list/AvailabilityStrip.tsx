'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { ageFromTimestamp } from '@/lib/freshness-format'
import type { AvailabilityCell } from '@/lib/v3-types'
import { AvailabilityCellSheet } from './AvailabilityCellSheet'
import { AvailabilityHelpPopover } from './AvailabilityHelpPopover'

// Surface 2 — 7-cell cross-store availability strip (per docs/design-3-new-surfaces.md §2).
// Three states encoded in 4 ways (icon shape + position + text + colour):
//   A = on deal this week         → filled dot ●, store brand colour
//   B = off deal, seen recently   → hollow circle ○, ink-2
//   C = never seen here           → small square ▢, ink-3 on page bg
// At <360 px the strip stacks as 7 vertical rows (P3 PM-locked).

type Props = {
  conceptName: string  // 'Whole milk 1 L'
  cells: AvailabilityCell[]
}

export function AvailabilityStrip({ conceptName, cells }: Props) {
  const [openCellIndex, setOpenCellIndex] = useState<number | null>(null)

  // Sort: A (by price asc), then B (by recency desc), then C (alphabetical by store)
  const sorted = [...cells].sort((a, b) => {
    const stateRank = { A: 0, B: 1, C: 2 } as const
    if (stateRank[a.state] !== stateRank[b.state]) {
      return stateRank[a.state] - stateRank[b.state]
    }
    if (a.state === 'A' && b.state === 'A') {
      return (a.dealPrice ?? Infinity) - (b.dealPrice ?? Infinity)
    }
    if (a.state === 'B' && b.state === 'B') {
      return (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '')
    }
    return a.storeSlug.localeCompare(b.storeSlug)
  })

  return (
    <div className="w-full">
      <StripHeader conceptName={conceptName} />
      <div
        role="list"
        aria-label="Availability across stores"
        className="grid grid-cols-7 gap-1.5 max-[360px]:grid-cols-1 max-[360px]:gap-1"
      >
        {sorted.map((cell, idx) => (
          <AvailabilityCellButton
            key={cell.storeSlug}
            cell={cell}
            onClick={() => setOpenCellIndex(idx)}
          />
        ))}
      </div>
      {openCellIndex !== null && (
        <AvailabilityCellSheet
          cell={sorted[openCellIndex]}
          conceptName={conceptName}
          onClose={() => setOpenCellIndex(null)}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Strip header — label + persistent ? help button (S1: replaces dismissible
// tooltip with persistent recall affordance).
// ----------------------------------------------------------------------------

function StripHeader({ conceptName }: { conceptName: string }) {
  const t = useTranslations('availability')
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
      <span>{t('strip_header')}</span>
      <button
        type="button"
        aria-label={t('help_label')}
        onClick={() => setHelpOpen(true)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
      >
        <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
      {helpOpen && <AvailabilityHelpPopover onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Single cell — 44×52 px (>= WCAG AAA 44 px floor).
// ----------------------------------------------------------------------------

function AvailabilityCellButton({
  cell,
  onClick,
}: {
  cell: AvailabilityCell
  onClick: () => void
}) {
  const t = useTranslations('availability')
  const ariaLabel = formatCellAria(cell, t)

  return (
    <button
      type="button"
      role="listitem"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'flex h-[52px] min-h-[44px] flex-col items-center justify-center rounded-[var(--radius-md)] border px-1 py-1 text-[10px] leading-tight transition-colors',
        cell.state === 'A' && 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:bg-[var(--color-page)]',
        cell.state === 'B' && 'border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-2)] hover:bg-[var(--color-page)]',
        cell.state === 'C' && 'border-[var(--color-line)] bg-[var(--color-page)] text-[var(--color-ink-3)] hover:bg-[var(--color-line)]',
        'max-[360px]:h-11 max-[360px]:flex-row max-[360px]:justify-start max-[360px]:gap-2 max-[360px]:px-3',
      )}
    >
      <FreshnessIcon state={cell.state} />
      <CellLabel cell={cell} />
    </button>
  )
}

function FreshnessIcon({ state }: { state: 'A' | 'B' | 'C' }) {
  if (state === 'A') {
    return (
      <span aria-hidden className="block h-2.5 w-2.5 rounded-full bg-[var(--color-ink)]" />
    )
  }
  if (state === 'B') {
    return (
      <span
        aria-hidden
        className="block h-2.5 w-2.5 rounded-full border border-[var(--color-ink-2)] bg-transparent"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="block h-2.5 w-2.5 border border-[var(--color-ink-3)] bg-transparent"
    />
  )
}

function CellLabel({ cell }: { cell: AvailabilityCell }) {
  const t = useTranslations('availability')
  if (cell.state === 'A' && cell.dealPrice !== null) {
    return (
      <>
        <span className="font-mono tabular-nums">{cell.dealPrice.toFixed(2)}</span>
        {cell.discountPercent !== null && (
          <span className="font-mono tabular-nums">-{Math.round(cell.discountPercent)}%</span>
        )}
      </>
    )
  }
  if (cell.state === 'B') {
    const age = ageFromTimestamp(cell.lastSeenAt)
    if (!age) return <span>{t('never_short')}</span>
    if (age.unit === '3plus') return <span>3+ mo</span>
    return (
      <span className="text-center">
        {age.value}&nbsp;{t(`age_short_${age.unit}` as 'age_short_days' | 'age_short_weeks' | 'age_short_months')}
      </span>
    )
  }
  return <span aria-hidden>—</span>
}

function formatCellAria(
  cell: AvailabilityCell,
  t: ReturnType<typeof useTranslations>,
): string {
  const storeName = t(`store_${cell.storeSlug}` as 'store_migros')
  if (cell.state === 'A') {
    return t('aria_a', {
      store: storeName,
      price: cell.dealPrice?.toFixed(2) ?? '',
      pct: cell.discountPercent !== null ? Math.round(cell.discountPercent) : 0,
    })
  }
  if (cell.state === 'B') {
    const age = ageFromTimestamp(cell.lastSeenAt)
    if (!age) return t('aria_b_never', { store: storeName })
    return t(`aria_b_${age.unit}` as 'aria_b_days', { store: storeName, n: age.value })
  }
  return t('aria_c', { store: storeName })
}
