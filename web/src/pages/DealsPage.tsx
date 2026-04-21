import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { BrowseCategory, BrowseCategoryInfo, Category, DealRow, Store } from '@shared/types'
import { ALL_STORES, BROWSE_CATEGORIES, DEFAULT_STORES, STORE_META } from '@shared/types'

const TOP_LEVEL_CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fresh', label: 'Fresh' },
  { id: 'long-life', label: 'Long-life' },
  { id: 'non-food', label: 'Household' },
]

import { Link } from 'react-router-dom'

import { useActiveDeals, useBasketItems, useDealComparisons, usePageTitle } from '../lib/hooks'
import { useBasketContext } from '../lib/basket-context'
import { fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'
import { DataFreshness } from '../components/DataFreshness'
import { DealCard } from '../components/DealCard'
import { DealCompareRow } from '../components/DealCompareRow'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { StaleBanner } from '../components/StaleBanner'
import { ShareButton } from '../components/ShareButton'

const INITIAL_SHOW = 50

function matchDealToSubCategories(deal: DealRow, subCategories: string[]): boolean {
  return deal.sub_category != null && subCategories.includes(deal.sub_category)
}

export function DealsPage() {
  usePageTitle('This Week\'s Deals')
  const { data: deals, loading, error, refetch } = useActiveDeals()
  const { data: comparisons, products: compProducts } = useDealComparisons()

  // Build product lookup by ID for compare view display names
  const productMap = useMemo(() => {
    if (!compProducts) return null
    const map = new Map<string, typeof compProducts[number]>()
    for (const p of compProducts) {
      map.set(p.id, p)
    }
    return map
  }, [compProducts])
  const { data: pipelineRun } = useCachedQuery(
    'pipeline-run:latest',
    fetchLatestPipelineRun,
    60,
  )
  const [searchParams, setSearchParams] = useSearchParams()

  // View mode: 'list' (flat deals) or 'compare' (side-by-side)
  const [viewMode, setViewMode] = useState<'list' | 'compare'>('list')

  const [searchQuery, setSearchQuery] = useState('')

  // Basket for "add to list" buttons
  const { basketId } = useBasketContext()
  const { data: basketItems, refetch: refetchBasket } = useBasketItems(basketId ?? undefined)

  // Show count for infinite scroll
  const [showCount, setShowCount] = useState(INITIAL_SHOW)

  // ── URL state ──
  // ?category=fresh         → top-level tab selected
  // ?category=fresh&sub=meat-fish → top-level + browse sub-filter
  // ?category=fruits-vegetables   → browse category direct link (backward compat)
  // ?stores=migros,coop     → store filter pills
  // (no params)             → all deals
  const urlCategory = searchParams.get('category')
  const urlSub = searchParams.get('sub')
  const urlStores = searchParams.get('stores')

  const topLevelIds: string[] = ['fresh', 'long-life', 'non-food']
  const browseIds = BROWSE_CATEGORIES.map((c) => c.id)

  // Normalise URL alias: ?category=household → non-food
  const normalisedCategory = urlCategory === 'household' ? 'non-food' : urlCategory

  // Determine active top-level tab
  const activeTopLevel: Category | 'all' =
    normalisedCategory && topLevelIds.includes(normalisedCategory)
      ? normalisedCategory as Category
      : 'all'

  // Determine active browse sub-filter (also accept 'other-*' synthetic keys)
  const isValidSub = (s: string) => browseIds.includes(s as BrowseCategory) || s.startsWith('other-')
  const activeSub: BrowseCategory | null =
    urlSub && isValidSub(urlSub)
      ? urlSub as BrowseCategory
      // Backward compat: ?category=fruits-vegetables (browse ID without top param)
      : normalisedCategory && browseIds.includes(normalisedCategory as BrowseCategory)
        ? normalisedCategory as BrowseCategory
        : null

  // Active store filters — parse from URL or default to Migros + Coop
  const activeStores: Set<Store> = useMemo(() => {
    if (!urlStores) return new Set(DEFAULT_STORES)
    const parsed = urlStores.split(',').filter((s): s is Store => ALL_STORES.includes(s as Store))
    return parsed.length > 0 ? new Set(parsed) : new Set(DEFAULT_STORES)
  }, [urlStores])

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
    setShowCount(INITIAL_SHOW)
    if (top === 'all') {
      setSearchParams(urlStores ? { stores: urlStores } : {})
    } else {
      const params: Record<string, string> = { category: top }
      if (urlStores) params['stores'] = urlStores
      setSearchParams(params)
    }
  }

  function setSubFilter(sub: BrowseCategory | null) {
    setShowCount(INITIAL_SHOW)
    const top = inferredTopLevel === 'all' ? 'fresh' : inferredTopLevel
    if (sub) {
      const params: Record<string, string> = { category: top, sub }
      if (urlStores) params['stores'] = urlStores
      setSearchParams(params)
    } else {
      const params: Record<string, string> = { category: top }
      if (urlStores) params['stores'] = urlStores
      setSearchParams(params)
    }
  }

  function toggleStore(store: Store) {
    setShowCount(INITIAL_SHOW)
    const next = new Set(activeStores)
    if (next.has(store)) {
      if (next.size === 1) return
      next.delete(store)
    } else {
      next.add(store)
    }
    const categoryParams: Record<string, string> = {}
    if (urlCategory) categoryParams['category'] = urlCategory
    if (urlSub) categoryParams['sub'] = urlSub

    // If all stores selected, remove the param (cleaner URL)
    if (next.size === ALL_STORES.length) {
      setSearchParams(categoryParams)
    } else {
      setSearchParams({ ...categoryParams, stores: [...next].join(',') })
    }
  }

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
      let matched = false
      for (const cat of BROWSE_CATEGORIES) {
        if (matchDealToSubCategories(deal, cat.subCategories)) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1)
          matched = true
          break
        }
      }
      // Count uncategorised deals per top-level category using a synthetic key
      if (!matched && deal.category) {
        const otherKey = `other-${deal.category}` as BrowseCategory
        counts.set(otherKey, (counts.get(otherKey) ?? 0) + 1)
      }
    }
    return counts
  }, [deals])

  // Store deal counts (for pills) — filtered by active category/subcategory
  const storeCounts = useMemo(() => {
    if (!deals) return new Map<Store, number>()
    let subset = deals

    // Filter by top-level category
    if (inferredTopLevel !== 'all') {
      subset = subset.filter((d) => d.category === inferredTopLevel)
    }

    // Filter by browse sub-category
    if (activeSub) {
      const cat = BROWSE_CATEGORIES.find((c) => c.id === activeSub)
      if (cat) {
        subset = subset.filter((d) => matchDealToSubCategories(d, cat.subCategories))
      }
    }

    const counts = new Map<Store, number>()
    for (const deal of subset) {
      counts.set(deal.store, (counts.get(deal.store) ?? 0) + 1)
    }
    return counts
  }, [deals, inferredTopLevel, activeSub])

  // ── Filter and sort deals ──
  const filteredDeals = useMemo(() => {
    if (!deals) return [] as DealRow[]
    let filtered = deals

    // Apply top-level filter
    if (inferredTopLevel !== 'all') {
      filtered = filtered.filter((d) => d.category === inferredTopLevel)
    }

    // Apply browse sub-filter
    if (activeSub) {
      if (activeSub.startsWith('other-')) {
        // "Other" pill: deals that don't match any defined subcategory for this top-level
        const allSubCats = BROWSE_CATEGORIES
          .filter((c) => c.topCategory === inferredTopLevel)
          .flatMap((c) => c.subCategories)
        filtered = filtered.filter((d) => !matchDealToSubCategories(d, allSubCats))
      } else {
        const cat = BROWSE_CATEGORIES.find((c) => c.id === activeSub)
        if (cat) {
          filtered = filtered.filter((d) => matchDealToSubCategories(d, cat.subCategories))
        }
      }
    }

    // Apply store filter
    filtered = filtered.filter((d) => activeStores.has(d.store))

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter((d) => d.product_name.toLowerCase().includes(q))
    }

    // Sort by discount % descending
    return [...filtered].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))
  }, [deals, inferredTopLevel, activeSub, activeStores, searchQuery])

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
  const totalFiltered = filteredDeals.length
  const hasResults = totalFiltered > 0
  const allStoresSelected = activeStores.size === ALL_STORES.length
  const isCategoryFilterActive = inferredTopLevel !== 'all' || activeSub !== null
  const isStoreFilterActive = !allStoresSelected
  const isFilterActive = isCategoryFilterActive || isStoreFilterActive

  // Filtered comparisons for side-by-side view
  const filteredComparisons = useMemo(() => {
    if (!comparisons) return []
    return comparisons.matched.filter((c) => {
      // Must have deals in at least 2 selected stores
      const matchedStores = (Object.keys(c.storeDeals) as Store[]).filter((s) => activeStores.has(s))
      if (matchedStores.length < 2) return false
      // Category filter
      if (inferredTopLevel !== 'all' && c.category !== inferredTopLevel) return false
      return true
    })
  }, [comparisons, activeStores, inferredTopLevel])

  const visibleDeals = filteredDeals.slice(0, showCount)
  const remaining = filteredDeals.length - showCount

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
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">This week's deals</h1>
        <div className="flex rounded-full border border-border bg-surface p-0.5">
          <button
            type="button"
            aria-pressed={viewMode === 'compare'}
            onClick={() => setViewMode('compare')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'compare' ? 'bg-accent text-white' : 'text-muted hover:text-current'
            }`}
          >
            Compare
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-current'
            }`}
          >
            All deals
          </button>
        </div>
      </div>
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
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="deals-tabpanel"
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

      {/* ── Tier 2: Browse category pills ── */}
      {visibleBrowseCategories.length > 0 && (
        <div className="mb-3">
          <div
            className="flex flex-wrap gap-2 py-1"
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
              className={`rounded-full px-3 py-1.5 text-xs min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                activeSub === null
                  ? 'bg-pill-active-bg text-pill-active-text'
                  : 'border border-border bg-pill-bg text-current hover:border-accent'
              }`}
            >
              {inferredTopLevel === 'all' ? `All (${totalDeals})` : `All ${topLevelLabel} (${topLevelCounts.get(inferredTopLevel) ?? 0})`}
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
                  className={`rounded-full px-3 py-1.5 text-xs min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    activeSub === cat.id
                      ? 'bg-pill-active-bg text-pill-active-text'
                      : 'border border-border bg-pill-bg text-current hover:border-accent'
                  }`}
                >
                  {cat.emoji} {cat.label} ({count})
                </button>
              )
            })}
            {/* "Other" pill for uncategorised deals within this top-level */}
            {inferredTopLevel !== 'all' && (() => {
              const otherKey = `other-${inferredTopLevel}` as BrowseCategory
              const otherCount = browseCounts.get(otherKey) ?? 0
              if (otherCount === 0) return null
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSub === otherKey}
                  tabIndex={activeSub === otherKey ? 0 : -1}
                  data-tab-group="browse"
                  onClick={() => setSubFilter(otherKey)}
                  onKeyDown={(e) => handleTabKeyDown(e, 'browse')}
                  className={`rounded-full px-3 py-1.5 text-xs min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    activeSub === otherKey
                      ? 'bg-pill-active-bg text-pill-active-text'
                      : 'border border-border bg-pill-bg text-current hover:border-accent'
                  }`}
                >
                  📦 Other ({otherCount})
                </button>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Store filter pills (horizontal scroll) ── */}
      <div className="mb-3">
        <div
          className="flex gap-2 overflow-x-auto py-1 pb-1 scrollbar-none"
          role="group"
          aria-label="Filter by store"
        >
          {ALL_STORES.map((store) => {
            const meta = STORE_META[store]
            const count = storeCounts.get(store) ?? 0
            const isActive = activeStores.has(store)
            const isEmpty = count === 0
              return (
                <button
                  key={store}
                  type="button"
                  aria-pressed={isActive}
                  disabled={isEmpty && !isActive}
                  onClick={() => toggleStore(store)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 border bg-white${isEmpty && !isActive ? ' opacity-40 cursor-not-allowed' : ''}`}
                  style={isActive
                    ? { backgroundColor: meta.hex, color: 'white', borderColor: meta.hex }
                    : { color: meta.hexText, borderColor: meta.hexText }}
                >
                  {meta.label} ({count})
                </button>
              )
            })}
          </div>
        </div>

      {/* Search bar */}
      <div className="mb-3 relative">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setShowCount(INITIAL_SHOW) }}
          placeholder="Search deals…"
          aria-label="Search deals"
          className="w-full rounded-md border border-border bg-surface py-2 pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-current"
          >
            ✕
          </button>
        )}
      </div>

      {/* Active filter banner */}
      {isFilterActive && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
          <span className="text-sm text-muted">
            {viewMode === 'compare'
              ? filteredComparisons.length > 0
                ? `${filteredComparisons.length} ${activeLabel} product${filteredComparisons.length !== 1 ? 's' : ''} available for comparison`
                : `No ${activeLabel} deals available for comparison across ${[...activeStores].map((s) => STORE_META[s].label).join(', ')}`
              : <>Showing {totalFiltered} {activeLabel} deal{totalFiltered !== 1 ? 's' : ''}
                {isStoreFilterActive && ` from ${[...activeStores].map((s) => STORE_META[s].label).join(', ')}`}</>
            }
          </span>
          <button
            type="button"
            onClick={() => {
              setShowCount(INITIAL_SHOW)
              setSearchParams({})
            }}
            className="min-h-[44px] px-2 text-sm font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Content */}
      <div id="deals-tabpanel" role="tabpanel" aria-labelledby={`tab-${inferredTopLevel}`}>
      {viewMode === 'compare' ? (
        /* ── Compare view: side-by-side matched deals ── */
        filteredComparisons.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">{filteredComparisons.length} products found at multiple stores</p>
            {filteredComparisons.slice(0, showCount).map((comp) => (
              <DealCompareRow key={comp.id} comparison={comp} selectedStores={activeStores} productMap={productMap} />
            ))}
            {filteredComparisons.length > showCount && (
              <button
                type="button"
                onClick={() => setShowCount((prev) => prev + INITIAL_SHOW)}
                className="w-full rounded-md border border-border bg-surface py-3 text-center text-sm font-medium text-accent hover:bg-gray-50 min-h-[44px]"
              >
                Show more ({filteredComparisons.length - showCount} left)
              </button>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted">
            No matching products found across selected stores. Try selecting more stores above.
          </div>
        )
      ) : (
        /* ── List view: flat deal grid ── */
        <>
          {!hasResults && (
            <div className="py-12 text-center text-sm text-muted">
              No deals from {isStoreFilterActive
                ? [...activeStores].map((s) => STORE_META[s].label).join(', ')
                : 'selected stores'} in {activeLabel.toLowerCase()} this week. Try another category or store.
            </div>
          )}
          {hasResults && (
            <div className="space-y-2 pb-20">
              {visibleDeals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  store={deal.store}
                  basketItems={basketItems ?? undefined}
                  onItemAdded={refetchBasket}
                  onItemRemoved={refetchBasket}
                />
              ))}
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCount((prev) => prev + INITIAL_SHOW)}
                  className="w-full rounded-md border border-border bg-surface py-3 text-center text-sm font-medium text-accent hover:bg-gray-50 min-h-[44px]"
                >
                  Show more deals ({remaining} left)
                </button>
              )}
            </div>
          )}
        </>
      )}
      </div>

      {/* Sticky bottom bar — my list */}
      {(basketItems?.length ?? 0) > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white px-4 py-3 shadow-md">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <Link
              to={`/compare/${basketId}`}
              className="flex-1 text-sm font-medium text-accent hover:underline"
            >
              {basketItems?.length} item{basketItems?.length !== 1 ? 's' : ''} in your list →
            </Link>
            <ShareButton
              title="My grocery deals — basketch"
              text="Check out my split shopping list for Swiss grocery stores"
            >
              Share list
            </ShareButton>
          </div>
        </div>
      )}
    </div>
  )
}
