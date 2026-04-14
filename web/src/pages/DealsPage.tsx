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
  return deal.sub_category != null && subCategories.includes(deal.sub_category)
}

function dealMatchesBrowseCategory(deal: DealRow, categoryId: BrowseCategory | Category): boolean {
  if (categoryId === 'all') return true
  if (TOP_LEVEL_CATEGORIES.includes(categoryId as Category)) {
    return deal.category === categoryId
  }
  const cat = BROWSE_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat) return false
  return matchDealToSubCategories(deal, cat.subCategories)
}

/** Determine which browse categories have deals within a top-level category. */
function browseCategoriesForTopLevel(deals: DealRow[], topLevel: Category): BrowseCategory[] {
  const topLevelDeals = deals.filter((d) => d.category === topLevel)
  const matching: BrowseCategory[] = []
  for (const bc of BROWSE_CATEGORIES) {
    if (topLevelDeals.some((d) => matchDealToSubCategories(d, bc.subCategories))) {
      matching.push(bc.id)
    }
  }
  return matching
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

  // Two-tier URL state: ?category=fresh (top-level) and ?browse=fruits-vegetables (sub)
  const urlCategory = searchParams.get('category')
  const urlBrowse = searchParams.get('browse')

  // Derive active top-level category
  const activeTopLevel: Category | 'all' =
    urlCategory && TOP_LEVEL_CATEGORIES.includes(urlCategory as Category)
      ? urlCategory as Category
      : 'all'

  // Derive active browse category (only valid when a top-level is set, or when used standalone)
  const validBrowseIds = BROWSE_CATEGORIES.map((c) => c.id)
  const activeBrowse: BrowseCategory | null =
    urlBrowse && validBrowseIds.includes(urlBrowse as BrowseCategory)
      ? urlBrowse as BrowseCategory
      : null

  function setTopLevel(cat: Category | 'all') {
    if (cat === 'all') {
      setSearchParams({})
    } else {
      setSearchParams({ category: cat })
    }
  }

  function setBrowse(browse: BrowseCategory | null) {
    if (activeTopLevel === 'all') {
      // No top-level selected — browse is standalone
      if (browse) {
        setSearchParams({ browse })
      } else {
        setSearchParams({})
      }
    } else {
      if (browse) {
        setSearchParams({ category: activeTopLevel, browse })
      } else {
        setSearchParams({ category: activeTopLevel })
      }
    }
  }

  // Check scroll fade for browse pills
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
  }, [deals, activeTopLevel])

  // Filter deals by both tiers
  const filteredDeals = useMemo(() => {
    if (!deals) return { migros: [] as DealRow[], coop: [] as DealRow[] }
    let filtered = deals

    // Tier 1: top-level category filter
    if (activeTopLevel !== 'all') {
      filtered = filtered.filter((d) => d.category === activeTopLevel)
    }

    // Tier 2: browse sub-category filter
    if (activeBrowse) {
      filtered = filtered.filter((d) => dealMatchesBrowseCategory(d, activeBrowse))
    }

    return {
      migros: filtered.filter((d) => d.store === 'migros'),
      coop: filtered.filter((d) => d.store === 'coop'),
    }
  }, [deals, activeTopLevel, activeBrowse])

  // Category label for store section headers
  const activeCategoryLabel = activeBrowse
    ? BROWSE_CATEGORIES.find((c) => c.id === activeBrowse)?.label ?? 'All Categories'
    : activeTopLevel !== 'all'
      ? TOP_LEVEL_LABELS[activeTopLevel]
      : 'All Categories'

  // Check stale data (> 7 days)
  const isStale = pipelineRun
    ? (Date.now() - new Date(pipelineRun.run_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false

  // Top-level category deal counts
  const topLevelCounts = useMemo(() => {
    if (!deals) return new Map<Category, number>()
    const counts = new Map<Category, number>()
    for (const deal of deals) {
      counts.set(deal.category, (counts.get(deal.category) ?? 0) + 1)
    }
    return counts
  }, [deals])

  // Browse category counts (scoped to active top-level)
  const categoryCounts = useMemo(() => {
    if (!deals) return new Map<BrowseCategory, number>()
    const source = activeTopLevel !== 'all'
      ? deals.filter((d) => d.category === activeTopLevel)
      : deals
    const counts = new Map<BrowseCategory, number>()
    for (const deal of source) {
      for (const cat of BROWSE_CATEGORIES) {
        if (matchDealToSubCategories(deal, cat.subCategories)) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1)
          break
        }
      }
    }
    return counts
  }, [deals, activeTopLevel])

  // Which browse pills to show (all, or filtered by top-level)
  const visibleBrowseCategories = useMemo(() => {
    if (!deals || activeTopLevel === 'all') return BROWSE_CATEGORIES
    const matchingIds = browseCategoriesForTopLevel(deals, activeTopLevel)
    return BROWSE_CATEGORIES.filter((c) => matchingIds.includes(c.id))
  }, [deals, activeTopLevel])

  const totalDeals = deals?.length ?? 0
  const totalFiltered = filteredDeals.migros.length + filteredDeals.coop.length
  const hasResults = totalFiltered > 0

  // Roving tabindex keyboard handling
  function handlePillKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, containerSelector: string) {
    const container = document.querySelector<HTMLDivElement>(containerSelector)
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

  const isFilterActive = activeTopLevel !== 'all' || activeBrowse !== null

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
      <div className="mb-1">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
      </div>

      {isStale && pipelineRun && (
        <div className="mb-3">
          <StaleBanner lastUpdated={pipelineRun.run_at} />
        </div>
      )}

      {/* Tier 1: Top-level category pills */}
      <div className="mb-2 flex gap-2 py-1" data-tier="top" role="tablist" aria-label="Filter by category group">
        <button
          className={`shrink-0 rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
            activeTopLevel === 'all' && !activeBrowse
              ? 'bg-pill-active-bg text-pill-active-text'
              : 'border border-border bg-pill-bg text-current hover:border-accent'
          }`}
          onClick={() => setTopLevel('all')}
          onKeyDown={(e) => handlePillKeyDown(e, '[data-tier="top"]')}
          type="button"
          role="tab"
          aria-selected={activeTopLevel === 'all'}
          tabIndex={activeTopLevel === 'all' ? 0 : -1}
        >
          All ({totalDeals})
        </button>
        {TOP_LEVEL_CATEGORIES.map((cat) => {
          const count = topLevelCounts.get(cat) ?? 0
          return (
            <button
              key={cat}
              className={`shrink-0 rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                activeTopLevel === cat
                  ? 'bg-pill-active-bg text-pill-active-text'
                  : 'border border-border bg-pill-bg text-current hover:border-accent'
              }`}
              onClick={() => setTopLevel(cat)}
              onKeyDown={(e) => handlePillKeyDown(e, '[data-tier="top"]')}
              type="button"
              role="tab"
              aria-selected={activeTopLevel === cat}
              tabIndex={activeTopLevel === cat ? 0 : -1}
            >
              {TOP_LEVEL_LABELS[cat]}{count > 0 ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>

      {/* Tier 2: Browse sub-category pills — horizontal scroll */}
      {visibleBrowseCategories.length > 0 && (
        <div className="relative mb-3">
          <div
            ref={pillContainerRef}
            className="no-scrollbar flex gap-2 overflow-x-auto py-1 pr-8"
            data-tier="browse"
            role="tablist"
            aria-label="Filter by sub-category"
          >
            {activeTopLevel !== 'all' && (
              <button
                className={`shrink-0 rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  !activeBrowse
                    ? 'bg-pill-active-bg text-pill-active-text'
                    : 'border border-border bg-pill-bg text-current hover:border-accent'
                }`}
                onClick={() => setBrowse(null)}
                onKeyDown={(e) => handlePillKeyDown(e, '[data-tier="browse"]')}
                type="button"
                role="tab"
                aria-selected={!activeBrowse}
                tabIndex={!activeBrowse ? 0 : -1}
              >
                All {TOP_LEVEL_LABELS[activeTopLevel]}
              </button>
            )}
            {visibleBrowseCategories.map((cat) => {
              const count = categoryCounts.get(cat.id) ?? 0
              return (
                <button
                  key={cat.id}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    activeBrowse === cat.id
                      ? 'bg-pill-active-bg text-pill-active-text'
                      : 'border border-border bg-pill-bg text-current hover:border-accent'
                  }`}
                  onClick={() => setBrowse(cat.id)}
                  onKeyDown={(e) => handlePillKeyDown(e, '[data-tier="browse"]')}
                  type="button"
                  role="tab"
                  aria-selected={activeBrowse === cat.id}
                  tabIndex={activeBrowse === cat.id ? 0 : -1}
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
      )}

      {/* Active filter banner */}
      {isFilterActive && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
          <span className="text-sm text-muted">
            Showing {totalFiltered} {activeCategoryLabel} deal{totalFiltered !== 1 ? 's' : ''}{' '}
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
