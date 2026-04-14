import type { ReactNode } from 'react'

import type { Store, WeeklyVerdict } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { ShareButton } from './ShareButton'
import { StaleBanner } from './StaleBanner'

function StoreLabel(props: { store: Store }) {
  const meta = STORE_META[props.store]
  return (
    <span className="font-bold" style={{ color: meta.hexText }} aria-label={`${meta.label} (store)`}>
      {meta.label}
    </span>
  )
}

function verdictContent(verdict: WeeklyVerdict): ReactNode {
  const winners = verdict.categories.filter((c) => c.winner !== 'tie')

  if (winners.length === 0) {
    return <>Similar promotions across stores this week</>
  }

  return (
    <>
      This week:{' '}
      {winners.map((c, i) => {
        const catLabel = c.category === 'fresh' ? 'Fresh'
          : c.category === 'long-life' ? 'Long-life'
            : 'Household'
        return (
          <span key={c.category}>
            {i > 0 && ', '}
            <StoreLabel store={c.winner as Store} /> for {catLabel}
          </span>
        )
      })}
    </>
  )
}

function transparencyLine(verdict: WeeklyVerdict): string {
  // Summarise deal counts per store across all categories
  const storeTotals: Partial<Record<Store, number>> = {}
  const storeAvgDiscounts: Partial<Record<Store, number[]>> = {}

  for (const cat of verdict.categories) {
    for (const store of ALL_STORES) {
      const count = cat.dealCounts[store]
      const avg = cat.avgDiscounts[store]
      if (count !== undefined && count > 0) {
        storeTotals[store] = (storeTotals[store] ?? 0) + count
      }
      if (avg !== undefined && avg > 0) {
        const arr = storeAvgDiscounts[store] ?? []
        arr.push(avg)
        storeAvgDiscounts[store] = arr
      }
    }
  }

  // Report for stores that have any data
  const storesWithData = ALL_STORES.filter((s) => (storeTotals[s] ?? 0) > 0)
  if (storesWithData.length === 0) return 'No deal data available'

  const parts = storesWithData.map((store) => {
    const count = storeTotals[store] ?? 0
    const avgs = storeAvgDiscounts[store] ?? []
    const avg = avgs.length > 0
      ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length)
      : 0
    return `${STORE_META[store].label}: ${count} deals (avg ${avg}% off)`
  })

  return `Based on ${parts.join(' vs ')}`
}

export interface VerdictBannerProps {
  verdict: WeeklyVerdict | null
}

export function VerdictBanner(props: VerdictBannerProps) {
  if (!props.verdict) return null

  const { verdict } = props

  return (
    <div role="status" aria-live="polite">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Weekly Verdict
        </div>
        <div className="text-base font-semibold">{verdictContent(verdict)}</div>
        <p className="mt-2 text-sm text-muted">{transparencyLine(verdict)}</p>
        <div className="mt-3">
          <ShareButton
            title="basketch — This Week's Verdict"
            text="Which store has better promotions this week?"
          >
            Share verdict
          </ShareButton>
        </div>
      </div>

      {verdict.dataFreshness === 'stale' && (
        <div className="mt-2">
          <StaleBanner lastUpdated={verdict.lastUpdated} />
        </div>
      )}
      {verdict.dataFreshness === 'partial' && (
        <div className="mt-2 rounded-md bg-warning-light p-3 text-sm text-warning">
          Partial data — some stores are missing this week
        </div>
      )}
    </div>
  )
}
