import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import type { Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
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

  // Items that have a best deal at some store
  const withDeals = comparisons.filter((c) => c.bestStore !== 'none')

  // Count items on sale per store
  const onSaleByStore: Partial<Record<Store, number>> = {}
  for (const comp of comparisons) {
    for (const store of ALL_STORES) {
      if (comp.stores[store]?.deal) {
        onSaleByStore[store] = (onSaleByStore[store] ?? 0) + 1
      }
    }
  }

  // Top 3 stores by item count for summary cards
  const storesWithItems = ALL_STORES
    .filter((s) => comparisons.some((c) => c.bestStore === s))
    .sort((a, b) => {
      const aCount = comparisons.filter((c) => c.bestStore === a).length
      const bCount = comparisons.filter((c) => c.bestStore === b).length
      return bCount - aCount
    })
    .slice(0, 3)

  // Store totals for summary cards
  const storeTotals: Partial<Record<Store, number>> = {}
  for (const store of storesWithItems) {
    const total = comparisons
      .filter((c) => c.bestStore === store)
      .reduce((sum, c) => {
        const match = c.stores[store]
        if (match?.deal) return sum + match.deal.sale_price
        if (match?.regularPrice) return sum + match.regularPrice.price
        return sum
      }, 0)
    storeTotals[store] = total
  }

  // Savings estimate: for items where 2+ stores have deals, the diff between best and second-best
  const splitSavings = withDeals.reduce((sum, c) => {
    const dealPrices = ALL_STORES
      .map((s) => c.stores[s]?.deal?.sale_price)
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b)
    if (dealPrices.length >= 2) {
      return sum + (dealPrices[1]! - dealPrices[0]!)
    }
    return sum
  }, 0)

  // Build on-sale summary text
  const onSaleParts = ALL_STORES
    .filter((s) => (onSaleByStore[s] ?? 0) > 0)
    .map((s) => {
      const meta = STORE_META[s]
      return { store: s, count: onSaleByStore[s]!, meta }
    })

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your deals this week</h1>
          <p className="mt-1 text-sm text-muted">
            {comparisons.length} items tracked
          </p>
          {onSaleParts.length > 0 && (
            <p className="text-sm">
              {onSaleParts.map((p, i) => (
                <span key={p.store}>
                  {i > 0 && ', '}
                  <span className={`font-semibold ${p.meta.colorText}`}>
                    {p.count} at {p.meta.label}
                  </span>
                </span>
              ))}
            </p>
          )}
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

      {/* Empty verdict */}
      {withDeals.length === 0 && comparisons.length > 0 && (
        <div className="mb-4 rounded-md border border-accent/20 bg-accent-light p-4 text-center text-sm">
          None of your favorites are on sale this week. Check back Thursday when new deals are published.
        </div>
      )}

      {/* Store total summary cards — top 3 stores */}
      {storesWithItems.length > 0 && (
        <div className={`mb-4 grid gap-2 ${storesWithItems.length === 1 ? 'grid-cols-1' : storesWithItems.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {storesWithItems.map((store) => {
            const meta = STORE_META[store]
            const itemCount = comparisons.filter((c) => c.bestStore === store).length
            const total = storeTotals[store] ?? 0
            return (
              <div key={store} className={`rounded-md p-3 text-center ${meta.colorLight}`}>
                <div className={`text-xs font-semibold uppercase tracking-wide ${meta.colorText}`}>
                  {meta.label}
                </div>
                <div className="mt-0.5 text-xl font-bold">CHF {total.toFixed(2)}</div>
                <div className="text-xs text-muted">{itemCount} item{itemCount !== 1 ? 's' : ''}</div>
              </div>
            )
          })}
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
            text="Check out my split shopping list for Swiss grocery stores"
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
