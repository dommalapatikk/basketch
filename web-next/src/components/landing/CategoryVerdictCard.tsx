import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { CATEGORY_ACCENT } from '@/lib/store-tokens'
import { STORE_BRAND } from '@/lib/store-tokens'
import type { CategoryVerdict, DealCategory } from '@/lib/types'

type Props = {
  verdict: CategoryVerdict
  label: string
}

export function CategoryVerdictCard({ verdict, label }: Props) {
  const t = useTranslations('category_card')

  const rightLabel =
    verdict.state === 'winner' && verdict.winner
      ? STORE_BRAND[verdict.winner].label
      : verdict.state === 'tied'
        ? t('tied')
        : verdict.state === 'single-store'
          ? t('single_store')
          : t('no_data')

  const isMuted = verdict.state === 'no-data' || verdict.state === 'single-store'
  const accent = CATEGORY_ACCENT[verdict.category as DealCategory] ?? 'var(--cat-other)'

  return (
    <Link
      href={{ pathname: '/deals', query: { category: verdict.category } }}
      className="group relative block overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-5 transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-page)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-semibold text-[var(--color-ink)]">
            {rightLabel}
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-[var(--color-ink-3)]">
            {t('avg_off', {
              pct: Math.round(verdict.avgDiscountPct),
              count: verdict.dealCount,
            })}
          </p>
        </div>
        <ChevronRight
          aria-hidden
          className={`mt-1 h-5 w-5 shrink-0 ${isMuted ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink-2)]'} transition-transform group-hover:translate-x-0.5`}
        />
      </div>
      {/* 4px bottom accent in category color — spec §5.1 */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1"
        style={{ background: accent }}
      />
    </Link>
  )
}
