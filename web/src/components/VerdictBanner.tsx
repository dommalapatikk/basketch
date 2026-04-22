import type { ReactNode } from 'react'

import type { Store, WeeklyVerdict } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { ShareButton } from './ShareButton'
import { StaleBanner } from './StaleBanner'
import { verdictWhatsAppUrl } from '../lib/verdict-share'

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={verdictWhatsAppUrl(verdict)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1ea855] focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
            aria-label="Send this week's verdict to WhatsApp"
          >
            <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.88 11.88 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.82 11.82 0 0020.885 3.488"/>
            </svg>
            Send to WhatsApp
          </a>
          <ShareButton
            title="basketch — This Week's Verdict"
            text="Which store has better promotions this week?"
          >
            Copy link
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
