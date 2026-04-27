'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ageFromTimestamp } from '@/lib/freshness-format'
import type { AvailabilityCell } from '@/lib/v3-types'

// Tap-sheet for a single cell on the freshness strip (per design spec §2.6).
//   A cell tap → deal details + Snooze store
//   B cell tap → "Last on deal..." + Notify-me CTA (with no-email branch per S4)
//   C cell tap → "We haven't seen X at Y yet" + Hide-this-store CTA

type Props = {
  cell: AvailabilityCell
  conceptName: string
  onClose: () => void
}

export function AvailabilityCellSheet({ cell, conceptName, onClose }: Props) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-sheet-title"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center bg-[rgba(11,11,15,0.45)]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--color-paper)] p-5 shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="availability-sheet-title" className="text-base font-semibold text-[var(--color-ink)]">
            <StoreName slug={cell.storeSlug} />
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {cell.state === 'A' && <CellSheetBodyA cell={cell} conceptName={conceptName} />}
        {cell.state === 'B' && <CellSheetBodyB cell={cell} conceptName={conceptName} onClose={onClose} />}
        {cell.state === 'C' && <CellSheetBodyC cell={cell} conceptName={conceptName} onClose={onClose} />}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// State A — on deal this week.
// ----------------------------------------------------------------------------

function CellSheetBodyA({ cell, conceptName }: { cell: AvailabilityCell; conceptName: string }) {
  const t = useTranslations('availability')
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-ink)]">
        {t('a_header', {
          name: conceptName,
          price: cell.dealPrice?.toFixed(2) ?? '',
          pct: cell.discountPercent !== null ? Math.round(cell.discountPercent) : 0,
        })}
      </p>
      {cell.lastSeenAt && (
        <p className="text-xs text-[var(--color-ink-3)]">
          {t('a_valid_until', { date: formatDate(cell.lastSeenAt) })}
        </p>
      )}
      <button
        type="button"
        className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
      >
        {t('a_snooze_store')}
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------------
// State B — off deal, seen recently.
// S4: Notify-me with email-collection branch when no email is on file.
// ----------------------------------------------------------------------------

function CellSheetBodyB({
  cell,
  conceptName,
  onClose,
}: {
  cell: AvailabilityCell
  conceptName: string
  onClose: () => void
}) {
  const t = useTranslations('availability')
  const age = ageFromTimestamp(cell.lastSeenAt)
  const [emailMode, setEmailMode] = useState(false)
  const [email, setEmail] = useState('')

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-ink)]">
        {age && age.unit !== '3plus'
          ? t(`b_header_${age.unit}` as 'b_header_days', {
              date: cell.lastSeenAt ? formatDate(cell.lastSeenAt) : '',
              price: cell.dealPrice?.toFixed(2) ?? '',
              pct: cell.discountPercent !== null ? Math.round(cell.discountPercent) : 0,
            })
          : t('b_header_3plus')}
      </p>
      {!emailMode ? (
        <button
          type="button"
          onClick={() => setEmailMode(true)}
          className="h-12 w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)] hover:opacity-95"
        >
          {t('b_notify_cta')}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            // Wiring to user_interest INSERT happens in integration step.
            onClose()
          }}
          className="space-y-2"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('b_email_placeholder')}
            className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 text-sm text-[var(--color-ink)] focus:outline-2 focus:outline-[var(--color-ink)]"
          />
          <button
            type="submit"
            className="h-12 w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] text-sm font-semibold text-[var(--color-paper)] hover:opacity-95"
          >
            {t('b_notify_with_email')}
          </button>
        </form>
      )}
      <button
        type="button"
        className="text-xs text-[var(--color-ink-3)] underline-offset-4 hover:underline"
      >
        {t('b_hide_store')}
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------------
// State C — never seen here (with PM-locked decision Q6: no "limited
// catalogue" hint, accept the noise).
// ----------------------------------------------------------------------------

function CellSheetBodyC({
  cell,
  conceptName,
  onClose,
}: {
  cell: AvailabilityCell
  conceptName: string
  onClose: () => void
}) {
  const t = useTranslations('availability')
  const storeName = t(`store_${cell.storeSlug}` as 'store_migros')
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-ink)]">
        {t('c_header', { name: conceptName, store: storeName })}
      </p>
      <p className="text-xs text-[var(--color-ink-3)]">{t('c_body', { store: storeName })}</p>
      <button
        type="button"
        onClick={onClose}
        className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)]"
      >
        {t('c_hide_store')}
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Helpers.
// ----------------------------------------------------------------------------

function StoreName({ slug }: { slug: AvailabilityCell['storeSlug'] }) {
  const t = useTranslations('availability')
  return <>{t(`store_${slug}` as 'store_migros')}</>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' })
}
