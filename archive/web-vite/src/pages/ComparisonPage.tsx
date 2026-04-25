import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import type { CategoryMatch, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { useCategoryMatches, usePageTitle } from '../lib/hooks'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'
import { Button, buttonVariants } from '../components/ui/Button'
import { DataFreshness } from '../components/DataFreshness'
import { CategoryDealsSection } from '../components/CategoryDealsSection'
import type { BandDeal } from '../components/SubCategoryBand'
import { SubCategoryBand } from '../components/SubCategoryBand'
import { ShareButton } from '../components/ShareButton'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { StaleBanner } from '../components/StaleBanner'

/** Convert a CategoryMatch to BandDeal[] — one best deal per store, sorted cheapest-promo-first. */
function matchToBandDeals(match: CategoryMatch): BandDeal[] {
  const bands: BandDeal[] = []
  for (const store of ALL_STORES as Store[]) {
    const storeDeals = match.dealsByStore[store] ?? []
    if (storeDeals.length === 0) continue
    const promoDeals = storeDeals.filter((d) => d.discount_percent > 0)
      .sort((a, b) => a.sale_price - b.sale_price)
    const regularDeals = storeDeals.sort((a, b) => a.sale_price - b.sale_price)
    const best = promoDeals[0] ?? regularDeals[0]
    if (!best) continue
    bands.push({
      id: best.id,
      store: best.store,
      productName: best.product_name,
      salePrice: best.sale_price,
      regularPrice: best.original_price,
      discountPercent: best.discount_percent,
      hasPromo: best.discount_percent > 0,
    })
  }
  return bands.sort((a, b) => {
    if (a.hasPromo !== b.hasPromo) return a.hasPromo ? -1 : 1
    return a.salePrice - b.salePrice
  })
}

const LAST_SEEN_PIPELINE_KEY = 'basketch_lastSeenPipeline'

export function ComparisonPage() {
  usePageTitle('Your deals')
  const { favoriteId } = useParams<{ favoriteId: string }>()
  const [copied, setCopied] = useState(false)
  const [showNewDeals, setShowNewDeals] = useState(false)
  const [compareView, setCompareView] = useState<'per-item' | 'per-store'>('per-item')

  const { data: result, items: basketItems, itemCount, loading, error, refetch } = useCategoryMatches(favoriteId)

  const { data: pipelineRun } = useCachedQuery(
    'pipeline-run:latest',
    fetchLatestPipelineRun,
    60,
  )

  const isStale = pipelineRun
    ? (Date.now() - new Date(pipelineRun.run_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false

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
    const url = window.location.href
    const fallback = () => {
      try {
        const input = document.createElement('input')
        input.value = url
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      } catch { /* silent */ }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    if (!navigator.clipboard) { fallback(); return }
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(fallback)
  }

  if (loading) {
    return <LoadingState message="Loading your deals..." />
  }

  const isValidUUID = favoriteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(favoriteId)

  if (!favoriteId || !isValidUUID) {
    return (
      <div>
        <ErrorState message="This list was not found. The link may be incorrect or the list may have been deleted." />
        <div className="mt-4 flex flex-col gap-2">
          <Link to="/onboarding" className={buttonVariants({ fullWidth: true })}>
            Create a new list
          </Link>
          <Link to="/" className={buttonVariants({ variant: 'outline', fullWidth: true })}>
            Go to homepage
          </Link>
        </div>
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
        <Link to="/" className={buttonVariants({ variant: 'outline', fullWidth: true, className: 'mt-4' })}>
          Go to homepage
        </Link>
      </div>
    )
  }

  if (itemCount === 0) {
    return (
      <div>
        <div className="rounded-md border border-border bg-surface p-6 text-center text-sm text-muted">
          Your list is empty — browse deals and tap + to add items.
        </div>
        <Link to="/deals" className={buttonVariants({ fullWidth: true, className: 'mt-4' })}>
          Browse deals
        </Link>
        <Link to="/onboarding" className={buttonVariants({ variant: 'outline', fullWidth: true, className: 'mt-2' })}>
          Start a new list
        </Link>
      </div>
    )
  }

  const categoryCount = result?.categories.length ?? 0
  const unmappedCount = result?.unmappedItems.length ?? 0
  const bandsByMatch = (result?.categories ?? []).map((match) => ({
    match,
    bands: matchToBandDeals(match),
  }))

  // Compute verdict sentence: tally cheapest store across all bands
  const verdictSentence = (() => {
    if (bandsByMatch.length === 0) return null
    const storeCheapestCount = new Map<Store, number>()
    for (const { bands } of bandsByMatch) {
      const hero = bands[0]
      if (hero && hero.hasPromo) {
        storeCheapestCount.set(hero.store, (storeCheapestCount.get(hero.store) ?? 0) + 1)
      }
    }
    if (storeCheapestCount.size === 0) return null
    const sorted = [...storeCheapestCount.entries()].sort((a, b) => b[1] - a[1])
    const [firstStore, firstCount] = sorted[0]!
    const secondEntry = sorted[1]
    const firstMeta = STORE_META[firstStore]
    if (secondEntry && secondEntry[1] > 0) {
      const secondMeta = STORE_META[secondEntry[0]]
      return `Buy ${firstCount} item${firstCount !== 1 ? 's' : ''} at ${firstMeta.label}, ${secondEntry[1]} at ${secondMeta.label} — see this week's best prices below.`
    }
    return `Buy ${firstCount} item${firstCount !== 1 ? 's' : ''} at ${firstMeta.label} — see this week's best prices below.`
  })()

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your deals this week</h1>
          <p className="mt-1 text-sm text-muted">
            {itemCount} item{itemCount !== 1 ? 's' : ''} tracked
            {categoryCount > 0 && ` across ${categoryCount} categor${categoryCount !== 1 ? 'ies' : 'y'}`}
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

      {/* Verdict sentence */}
      {verdictSentence && (
        <div className="mb-3 rounded-md border border-[#bfe3cb] bg-[#e6f4ec] px-3 py-2">
          <p className="text-[13px] font-semibold text-[#147a2d]">🏆 {verdictSentence}</p>
        </div>
      )}

      {/* View toggle — per-item (price ladder) vs per-store (shopping route) */}
      {categoryCount > 0 && (
        <div
          className="mb-4 flex rounded-full border border-border bg-surface p-0.5"
          role="group"
          aria-label="Compare view"
        >
          <button
            type="button"
            aria-pressed={compareView === 'per-item'}
            onClick={() => setCompareView('per-item')}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
              compareView === 'per-item' ? 'bg-accent text-white' : 'text-muted hover:text-current'
            }`}
          >
            Per item · all 7 stores
          </button>
          <button
            type="button"
            aria-pressed={compareView === 'per-store'}
            onClick={() => setCompareView('per-store')}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
              compareView === 'per-store' ? 'bg-accent text-white' : 'text-muted hover:text-current'
            }`}
          >
            Per store · shopping route
          </button>
        </div>
      )}

      {/* Category sections */}
      {result && result.categories.length > 0 ? (
        compareView === 'per-item' ? (
          /* Per-item view — price ladder per category, all 7 stores */
          bandsByMatch.map(({ match, bands }) => (
            <SubCategoryBand
              key={match.browseCategory}
              subCategory={match.browseCategoryLabel}
              emoji={match.browseCategoryEmoji}
              deals={bands}
              onAdd={() => {/* read-only on compare page */}}
              addedIds={new Set()}
              heroBadgeLabel="★ BUY HERE"
            />
          ))
        ) : (
          /* Per-store view — shopping route grouped by store */
          result.categories.map((match) => (
            <CategoryDealsSection
              key={match.browseCategory}
              match={match}
              basketItems={basketItems}
              onItemAdded={refetch}
              onItemRemoved={refetch}
            />
          ))
        )
      ) : (
        <div className="rounded-md border border-border bg-surface p-6 text-center text-sm text-muted">
          No category deals found. Add more items to your list or check back Thursday when new deals are published.
        </div>
      )}

      {/* Unmapped items notice */}
      {unmappedCount > 0 && (
        <div className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
          {unmappedCount} item{unmappedCount !== 1 ? 's' : ''} couldn't be matched to a category ({result?.unmappedItems.map((i) => i.label).join(', ')}) —{' '}
          <Link to={`/onboarding?edit=${favoriteId}`} className="text-accent hover:underline">
            edit list
          </Link>
          {' '}to update {unmappedCount !== 1 ? 'them' : 'it'}.
        </div>
      )}

      {/* Edit button */}
      <div className="mt-2 mb-20 text-center">
        <Link
          to={`/onboarding?edit=${favoriteId}`}
          className={buttonVariants({ variant: 'outline', fullWidth: true })}
        >
          Edit list
        </Link>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white px-4 py-3 shadow-md">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleCopyLink} type="button" className="flex-1">
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
          <ShareButton
            title="My grocery deals — basketch"
            text="Check out my split shopping list for Swiss grocery stores"
          >
            Share list
          </ShareButton>
        </div>
      </div>
    </div>
  )
}
