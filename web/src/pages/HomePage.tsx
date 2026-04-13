import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { Category, DealRow } from '@shared/types'
import { useActiveDeals, usePageTitle } from '../lib/hooks'
import { calculateVerdict } from '../lib/verdict'
import { VerdictBanner } from '../components/VerdictBanner'
import { VerdictCard } from '../components/VerdictCard'
import { CategorySection } from '../components/CategorySection'
import { EmailLookup } from '../components/EmailLookup'
import { DataFreshness } from '../components/DataFreshness'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { buttonVariants } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'

function dealsByCategory(deals: DealRow[], category: Category): DealRow[] {
  return deals.filter((d) => d.category === category)
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

  const freshDeals = useMemo(() => dealsByCategory(deals ?? [], 'fresh'), [deals])
  const longLifeDeals = useMemo(() => dealsByCategory(deals ?? [], 'long-life'), [deals])
  const nonFoodDeals = useMemo(() => dealsByCategory(deals ?? [], 'non-food'), [deals])

  const migrosDeals = useMemo(() => ({
    fresh: freshDeals.filter((d) => d.store === 'migros'),
    longLife: longLifeDeals.filter((d) => d.store === 'migros'),
    nonFood: nonFoodDeals.filter((d) => d.store === 'migros'),
  }), [freshDeals, longLifeDeals, nonFoodDeals])

  const coopDeals = useMemo(() => ({
    fresh: freshDeals.filter((d) => d.store === 'coop'),
    longLife: longLifeDeals.filter((d) => d.store === 'coop'),
    nonFood: nonFoodDeals.filter((d) => d.store === 'coop'),
  }), [freshDeals, longLifeDeals, nonFoodDeals])

  return (
    <div>
      {/* Hero section — always renders (no data dependency) */}
      <section className="py-8 text-center">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
          Which store has better promotions this week?
        </h1>
        <p className="mt-2 text-base text-muted">
          Your weekly Migros vs Coop deals, compared in 5 seconds.
        </p>
      </section>

      {/* Loading state */}
      {loading && <LoadingState message="Loading this week's deals..." />}

      {/* Error state */}
      {error && !loading && (
        <ErrorState
          message="Could not load this week's deals. Please try again later."
          onRetry={refetch}
        />
      )}

      {/* No data at all */}
      {!loading && !error && deals && deals.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-muted">
            No deals available yet. Check back Thursday evening when new promotions are published.
          </p>
        </Card>
      )}

      {/* Success state — verdict + categories */}
      {!loading && !error && verdict && (
        <>
          {/* Weekly Verdict Banner */}
          <section className="mb-4">
            <VerdictBanner verdict={verdict} />
          </section>

          {/* 3 Category Snapshot Cards */}
          <section className="mb-4 space-y-3">
            {verdict.categories[0] && (
              <CategorySection
                verdict={verdict.categories[0]}
                migrosDeals={migrosDeals.fresh}
                coopDeals={coopDeals.fresh}
              />
            )}
            {verdict.categories[1] && (
              <CategorySection
                verdict={verdict.categories[1]}
                migrosDeals={migrosDeals.longLife}
                coopDeals={coopDeals.longLife}
              />
            )}
            {verdict.categories[2] && (
              <CategorySection
                verdict={verdict.categories[2]}
                migrosDeals={migrosDeals.nonFood}
                coopDeals={coopDeals.nonFood}
              />
            )}
          </section>

          {/* Wordle Verdict Card (below category cards) */}
          <section className="mb-6">
            <VerdictCard verdict={verdict} />
          </section>
        </>
      )}

      {/* Browse all deals CTA */}
      <div className="mb-4">
        <Link
          to="/deals"
          className={buttonVariants({ fullWidth: true })}
        >
          Browse all deals
        </Link>
      </div>

      {/* Returning user banner (conditional) */}
      {storedFavoriteId && (
        <div className="mb-4 rounded-md border-l-4 border-accent bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Welcome back.</span>
            <Link
              to={`/compare/${storedFavoriteId}`}
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent no-underline hover:underline"
            >
              View your deals &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* Track your items section */}
      <section className="mb-4">
        <h2 className="mb-1 text-xl font-bold">Track your regular items</h2>
        <p className="mb-3 text-sm text-muted">
          Get a personal comparison every week. Setup in 60 seconds.
        </p>
        <Link
          to="/onboarding"
          className={buttonVariants({ variant: 'outline', fullWidth: true })}
        >
          Set up my list
        </Link>
      </section>

      {/* Email lookup */}
      <section className="mb-6">
        <EmailLookup />
      </section>

      {/* Data freshness */}
      <div className="text-center">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>
    </div>
  )
}
