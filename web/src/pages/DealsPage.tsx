import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { BrowseCategory, BrowseCategoryInfo, Category, DealRow } from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'

const TOP_LEVEL_CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fresh', label: 'Fresh' },
  { id: 'long-life', label: 'Long-life' },
  { id: 'non-food', label: 'Non-food' },
]

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
  return deal.sub_category != null && subCategories.includes(deal.sub_category)
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

  // ── URL state ──
  // ?category=fresh         → top-level tab selected
  // ?category=fresh&sub=meat-fish → top-level + browse sub-filter
  // ?category=fruits-vegetables   → browse category direct link (backward compat)
  // (no params)             → all deals
  const urlCategory = searchParams.get('category')
  const urlSub = searchParams.get('sub')

  const topLevelIds: string[] = ['fresh', 'long-life', 'non-food']
  const browseIds = BROWSE_CATEGORIES.map((c) => c.id)

  // Determine active top-level tab
  const activeTopLevel: Category | 'all' =
    urlCategory && topLevelIds.includes(urlCategory)
      ? urlCategory as Category
      : 'all'

  // Determine active browse sub-filter
  const activeSub: BrowseCategory | null =
    urlSub && browseIds.includes(urlSub as BrowseCategory)
      ? urlSub as BrowseCategory
      // Backward compat: ?category=fruits-vegetables (browse ID without top param)
      : urlCategory && browseIds.includes(urlCategory as BrowseCategory)
        ? urlCategory as BrowseCategory
        : null

  // When activeSub is set via backward compat (no top param), infer the top-level
  const inferredTopLevel: Category | 'all' = useMemo(() => {
    if (activeTopLevel !== 'all') return activeTopLevel
    if (activeSub) {
      const cat = BROWSE_CATEGORIES.find((c) => c.id === activeSub)
      if (cat) return cat.topCategory
    }
    return 'all'
  }, [activeTopLevel, activeSub])

  // Browse categories for the active top-level
  const visibleBrowseCategories: BrowseCategoryInfo[] = useMemo(() => {
    if (inferredTopLevel === 'all') return []
    return BROWSE_CATEGORIES.filter((c) => c.topCategory === inferredTopLevel)
  }, [inferredTopLevel])

  function setTopLevel(top: Category | 'all') {
    if (top === 'all') {
      setSearchParams({})
    } else {
      setSearchParams({ category: top })
    }
  }

  function setSubFilter(sub: BrowseCategory | null) {
    const top = inferredTopLevel === 'all' ? 'fresh' : inferredTopLevel
    if (sub) {
      setSearchParams({ category: top, sub })
    } else {
      setSearchParams({ category: top })
    }
  }

  // Check scroll fade for pill row
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
  }, [deals, inferredTopLevel])

  // ── Deal counts ──
  const topLevelCounts = useMemo(() => {
    if (!deals) return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const deal of deals) {
      counts.set(deal.category, (counts.get(deal.category) ?? 0) + 1)
    }
    return counts
  }, [deals])

  const browseCounts = useMemo(() => {
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

  // ── Filter deals ──
  const filteredDeals = useMemo(() => {
    if (!deals) return { migros: [] as DealRow[], coop: [] as DealRow[] }
    let filtered = deals

    // Apply top-level filter
    if (inferredTopLevel !== 'all') {
      filtered = filtered.filter((d) => d.category === inferredTopLevel)
    }

    // Apply browse sub-filter
    if (activeSub) {
      const cat = BROWSE_CATEGORIES.find((c) => c.id === activeSub)
      if (cat) {
        filtered = filtered.filter((d) => matchDealToSubCategories(d, cat.subCategories))
      }
    }

    return {
      migros: filtered.filter((d) => d.store === 'migros'),
      coop: filtered.filter((d) => d.store === 'coop'),
    }
  }, [deals, inferredTopLevel, activeSub])

  // ── Labels ──
  const topLevelLabel = inferredTopLevel !== 'all'
    ? TOP_LEVEL_CATEGORIES.find((c) => c.id === inferredTopLevel)?.label ?? 'All'
    : 'All Categories'
  const activeLabel = activeSub
    ? BROWSE_CATEGORIES.find((c) => c.id === activeSub)?.label ?? topLevelLabel
    : topLevelLabel

  // Check stale data (> 7 days)
  const isStale = pipelineRun
    ? (Date.now() - new Date(pipelineRun.run_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false

  const totalDeals = deals?.length ?? 0
  const totalFiltered = filteredDeals.migros.length + filteredDeals.coop.length
  const hasResults = totalFiltered > 0
  const isFilterActive = inferredTopLevel !== 'all' || activeSub !== null

  // Roving tabindex keyboard handling for top tabs
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, tabs: string) {
    const container = e.currentTarget.parentElement
    if (!container) return
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(`[data-tab-group="${tabs}"]`))
    const currentIndex = buttons.indexOf(e.currentTarget)

    let nextIndex = -1
    if (e.key === 'ArrowRight') {
      nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0
    } else if (e.key === 'ArrowLeft') {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1
    }

    if (nextIndex >= 0) {
      e.preventDefault()
      buttons[nextIndex]?.focus()
      buttons[nextIndex]?.click()
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
        <ErrorState message="Could not load deals. Please try again later." onRetry={refetch} />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">This week's deals</h1>
      <div className="mb-3">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>

      {isStale && pipelineRun && (
        <div className="mb-3">
          <StaleBanner lastUpdated={pipelineRun.run_at} />
        </div>
      )}

      {/* ── Tier 1: Top-level tabs (Google Flights style) ── */}
      <div
        className="mb-2 flex border-b border-border"
        role="tablist"
        aria-label="Filter by department"
      >
        {TOP_LEVEL_CATEGORIES.map((tab) => {
          const isActive = inferredTopLevel === tab.id
          const count = tab.id === 'all'
            ? totalDeals
            : topLevelCounts.get(tab.id) ?? 0
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              data-tab-group="top"
              onClick={() => setTopLevel(tab.id as Category | 'all')}
              onKeyDown={(e) => handleTabKeyDown(e, 'top')}
              className={`min-h-[44px] flex-1 px-2 py-3 text-center text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                isActive
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-muted hover:text-current'
              }`}
            >
              {tab.label} ({count})
            </button>
          )
        })}
      </div>

      {/* ── Tier 2: Browse category pills (Airbnb refinement style) ── */}
      {inferredTopLevel !== 'all' && visibleBrowseCategories.length > 0 && (
        <div className="relative mb-3">
          <div
            ref={pillContainerRef}
            className="no-scrollbar flex gap-2 overflow-x-auto py-1"
            role="tablist"
            aria-label="Filter by category"
          >
            {/* "All [TopLevel]" pill */}
            <button
              type="button"
              role="tab"
              aria-selected={activeSub === null}
              tabIndex={activeSub === null ? 0 : -1}
              data-tab-group="browse"
              onClick={() => setSubFilter(null)}
              onKeyDown={(e) => handleTabKeyDown(e, 'browse')}
              className={`shrink-0 rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                activeSub === null
                  ? 'bg-pill-active-bg text-pill-active-text'
                  : 'border border-border bg-pill-bg text-current hover:border-accent'
              }`}
            >
              All {topLevelLabel} ({topLevelCounts.get(inferredTopLevel) ?? 0})
            </button>
            {visibleBrowseCategories.map((cat) => {
              const count = browseCounts.get(cat.id) ?? 0
              if (count === 0) return null
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSub === cat.id}
                  tabIndex={activeSub === cat.id ? 0 : -1}
                  data-tab-group="browse"
                  onClick={() => setSubFilter(cat.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, 'browse')}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    activeSub === cat.id
                      ? 'bg-pill-active-bg text-pill-active-text'
                      : 'border border-border bg-pill-bg text-current hover:border-accent'
                  }`}
                >
                  {cat.emoji} {cat.label} ({count})
                </button>
              )
            })}
          </div>
          {showFade && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-bg to-transparent" />
          )}
        </div>
      )}

      {/* Active filter banner */}
      {isFilterActive && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
          <span className="text-sm text-muted">
            Showing {totalFiltered} {activeLabel} deal{totalFiltered !== 1 ? 's' : ''}{' '}
            ({filteredDeals.migros.length} Migros, {filteredDeals.coop.length} Coop)
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="min-h-[44px] px-2 text-sm font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Content: both stores empty */}
      {!hasResults && (
        <div className="py-12 text-center text-sm text-muted">
          No deals in {activeLabel.toLowerCase()} this week. Try another category.
        </div>
      )}

      {/* Content: store sections */}
      {hasResults && (
        <div className="space-y-8 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
          <StoreDealSection
            store="migros"
            categoryLabel={activeLabel}
            deals={filteredDeals.migros}
          />
          <StoreDealSection
            store="coop"
            categoryLabel={activeLabel}
            deals={filteredDeals.coop}
          />
        </div>
      )}
    </div>
  )
}
