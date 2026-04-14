import { Link } from 'react-router-dom'

import type { CategoryVerdict } from '@shared/types'

function categoryDisplayName(cat: string): string {
  if (cat === 'fresh') return 'FRESH'
  if (cat === 'long-life') return 'LONG-LIFE'
  return 'NON-FOOD'
}

export interface CategorySectionProps {
  verdict: CategoryVerdict
}

export function CategorySection(props: CategorySectionProps) {
  const { verdict } = props
  const catParam = verdict.category

  const winnerName = verdict.winner === 'migros' ? 'Migros'
    : verdict.winner === 'coop' ? 'Coop'
    : 'Tied'
  const winnerColor = verdict.winner === 'migros' ? 'text-migros-text'
    : verdict.winner === 'coop' ? 'text-coop-text'
    : 'text-muted'
  const dotColor = verdict.winner === 'migros' ? 'bg-migros'
    : verdict.winner === 'coop' ? 'bg-coop'
    : 'bg-gray-400'

  const winnerAvg = verdict.winner === 'migros' ? verdict.migrosAvgDiscount
    : verdict.winner === 'coop' ? verdict.coopAvgDiscount
    : Math.max(verdict.migrosAvgDiscount, verdict.coopAvgDiscount)

  const ariaLabel = `${categoryDisplayName(verdict.category)} category: ${
    verdict.winner === 'migros'
      ? `Migros leads with ${verdict.migrosDeals} deals averaging ${verdict.migrosAvgDiscount}% off`
      : verdict.winner === 'coop'
        ? `Coop leads with ${verdict.coopDeals} deals averaging ${verdict.coopAvgDiscount}% off`
        : `Tied with ${verdict.migrosDeals} Migros and ${verdict.coopDeals} Coop deals`
  }`

  return (
    <Link
      to={`/deals?category=${catParam}`}
      className="flex min-h-[56px] items-center gap-3 border-b border-border px-4 py-3 no-underline transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 last:border-b-0"
      aria-label={ariaLabel}
    >
      <span className="w-[90px] shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
        {categoryDisplayName(verdict.category)}
      </span>
      <span className={`inline-block size-[6px] shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
      <span className={`text-sm font-bold ${winnerColor}`}>
        {winnerName}
      </span>
      <span className="text-sm text-muted">
        avg {winnerAvg}% off
      </span>
      <span className="ml-auto text-sm text-muted" aria-hidden="true">&rsaquo;</span>
    </Link>
  )
}
