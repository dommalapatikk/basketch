import { Link } from 'react-router-dom'

import type { CategoryVerdict, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'

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

  const winnerStore = verdict.winner !== 'tie' ? verdict.winner as Store : null
  const winnerName = winnerStore ? STORE_META[winnerStore].label : 'Tied'
  const winnerHexText = winnerStore ? STORE_META[winnerStore].hexText : null
  const dotHex = winnerStore ? STORE_META[winnerStore].hex : null

  // Best avg discount to show in summary
  const winnerAvg = winnerStore
    ? (verdict.avgDiscounts[winnerStore] ?? 0)
    : Math.max(...ALL_STORES.map((s) => verdict.avgDiscounts[s] ?? 0))

  // Build aria label
  const ariaLabel = (() => {
    const catName = categoryDisplayName(verdict.category)
    if (winnerStore) {
      const deals = verdict.dealCounts[winnerStore] ?? 0
      const avg = verdict.avgDiscounts[winnerStore] ?? 0
      return `${catName} category: ${STORE_META[winnerStore].label} leads with ${deals} deals averaging ${avg}% off`
    }
    const totalDeals = ALL_STORES.reduce((sum, s) => sum + (verdict.dealCounts[s] ?? 0), 0)
    return `${catName} category: Tied with ${totalDeals} total deals`
  })()

  return (
    <Link
      to={`/deals?category=${catParam}`}
      className="flex min-h-[56px] items-center gap-3 border-b border-border px-4 py-3 no-underline transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 last:border-b-0"
      aria-label={ariaLabel}
    >
      <span className="w-[90px] shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
        {categoryDisplayName(verdict.category)}
      </span>
      <span className="inline-block size-[6px] shrink-0 rounded-full" style={{ backgroundColor: dotHex ?? '#9ca3af' }} aria-hidden="true" />
      <span className="text-sm font-bold" style={winnerHexText ? { color: winnerHexText } : undefined}>
        {winnerName}
      </span>
      <span className="text-sm text-muted">
        avg {winnerAvg}% off
      </span>
      <span className="ml-auto text-sm text-muted" aria-hidden="true">&rsaquo;</span>
    </Link>
  )
}
