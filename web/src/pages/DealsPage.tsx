import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { BrowseCategory, Category, DealRow } from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'

const TOP_LEVEL_CATEGORIES: Category[] = ['fresh', 'long-life', 'non-food']

const TOP_LEVEL_LABELS: Record<Category, string> = {
  'fresh': 'Fresh',
  'long-life': 'Long-life',
  'non-food': 'Non-food / Household',
}
import { useActiveDeals, usePageTitle } from '../lib/hooks'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'
import { DataFreshness } from '../components/DataFreshness'
import { DealCard } from '../components/DealCard'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { StaleBanner } from '../components/StaleBanner'

const INITIAL_SHOW = 50

function matchDealToSubCategories(deal: DealRow, subCategories: string[]): boolean {
  if (deal.sub_category && subCategories.includes(deal.sub_category)) return true
  return false
}

function dealMatchesBrowseCategory(deal: DealRow, categoryId: BrowseCategory | Category): boolean {
  if (categoryId === 'all') return true
  // Support top-level categories (fresh, long-life, non-food)
  if (TOP_LEVEL_CATEGORIES.includes(categoryId as Category)) {
    return deal.category === categoryId
  }
  const cat = BROWSE_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat) return false
  return matchDealToSubCategories(deal, cat.subCategories)
}

