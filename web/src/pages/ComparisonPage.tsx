import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import { useActiveDeals, useBasketItems, usePageTitle, useProductsWithGroups } from '../lib/hooks'
import { matchFavorites } from '../lib/matching'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'
import { Button, buttonVariants } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataFreshness } from '../components/DataFreshness'
import { SplitList } from '../components/SplitList'
import { ShareButton } from '../components/ShareButton'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { StaleBanner } from '../components/StaleBanner'

export function ComparisonPage() {
  usePageTitle('Your deals')
  const { favoriteId } = useParams<{ favoriteId: string }>()
  const [copied, setCopied] = useState(false)

  const {
    data: items,
    loading: itemsLoading,
    error: itemsError,
  } = useBasketItems(favoriteId)

  const {
    data: deals,
    loading: dealsLoading,
    error: dealsError,
  } = useActiveDeals()

  const {
    data: products,
    loading: productsLoading,
    error: productsError,
  } = useProductsWithGroups()

  const { data: pipelineRun } = useCachedQuery(
    'pipeline-run:latest',
    fetchLatestPipelineRun,
    60,
  )

  const comparisons = useMemo(() => {
    if (!items?.length || !deals?.length) return []
    return matchFavorites(items, deals, products ?? undefined)
  }, [items, deals, products])

  const loading = itemsLoading || dealsLoading || productsLoading
  const error = itemsError || dealsError || productsError

  // Check stale data
  const isStale = pipelineRun
    ? (Date.now() - new Date(pipelineRun.run_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      const input = document.createElement('input')
      input.value = window.location.href
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return <LoadingState message="Loading your deals..." />
  }

  if (error || !favoriteId) {
    if (typeof window !== 'undefined') localStorage.removeItem('basketch_favoriteId')
    return (
      <div>
        <ErrorState message={
          !favoriteId
            ? 'This comparison list was not found. It may have been deleted or the link may be incorrect.'
            : 'Could not load this week\'s deals. Your favorites are saved — please try again later.'
        } onRetry={!favoriteId ? undefined : () => window.location.reload()} />
        <Link to="/onboarding" className={buttonVariants({ fullWidth: true, className: 'mt-4' })}>
          Create a new list
        </Link>
      </div>
    )
  }

  if (items && items.length === 0) {
    return (
      <div>
        <div className="rounded-md bg-error-light p-6 text-center text-sm text-error">
          Your favorites list is empty
        </div>
        <Link to="/onboarding" className={buttonVariants({ fullWidth: true, className: 'mt-4' })}>
          Create a new list
        </Link>
      </div>
    )
  }

  const migrosItems = comparisons.filter((c) => c.recommendation === 'migros')
  const coopItems = comparisons.filter((c) => c.recommendation === 'coop')
  const withInfo = comparisons.filter((c) => c.recommendation !== 'none')

  // Summary counts
  const onSaleMigros = comparisons.filter(
    (c) => c.migrosDeal !== null,
  ).length
  const onSaleCoop = comparisons.filter(
    (c) => c.coopDeal !== null,
  ).length

  // Store totals for summary cards
  const migrosTotal = migrosItems.reduce((sum, c) => {
    if (c.migrosDeal) return sum + c.migrosDeal.sale_price
    if (c.migrosRegularPrice) return sum + c.migrosRegularPrice.price
    return sum
  }, 0)
  const coopTotal = coopItems.reduce((sum, c) => {
    if (c.coopDeal) return sum + c.coopDeal.sale_price
    if (c.coopRegularPrice) return sum + c.coopRegularPrice.price
    return sum
  }, 0)

  // Savings from splitting
  const splitSavings = withInfo.reduce((sum, c) => {
    if (c.migrosDeal && c.coopDeal) {
      return sum + Math.abs(c.migrosDeal.sale_price - c.coopDeal.sale_price)
    }
    return sum
  }, 0)

  // Check if any Coop items have coopProductKnown = false
  const hasUnknownCoopProducts = comparisons.some(
    (c) => !c.coopDeal && !c.coopProductKnown,
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your deals this week</h1>
          <p className="mt-1 text-sm text-muted">
            {comparisons.length} items tracked
          </p>
          <p className="text-sm">
            {onSaleMigros > 0 && (
              <span>
                <span className="font-semibold text-migros-text">{onSaleMigros} at Migros</span>
              </span>
            )}
            {onSaleMigros > 0 && onSaleCoop > 0 && ', '}
            {onSaleCoop > 0 && (
              <span>
                <span className="font-semibold text-coop-text">{onSaleCoop} at Coop</span>
              </span>
            )}
          </p>
        </div>
        <Link
          to={`/onboarding?edit=${favoriteId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Edit list
        </Link>
      </div>

      {/* Data freshness */}
      <div className="mb-2">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>

      {isStale && pipelineRun && (
        <div className="mb-3">
          <StaleBanner lastUpdated={pipelineRun.run_at} />
        </div>
      )}

      {/* Coop transparency label */}
      {hasUnknownCoopProducts && (
        <div className="mb-3 rounded-md bg-info-bg p-3 text-sm text-info-text" role="note">
          Coop: showing promotions found. Not all Coop products are tracked yet.
        </div>
      )}

      {/* Empty verdict */}
      {withInfo.length === 0 && comparisons.length > 0 && (
        <div className="mb-4 rounded-md border border-accent/20 bg-accent-light p-4 text-center text-sm">
          None of your favorites are on sale this week. Check back Thursday when new deals are published.
        </div>
      )}

      {/* Store total summary cards */}
      {(migrosItems.length > 0 || coopItems.length > 0) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-migros-light p-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-migros-text">Migros</div>
            <div className="mt-0.5 text-xl font-bold">CHF {migrosTotal.toFixed(2)}</div>
            <div className="text-xs text-muted">{migrosItems.length} item{migrosItems.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="rounded-md bg-coop-light p-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-coop-text">Coop</div>
            <div className="mt-0.5 text-xl font-bold">CHF {coopTotal.toFixed(2)}</div>
            <div className="text-xs text-muted">{coopItems.length} item{coopItems.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      )}

      {/* Savings estimate */}
      {splitSavings > 0 && (
        <div className="mb-4 rounded-md bg-success-light p-3 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-success">Estimated savings by splitting</div>
          <div className="mt-0.5 text-2xl font-bold text-success">CHF {splitSavings.toFixed(2)}</div>
        </div>
      )}

      {/* Split shopping list */}
      <SplitList comparisons={comparisons} />

      {/* Save section */}
      <Card className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Save this list</h2>
        <p className="mb-3 text-sm text-muted">
          Bookmark this page or copy the link to check your deals every week.
        </p>
        <p className="mb-2 text-sm text-muted">Your personal link</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyLink} type="button">
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
          <ShareButton
            title="My grocery deals — basketch"
            text="Check out my split shopping list for Migros and Coop"
          >
            Share this list
          </ShareButton>
        </div>
      </Card>

      {/* Edit button */}
      <div className="mt-4 text-center">
        <Link
          to={`/onboarding?edit=${favoriteId}`}
          className={buttonVariants({ variant: 'outline', fullWidth: true })}
        >
          Edit my list
        </Link>
      </div>
    </div>
  )
}
