'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

// S1 fix — persistent ? help popover replacing the one-time dismissible tooltip.
// Tappable on every visit; recall-friendly for users returning after weeks.

type Props = { onClose: () => void }

export function AvailabilityHelpPopover({ onClose }: Props) {
  const t = useTranslations('availability')

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
      aria-labelledby="availability-help-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,11,15,0.45)] p-4"
      onClick={onClose}
    >
      <div
        className="max-w-sm rounded-[var(--radius-lg)] bg-[var(--color-paper)] p-5 shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="availability-help-title" className="text-base font-semibold text-[var(--color-ink)]">
            {t('help_title')}
          </h3>
          <button
            type="button"
            aria-label={t('help_close')}
            onClick={onClose}
            className="rounded-full p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <ul className="space-y-3 text-sm text-[var(--color-ink)]">
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-ink)]" />
            <span><strong>{t('help_a_label')}</strong> — {t('help_a_body')}</span>
          </li>
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-ink-2)]" />
            <span><strong>{t('help_b_label')}</strong> — {t('help_b_body')}</span>
          </li>
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-1 block h-2.5 w-2.5 shrink-0 border border-[var(--color-ink-3)]" />
            <span><strong>{t('help_c_label')}</strong> — {t('help_c_body')}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