function StoreDealSection(props: {
  store: 'migros' | 'coop'
  categoryLabel: string
  deals: DealRow[]
}) {
  const { store, categoryLabel, deals } = props
  const [showCount, setShowCount] = useState(INITIAL_SHOW)
  const visibleDeals = deals.slice(0, showCount)
  const remaining = deals.length - showCount
  const storeName = store === 'migros' ? 'Migros' : 'Coop'
  const headerColor = store === 'migros' ? 'text-migros-text' : 'text-coop-text'

  return (
    <section
      role="region"
      aria-label={`${storeName} deals`}
    >
      <div className="mb-3">
        <h2 className={`text-base font-bold uppercase tracking-wide ${headerColor}`}>
          {storeName} — {categoryLabel}
        </h2>
        <p className="text-sm text-muted">
          {deals.length} deal{deals.length !== 1 ? 's' : ''}
        </p>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-6 text-center text-sm italic text-muted">
          No {storeName} deals in {categoryLabel.toLowerCase()} this week
        </div>
      ) : (
        <div className="space-y-2">
          {visibleDeals.map((deal) => (
            <DealCard key={deal.id} deal={deal} store={store} />
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShowCount((prev) => prev + INITIAL_SHOW)}
              className="w-full rounded-md border border-border bg-surface py-3 text-center text-sm font-medium text-accent hover:bg-gray-50 min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Show more {storeName} deals ({remaining} left)
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export function DealsPage() {
  usePageTitle('This Week\'s Deals')
  const { data: deals, loading, error, refetch } = useActiveDeals()
  const { data: pipelineRun } = useCachedQuery(
    'pipeline-run:latest',
    fetchLatestPipelineRun,
    60,
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const pillContainerRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(true)

  // Read category from URL or default to 'all'
  const urlCategory = searchParams.get('category') as BrowseCategory | Category | null
  const validCategories: (BrowseCategory | Category)[] = [
    'all',
    ...BROWSE_CATEGORIES.map((c) => c.id),
    ...TOP_LEVEL_CATEGORIES,
  ]
  const activeCategory: BrowseCategory | Category = urlCategory && validCategories.includes(urlCategory)
    ? urlCategory
    : 'all'

  function setActiveCategory(cat: BrowseCategory | Category) {
    if (cat === 'all') {
      setSearchParams({})
    } else {
      setSearchParams({ category: cat })
    }
  }

  // Check scroll fade
  useEffect(() => {
    const container = pillContainerRef.current
    if (!container) return

    function handleScroll() {
      if (!container) return
      const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 2
      setShowFade(!atEnd)
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [deals])

  // Filter deals by active category
  const filteredDeals = useMemo(() => {
    if (!deals) return { migros: [] as DealRow[], coop: [] as DealRow[] }
    const filtered = activeCategory === 'all'
      ? deals
      : deals.filter((d) => dealMatchesBrowseCategory(d, activeCategory))
    return {
      migros: filtered.filter((d) => d.store === 'migros'),
      coop: filtered.filter((d) => d.store === 'coop'),
    }
  }, [deals, activeCategory])

  // Category label for headers
  const activeCategoryLabel = activeCategory === 'all'
    ? 'All Categories'
    : TOP_LEVEL_LABELS[activeCategory as Category]
      ?? BROWSE_CATEGORIES.find((c) => c.id === activeCategory)?.label
      ?? 'All Categories'

  // Check stale data (> 7 days)
  const isStale = pipelineRun
    ? (Date.now() - new Date(pipelineRun.run_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false

  // Category counts for pill badges
  const categoryCounts = useMemo(() => {
    if (!deals) return new Map<BrowseCategory, number>()
    const counts = new Map<BrowseCategory, number>()
    for (const deal of deals) {
      for (const cat of BROWSE_CATEGORIES) {
        if (matchDealToSubCategories(deal, cat.subCategories)) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1)
          break
        }
      }
    }
    return counts
  }, [deals])

  const totalDeals = deals?.length ?? 0
  const hasResults = filteredDeals.migros.length > 0 || filteredDeals.coop.length > 0

  // Roving tabindex keyboard handling
  function handlePillKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const container = pillContainerRef.current
    if (!container) return
    const pills = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const currentIndex = pills.indexOf(e.currentTarget)

    let nextIndex = -1
    if (e.key === 'ArrowRight') {
      nextIndex = currentIndex < pills.length - 1 ? currentIndex + 1 : 0
    } else if (e.key === 'ArrowLeft') {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : pills.length - 1
    }

    if (nextIndex >= 0) {
      e.preventDefault()
      pills[nextIndex]?.focus()
      pills[nextIndex]?.click()
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">This week's deals</h1>
        <LoadingState message="Loading deals..." />
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">This week's deals</h1>

        {/* Category pills — visible but disabled on error per design spec 2.7 */}
        <div className="relative mb-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto py-1" role="tablist" aria-label="Filter by category">
            <button
              className="shrink-0 rounded-full px-4 py-2 text-sm min-h-[44px] border border-border bg-pill-bg text-muted opacity-50 cursor-not-allowed"
              type="button"
              role="tab"
              aria-selected={false}
              tabIndex={-1}
              disabled
            >
              All
            </button>
            {BROWSE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm min-h-[44px] border border-border bg-pill-bg text-muted opacity-50 cursor-not-allowed"
                type="button"
                role="tab"
                aria-selected={false}
                tabIndex={-1}
                disabled
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>

        <ErrorState message="Could not load deals. Please try again later." onRetry={refetch} />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">This week's deals</h1>
      <div className="mb-1">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>

      {isStale && pipelineRun && (
        <div className="mb-3">
          <StaleBanner lastUpdated={pipelineRun.run_at} />
        </div>
      )}

      {/* Category pills — horizontal scroll */}
      <div className="relative mb-4">
        <div
          ref={pillContainerRef}
          className="no-scrollbar flex gap-2 overflow-x-auto py-1"
          role="tablist"
          aria-label="Filter by category"
        >
          <button
            className={`shrink-0 rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              activeCategory === 'all'
                ? 'bg-pill-active-bg text-pill-active-text'
                : 'border border-border bg-pill-bg text-current hover:border-accent'
            }`}
            onClick={() => setActiveCategory('all')}
            onKeyDown={handlePillKeyDown}
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            tabIndex={activeCategory === 'all' ? 0 : -1}
          >
            All ({totalDeals})
          </button>
          {BROWSE_CATEGORIES.map((cat) => {
            const count = categoryCounts.get(cat.id) ?? 0
            return (
              <button
                key={cat.id}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  activeCategory === cat.id
                    ? 'bg-pill-active-bg text-pill-active-text'
                    : 'border border-border bg-pill-bg text-current hover:border-accent'
                }`}
                onClick={() => setActiveCategory(cat.id)}
                onKeyDown={handlePillKeyDown}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.id}
                tabIndex={activeCategory === cat.id ? 0 : -1}
              >
                {cat.emoji} {cat.label}{count > 0 ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
        {showFade && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-bg to-transparent" />
        )}
      </div>

      {/* Content: both stores empty */}
      {!hasResults && (
        <div className="py-12 text-center text-sm text-muted">
          No deals in {activeCategoryLabel.toLowerCase()} this week. Try another category.
        </div>
      )}

      {/* Content: store sections */}
      {hasResults && (
        <div className="space-y-8 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
          <StoreDealSection
            store="migros"
            categoryLabel={activeCategoryLabel}
            deals={filteredDeals.migros}
          />
          <StoreDealSection
            store="coop"
            categoryLabel={activeCategoryLabel}
            deals={filteredDeals.coop}
          />
        </div>
      )}
    </div>
  )
}
