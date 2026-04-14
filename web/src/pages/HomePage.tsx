import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { useActiveDeals, usePageTitle } from '../lib/hooks'
import { calculateVerdict } from '../lib/verdict'
import { CategorySection } from '../components/CategorySection'
import { EmailLookup } from '../components/EmailLookup'
import { ShareVerdict } from '../components/ShareVerdict'
import { DataFreshness } from '../components/DataFreshness'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { buttonVariants } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'

function VerdictLine(props: { verdict: ReturnType<typeof calculateVerdict> }) {
  const { verdict } = props
  const winners = verdict.categories.filter((c) => c.winner !== 'tie')
  const totalDeals = verdict.categories.reduce(
    (s, c) => s + ALL_STORES.reduce((sum, store) => sum + (c.dealCounts[store] ?? 0), 0),
    0,
  )

  if (winners.length === 0) {
    return (
      <p className="text-base font-semibold">
        Similar promotions across stores this week
      </p>
    )
  }

  // Check if one store sweeps all categories
  const uniqueWinners = new Set(winners.map((c) => c.winner))
  if (uniqueWinners.size === 1 && winners.length === verdict.categories.length) {
    const store = winners[0]!.winner as Store
    const meta = STORE_META[store]
    return (
      <>
        <p className="text-base font-semibold">
          <span className="font-bold" style={{ color: meta.hexText }}>{meta.label}</span> leads across the board
        </p>
        <p className="mt-1 text-xs text-muted">Based on {totalDeals} deals compared</p>
      </>
    )
  }

  return (
    <>
      <p className="text-base font-semibold">
        {winners.map((c, i) => {
          const store = c.winner as Store
          const meta = STORE_META[store]
          const catLabel = c.category === 'fresh' ? 'Fresh'
            : c.category === 'long-life' ? 'Long-life'
            : 'Household'
          return (
            <span key={c.category}>
              {i > 0 && ', '}
              <span className="font-bold" style={{ color: meta.hexText }}>{meta.label}</span> for {catLabel}
            </span>
          )
        })}
      </p>
      <p className="mt-1 text-xs text-muted">Based on {totalDeals} deals compared</p>
    </>
  )
}

export function HomePage() {
  usePageTitle()

  const { data: deals, loading, error, refetch } = useActiveDeals()
  const { data: pipelineRun } = useCachedQuery(
    'pipeline-run:latest',
    fetchLatestPipelineRun,
    60,
  )

  const storedFavoriteId = typeof window !== 'undefined'
    ? localStorage.getItem('basketch_favoriteId')
    : null

  const verdict = useMemo(() => {
    if (!deals || deals.length === 0) return null
    return calculateVerdict(deals)
  }, [deals])

  return (
    <div>
      {/* Headline */}
      <h1 className="py-4 text-center text-2xl font-extrabold leading-tight tracking-tight">
        Which store wins this week?
      </h1>

      {/* Loading */}
      {loading && <LoadingState message="Loading deals..." />}

      {/* Error */}
      {error && !loading && (
        <ErrorState
          message="Could not load deals. Please try again later."
          onRetry={refetch}
        />
      )}

      {/* No data */}
      {!loading && !error && deals && deals.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-muted">
            No deals yet. Check back Thursday evening.
          </p>
        </Card>
      )}

      {/* Verdict + categories */}
      {!loading && !error && verdict && (
        <>
          {/* Verdict answer */}
          <section className="mb-3 rounded-md border border-border bg-surface p-4">
            <VerdictLine verdict={verdict} />
          </section>

          {/* Category rows */}
          <div className="mb-4 rounded-md border border-border bg-surface">
            {verdict.categories.map((cat) => (
              <CategorySection key={cat.category} verdict={cat} />
            ))}
          </div>

          {/* Share verdict — compact inline button */}
          <div className="mb-4 text-center">
            <ShareVerdict verdict={verdict} />
          </div>
        </>
      )}

      {/* Primary CTA */}
      <div className="mb-6">
        <Link to="/deals" className={buttonVariants({ fullWidth: true })}>
          Browse all deals
        </Link>
      </div>

      {/* Personalisation — one compact section */}
      <section className="mb-4 rounded-md border border-border bg-surface p-4">
        {storedFavoriteId ? (
          <div className="flex items-center justify-between">
            <span className="text-sm">Your personal comparison is ready.</span>
            <Link
              to={`/compare/${storedFavoriteId}`}
              className="min-h-[44px] inline-flex items-center text-sm font-semibold text-accent no-underline hover:underline"
            >
              View &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm">Track your regular items for a personal comparison.</span>
            <Link
              to="/onboarding"
              className="min-h-[44px] inline-flex items-center text-sm font-semibold text-accent no-underline hover:underline"
            >
              Set up &rarr;
            </Link>
          </div>
        )}
        <div className="mt-3 border-t border-border pt-3">
          <EmailLookup />
        </div>
      </section>

      {/* Data freshness */}
      <div className="pb-4 text-center">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>
    </div>
  )
}
