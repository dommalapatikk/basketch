import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import type { Store } from '@shared/types'
import { ALL_STORES, DEFAULT_STORES, STORE_META } from '@shared/types'
import { useActiveDeals, useBasketItems, usePageTitle, useProductsWithGroups } from '../lib/hooks'
import { matchFavorites } from '../lib/matching'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'
import { Button, buttonVariants } from '../components/ui/Button'
import { DataFreshness } from '../components/DataFreshness'
import { SplitList } from '../components/SplitList'
import { ShareButton } from '../components/ShareButton'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { StaleBanner } from '../components/StaleBanner'

const LAST_SEEN_PIPELINE_KEY = 'basketch_lastSeenPipeline'

export function ComparisonPage() {
  usePageTitle('Your deals')
  const { favoriteId } = useParams<{ favoriteId: string }>()
  const [copied, setCopied] = useState(false)
  const [selectedStores, setSelectedStores] = useState<Set<Store>>(() => new Set(DEFAULT_STORES))
  const [storeLimit, setStoreLimit] = useState(false)
  const [showNewDeals, setShowNewDeals] = useState(false)

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

  // Fix 3: useMemo must be called before any early returns (Rules of Hooks)
  const filtered = useMemo(() => {
    return comparisons.map((c) => {
      let bestStore: Store | 'none' = 'none'
      let bestDeal = c.bestDeal
      let lowestPrice = Infinity
      for (const store of Array.from(selectedStores)) {
        const match = c.stores[store]
        if (match?.deal && match.deal.sale_price < lowestPrice) {
          lowestPrice = match.deal.sale_price
          bestStore = store
          bestDeal = match.deal
        }
      }
      if (bestStore === 'none') bestDeal = null
      return { ...c, bestStore: bestStore as Store | 'none', bestDeal }
    })
  }, [comparisons, selectedStores])

  const loading = itemsLoading || dealsLoading || productsLoading
  const error = itemsError || dealsError || productsError

  // Check stale data
  const isStale = pipelineRun
    ? (Date.now() - new Date(pipelineRun.run_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false

  // Fix 2: "Deals refreshed" signal for returning users
  useEffect(() => {
    if (!pipelineRun) return
    try {
      const lastSeen = localStorage.getItem(LAST_SEEN_PIPELINE_KEY)
      if (lastSeen && lastSeen !== pipelineRun.run_at) {
        setShowNewDeals(true)
      }
      localStorage.setItem(LAST_SEEN_PIPELINE_KEY, pipelineRun.run_at)
    } catch { /* localStorage unavailable */ }
  }, [pipelineRun])

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

  // Fix 1: Only clear localStorage when basket ID is missing from URL (confirmed not found),
  // not on transient network errors which would destroy the user's saved basket reference
  if (!favoriteId) {
    if (typeof window !== 'undefined') localStorage.removeItem('basketch_favoriteId')
    return (
      <div>
        <ErrorState message="This comparison list was not found. It may have been deleted or the link may be incorrect." />
        <Link to="/onboarding" className={buttonVariants({ fullWidth: true, className: 'mt-4' })}>
          Create a new list
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <ErrorState
          message="Could not load this week's deals. Your favorites are saved — please try again later."
          onRetry={() => window.location.reload()}
        />
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

  const MAX_COMPARE_STORES = 3

  function toggleStore(store: Store) {
    if (selectedStores.has(store)) {
      if (selectedStores.size > 1) {
        const next = new Set(selectedStores)
        next.delete(store)
        setSelectedStores(next)
      }
      setStoreLimit(false)
    } else if (selectedStores.size >= MAX_COMPARE_STORES) {
      setStoreLimit(true)
    } else {
      const next = new Set(selectedStores)
      next.add(store)
      setSelectedStores(next)
      setStoreLimit(false)
    }
  }

  // Items that have a best deal at some selected store
  const withDeals = filtered.filter((c) => c.bestStore !== 'none')

  // Count items on sale per selected store
  const onSaleByStore: Partial<Record<Store, number>> = {}
  for (const comp of filtered) {
    for (const store of Array.from(selectedStores)) {
      if (comp.stores[store]?.deal) {
        onSaleByStore[store] = (onSaleByStore[store] ?? 0) + 1
      }
    }
  }

  // Top 3 stores by item count for summary cards
  const storesWithItems = Array.from(selectedStores)
    .filter((s) => filtered.some((c) => c.bestStore === s))
    .sort((a, b) => {
      const aCount = filtered.filter((c) => c.bestStore === a).length
      const bCount = filtered.filter((c) => c.bestStore === b).length
      return bCount - aCount
    })
    .slice(0, 3)

  // Store totals for summary cards
  const storeTotals: Partial<Record<Store, number>> = {}
  for (const store of storesWithItems) {
    const total = filtered
      .filter((c) => c.bestStore === store)
      .reduce((sum, c) => {
        const match = c.stores[store]
        if (match?.deal) return sum + match.deal.sale_price
        if (match?.regularPrice) return sum + match.regularPrice.price
        return sum
      }, 0)
    storeTotals[store] = total
  }

  // Savings estimate: for items where 2+ selected stores have deals
  const splitSavings = withDeals.reduce((sum, c) => {
    const dealPrices = Array.from(selectedStores)
      .map((s) => c.stores[s]?.deal?.sale_price)
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b)
    if (dealPrices.length >= 2) {
      return sum + (dealPrices[1]! - dealPrices[0]!)
    }
    return sum
  }, 0)

  // Build on-sale summary text
  const onSaleParts = Array.from(selectedStores)
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
                  <span className="font-semibold" style={{ color: p.meta.hexText }}>
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

      {/* Store filter pills */}
      <div className="mb-3 flex flex-wrap gap-2">
        {ALL_STORES.map((store) => {
          const meta = STORE_META[store]
          const active = selectedStores.has(store)
          return (
            <button
              key={store}
              type="button"
              onClick={() => toggleStore(store)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 border-2 bg-white"
              style={active
                ? { backgroundColor: meta.hex, color: 'white', borderColor: meta.hex }
                : { color: meta.hexText, borderColor: meta.hexText }}
              aria-pressed={active}
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* Store limit message */}
      {storeLimit && (
        <div className="mb-2 rounded-md bg-accent-light px-3 py-2 text-center text-sm text-accent">
          You can compare up to {MAX_COMPARE_STORES} stores at a time. Deselect one to add another.
        </div>
      )}

      {/* Data freshness */}
      <div className="mb-2">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>

      {isStale && pipelineRun && (
        <div className="mb-3">
          <StaleBanner lastUpdated={pipelineRun.run_at} />
        </div>
      )}

      {/* Fix 2: "Deals refreshed" signal for returning users */}
      {showNewDeals && !isStale && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-accent-light px-3 py-2">
          <span className="text-sm font-semibold text-accent">New deals this week</span>
          <button
            type="button"
            className="text-xs text-muted hover:text-current"
            onClick={() => setShowNewDeals(false)}
            aria-label="Dismiss"
          >
            Dismiss
          </button>
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
            const itemCount = filtered.filter((c) => c.bestStore === store).length
            const total = storeTotals[store] ?? 0
            return (
              <div key={store} className="rounded-md p-3 text-center" style={{ backgroundColor: meta.hexLight }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.hexText }}>
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

      {/* Fix 4: Save/share moved above the fold, near peak value moment */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopyLink} type="button">
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <ShareButton
          title="My grocery deals — basketch"
          text="Check out my split shopping list for Swiss grocery stores"
        >
          Share
        </ShareButton>
        <span className="ml-auto text-xs text-muted">Bookmark this page to check every week</span>
      </div>

      {/* Split shopping list */}
      <SplitList comparisons={filtered} />

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
