import type { ReactNode } from 'react'

import type { WeeklyVerdict } from '@shared/types'

function StoreLabel(props: { store: 'migros' | 'coop' }) {
  const label = props.store === 'migros' ? 'Migros' : 'Coop'
  const className = props.store === 'migros' ? 'font-bold text-migros' : 'font-bold text-coop'
  return <span className={className}>{label}</span>
}

function verdictContent(verdict: WeeklyVerdict): ReactNode {
  const winners = verdict.categories.filter((c) => c.winner !== 'tie')

  if (winners.length === 0) return <>It's a tie this week!</>

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

export function VerdictBanner(props: { verdict: WeeklyVerdict | null }) {
  if (!props.verdict) return null

  const { verdict } = props

  return (
    <div className="mb-4 rounded-md border border-border bg-surface p-4 text-center">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Weekly Verdict</div>
      <div className="font-semibold">{verdictContent(verdict)}</div>
      {verdict.dataFreshness === 'stale' && (
        <div className="mt-2 text-xs text-warning">Data may be outdated</div>
      )}
      {verdict.dataFreshness === 'partial' && (
        <div className="mt-2 text-xs text-warning">Partial data — one source is missing</div>
      )}
    </div>
  )
}
