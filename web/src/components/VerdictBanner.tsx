import type { ReactNode } from 'react'

import type { WeeklyVerdict } from '@shared/types'
import { ShareButton } from './ShareButton'
import { StaleBanner } from './StaleBanner'

function StoreLabel(props: { store: 'migros' | 'coop' }) {
  const label = props.store === 'migros' ? 'Migros' : 'Coop'
  const className = props.store === 'migros'
    ? 'font-bold text-migros-text'
    : 'font-bold text-coop-text'
  return (
    <span className={className} aria-label={`${label} (store)`}>
      {label}
    </span>
  )
}

function verdictContent(verdict: WeeklyVerdict): ReactNode {
  const winners = verdict.categories.filter((c) => c.winner !== 'tie')

  if (winners.length === 0) {
    return <>Similar promotions at both stores this week</>
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
            <StoreLabel store={c.winner as 'migros' | 'coop'} /> for {catLabel}
          </span>
        )
      })}
    </>
  )
}

function transparencyLine(verdict: WeeklyVerdict): string {
  const migrosDeals = verdict.categories.reduce((sum, c) => sum + c.migrosDeals, 0)
  const coopDeals = verdict.categories.reduce((sum, c) => sum + c.coopDeals, 0)
  const migrosAvg = verdict.categories.length > 0
    ? Math.round(verdict.categories.reduce((sum, c) => sum + c.migrosAvgDiscount, 0) / verdict.categories.length)
    : 0
  const coopAvg = verdict.categories.length > 0
    ? Math.round(verdict.categories.reduce((sum, c) => sum + c.coopAvgDiscount, 0) / verdict.categories.length)
    : 0

  return `Based on ${migrosDeals} Migros deals (avg ${migrosAvg}% off) vs ${coopDeals} Coop deals (avg ${coopAvg}% off)`
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
          Partial data — one source is missing this week
        </div>
      )}
    </div>
  )
}
