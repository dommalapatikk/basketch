import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { BrowseCategory, BrowseCategoryInfo, Category, DealRow, Store } from '@shared/types'
import { ALL_STORES, BROWSE_CATEGORIES, DEFAULT_STORES, STORE_META } from '@shared/types'

import { useActiveDeals, useBasketItems, usePageTitle } from '../lib/hooks'
import { useBasketContext } from '../lib/basket-context'
import { addBasketItem, fetchLatestPipelineRun } from '../lib/queries'
import { useCachedQuery } from '../lib/use-cached-query'
import { calculateVerdict } from '../lib/verdict'
import { DataFreshness } from '../components/DataFreshness'
import { DealCard, findKeywordForDeal } from '../components/DealCard'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { StaleBanner } from '../components/StaleBanner'
import { MyListPanel } from '../components/MyListPanel'
import type { BandDeal } from '../components/SubCategoryBand'
import { SubCategoryBand } from '../components/SubCategoryBand'

const TOP_LEVEL_CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fresh', label: 'Fresh' },
  { id: 'long-life', label: 'Long-life' },
  { id: 'non-food', label: 'Household' },
]

// Sub-category display metadata — emoji per DB sub_category value
const SUB_CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  fruit: { label: 'Fruit', emoji: '🍎' },
  vegetables: { label: 'Vegetables', emoji: '🥦' },
  meat: { label: 'Meat', emoji: '🥩' },
  poultry: { label: 'Poultry', emoji: '🍗' },
  fish: { label: 'Fish', emoji: '🐟' },
  deli: { label: 'Deli', emoji: '🧆' },
  dairy: { label: 'Dairy', emoji: '🥛' },
  eggs: { label: 'Eggs', emoji: '🥚' },
  bread: { label: 'Bakery', emoji: '🍞' },
  snacks: { label: 'Snacks', emoji: '🍿' },
  chocolate: { label: 'Chocolate', emoji: '🍫' },
  'pasta-rice': { label: 'Pasta & Rice', emoji: '🍝' },
  water: { label: 'Water', emoji: '💧' },
  juice: { label: 'Juice', emoji: '🧃' },
  beer: { label: 'Beer', emoji: '🍺' },
  wine: { label: 'Wine', emoji: '🍷' },
  'soft-drinks': { label: 'Soft Drinks', emoji: '🥤' },
  coffee: { label: 'Coffee', emoji: '☕' },
  tea: { label: 'Tea', emoji: '🍵' },
  drinks: { label: 'Drinks', emoji: '🧃' },
  'coffee-tea': { label: 'Coffee & Tea', emoji: '☕' },
  'ready-meals': { label: 'Ready Meals', emoji: '🍕' },
  frozen: { label: 'Frozen', emoji: '🧊' },
  canned: { label: 'Canned Goods', emoji: '🥫' },
  condiments: { label: 'Condiments', emoji: '🧂' },
  cleaning: { label: 'Cleaning', emoji: '🧹' },
  laundry: { label: 'Laundry', emoji: '🧺' },
  'paper-goods': { label: 'Paper Goods', emoji: '🧻' },
  household: { label: 'Household', emoji: '🏠' },
  'personal-care': { label: 'Personal Care', emoji: '🧴' },
}

/**
 * Group DealRows by sub_category and map them to BandDeal[].
 * Returns an array of band data sorted by deal count (most deals first).
 */
function groupDealsBySubCategory(deals: DealRow[]): Array<{
  subCategory: string
  label: string
  emoji: string
  bandDeals: BandDeal[]
}> {
  const grouped = new Map<string, DealRow[]>()

  for (const deal of deals) {
    const key = deal.sub_category ?? '_uncategorised'
    const existing = grouped.get(key) ?? []
    existing.push(deal)
    grouped.set(key, existing)
  }

  const bands: Array<{ subCategory: string; label: string; emoji: string; bandDeals: BandDeal[] }> = []

  for (const [key, groupDeals] of grouped) {
    const meta = SUB_CATEGORY_META[key]
    const label = meta?.label ?? key.replace(/-/g, ' ')
    const emoji = meta?.emoji ?? '📦'

    // Per-store best deal: cheapest promo deal per store, then cheapest regular per store
    const storePromoMap = new Map<Store, DealRow>()
    const storeRegularMap = new Map<Store, DealRow>()

    for (const deal of groupDeals) {
      const hasPromo = deal.discount_percent > 0
      if (hasPromo) {
        const existing = storePromoMap.get(deal.store)
        if (!existing || deal.sale_price < existing.sale_price) {
          storePromoMap.set(deal.store, deal)
        }
      } else {
        const existing = storeRegularMap.get(deal.store)
        if (!existing || deal.sale_price < existing.sale_price) {
          storeRegularMap.set(deal.store, deal)
        }
      }
    }

    const bandDeals: BandDeal[] = []

    // Add promo deals sorted cheapest first
    const promoDeals = [...storePromoMap.values()].sort((a, b) => a.sale_price - b.sale_price)
    for (const deal of promoDeals) {
      bandDeals.push({
        id: deal.id,
        store: deal.store,
        productName: deal.product_name,
        salePrice: deal.sale_price,
        regularPrice: deal.original_price,
        discountPercent: deal.discount_percent,
        hasPromo: true,
      })
    }

    // Add regular-price deals (stores with item but no current promo)
    // Only include stores not already in promo list
    const regularDeals = [...storeRegularMap.values()]
      .filter((d) => !storePromoMap.has(d.store))
      .sort((a, b) => a.sale_price - b.sale_price)
    for (const deal of regularDeals) {
      bandDeals.push({
        id: deal.id,
        store: deal.store,
        productName: deal.product_name,
        salePrice: deal.sale_price,
        regularPrice: deal.original_price,
        discountPercent: deal.discount_percent,
        hasPromo: false,
      })
    }

    if (bandDeals.length > 0) {
      bands.push({ subCategory: key, label, emoji, bandDeals })
    }
  }

  // Sort bands: most promo deals first
  return bands.sort((a, b) => {
    const aPromos = a.bandDeals.filter((d) => d.hasPromo).length
    const bPromos = b.bandDeals.filter((d) => d.hasPromo).length
    return bPromos - aPromos
  })
}

const INITIAL_SHOW = 50

function matchDealToSubCategories(deal: DealRow, subCategories: string[]): boolean {
  return deal.sub_category != null && subCategories.includes(deal.sub_category)
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

  const [searchQuery, setSearchQuery] = useState('')

  // Panel state
  const [listPanelOpen, setListPanelOpen] = useState(false)

  // Basket for "add to list" buttons
  const { basketId, getOrCreate } = useBasketContext()
  const { data: basketItems, refetch: refetchBasket } = useBasketItems(basketId ?? undefined)

  // Show count for infinite scroll
  const [showCount, setShowCount] = useState(INITIAL_SHOW)

  // Starter pack banner dismissal
  const [starterBannerDismissed, setStarterBannerDismissed] = useState(() => {
    try { return localStorage.getItem('basketch_starterBannerDismissed') === '1' } catch { return false }
  })

  function dismissStarterBanner() {
    try { localStorage.setItem('basketch_starterBannerDismissed', '1') } catch { /* ignore */ }
    setStarterBannerDismissed(true)
  }

  // ── URL state ──
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

  // Determine active browse sub-filter
  const isValidSub = (s: string) => browseIds.includes(s as BrowseCategory) || s.startsWith('other-')
  const activeSub: BrowseCategory | null =
    urlSub && isValidSub(urlSub)
      ? urlSub as BrowseCategory
      : normalisedCategory && browseIds.includes(normalisedCategory as BrowseCategory)
        ? normalisedCategory as BrowseCategory
        : null

  // Active store filters — parse from URL or default to all stores
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

    if (inferredTopLevel !== 'all') {
      subset = subset.filter((d) => d.category === inferredTopLevel)
    }

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

    if (inferredTopLevel !== 'all') {
      filtered = filtered.filter((d) => d.category === inferredTopLevel)
    }

    if (activeSub) {
      if (activeSub.startsWith('other-')) {
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

    filtered = filtered.filter((d) => activeStores.has(d.store))

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter((d) => d.product_name.toLowerCase().includes(q))
    }

    return [...filtered].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))
  }, [deals, inferredTopLevel, activeSub, activeStores, searchQuery])

  // ── L3 sub-sub filter (Level 3 sub-category) ──
  // Shown when a Level 2 browse category (activeSub) is selected.
  // Derived from distinct deal.sub_category values in filteredDeals.
  const [activeSubSub, setActiveSubSub] = useState<string | null>(null)

  const distinctSubCategories = useMemo(() => {
    if (!activeSub) return []
    const seen = new Set<string>()
    for (const deal of filteredDeals) {
      if (deal.sub_category) seen.add(deal.sub_category)
    }
    return [...seen]
  }, [filteredDeals, activeSub])

  // When the L2 filter changes, reset L3 filter
  useEffect(() => { setActiveSubSub(null) }, [activeSub])

  // Apply L3 filter on top of filteredDeals
  const l3FilteredDeals = useMemo(() => {
    if (!activeSubSub) return filteredDeals
    return filteredDeals.filter((d) => d.sub_category === activeSubSub)
  }, [filteredDeals, activeSubSub])

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
  const totalFiltered = l3FilteredDeals.length
  const hasResults = totalFiltered > 0
  const allStoresSelected = activeStores.size === ALL_STORES.length
  const isCategoryFilterActive = inferredTopLevel !== 'all' || activeSub !== null
  const isStoreFilterActive = !allStoresSelected
  const isFilterActive = isCategoryFilterActive || isStoreFilterActive

  const visibleDeals = l3FilteredDeals.slice(0, showCount)

  // Map from deal ID → full DealRow for basket add lookups
  const dealRowById = useMemo(() => {
    const map = new Map<string, DealRow>()
    for (const deal of (deals ?? [])) {
      map.set(deal.id, deal)
    }
    return map
  }, [deals])

  // Set of deal IDs already added (optimistic UI for SubCategoryBand add buttons)
  const [localAddedIds, setLocalAddedIds] = useState<Set<string>>(new Set())

  async function handleBandAdd(bandDeal: BandDeal) {
    const fullDeal = dealRowById.get(bandDeal.id)
    if (!fullDeal) return
    try {
      const bid = await getOrCreate()
      const meta = findKeywordForDeal(fullDeal)
      await addBasketItem(bid, {
        keyword: meta.keyword,
        label: meta.label,
        category: fullDeal.category as Category,
        excludeTerms: meta.excludeTerms,
        preferTerms: meta.preferTerms,
      })
      setLocalAddedIds((prev) => new Set(prev).add(bandDeal.id))
      refetchBasket()
    } catch {
      // silent
    }
  }

  // Sub-category bands for the band list view (from L3-filtered deals)
  const subCategoryBands = useMemo(() => groupDealsBySubCategory(l3FilteredDeals), [l3FilteredDeals])

  // ── Verdict strip ──
  const verdictText = useMemo(() => {
    if (!deals || deals.length === 0) return null
    const verdict = calculateVerdict(deals)
    const parts: string[] = []
    for (const cat of verdict.categories) {
      if (cat.winner !== 'tie') {
        const store = cat.winner
        const meta = STORE_META[store]
        const catLabel = cat.category === 'fresh' ? 'Fresh'
          : cat.category === 'long-life' ? 'Long-life'
          : 'Household'
        parts.push(`${meta.label} (${catLabel})`)
      }
    }
    if (parts.length === 0) return null
    return `🏆 This week: ${parts.join(' · ')}`
  }, [deals])

  // ── Basket store breakdown for sticky bar ──
  const basketStoreBreakdown = useMemo(() => {
    if (!basketItems || basketItems.length === 0) return ''
    // Group by category as a proxy (BasketItem has no store field)
    const catCounts = new Map<string, number>()
    for (const item of basketItems) {
      catCounts.set(item.category, (catCounts.get(item.category) ?? 0) + 1)
    }
    return [...catCounts.entries()]
      .map(([cat, count]) => {
        const label = cat === 'fresh' ? 'Fresh' : cat === 'long-life' ? 'Long-life' : 'Household'
        return `${label} (${count})`
      })
      .join(' · ')
  }, [basketItems])

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

  // ── Sidebar filter content (used on desktop) ──
  const sidebarFilters = (
    <div className="space-y-5">
      {/* Region */}
      <div>
        <button
          type="button"
          aria-label="Region: Switzerland (all regions)"
          title="Region filter — all Swiss stores shown"
          className="flex w-full items-center gap-1 rounded-[999px] border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#666] hover:border-[#2563eb] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
        >
          📍 Switzerland ▾
        </button>
      </div>

      {/* Type */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a8f98]">Type</p>
        <div className="flex flex-col gap-1" role="tablist" aria-label="Filter by department">
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
                data-tab-group="sidebar-top"
                onClick={() => setTopLevel(tab.id as Category | 'all')}
                className={`min-h-[44px] rounded-[6px] px-3 py-1.5 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-[#444] hover:bg-[#f4f6fa]'
                }`}
              >
                {tab.label}
                <span className={`ml-1 text-[11px] ${isActive ? 'text-white/80' : 'text-[#999]'}`}>
                  ({count})
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Category */}
      {visibleBrowseCategories.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a8f98]">Category</p>
          <div className="flex flex-col gap-1" role="tablist" aria-label="Filter by category">
            {/* All pill */}
            <button
              type="button"
              role="tab"
              aria-selected={activeSub === null}
              onClick={() => setSubFilter(null)}
              className={`min-h-[44px] rounded-[6px] px-3 py-1.5 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                activeSub === null
                  ? 'bg-pill-active-bg text-pill-active-text'
                  : 'text-[#444] hover:bg-[#f4f6fa]'
              }`}
            >
              All {topLevelLabel}
              <span className={`ml-1 text-[11px] ${activeSub === null ? '' : 'text-[#999]'}`}>
                ({topLevelCounts.get(inferredTopLevel) ?? totalDeals})
              </span>
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
                  onClick={() => setSubFilter(cat.id)}
                  className={`min-h-[44px] rounded-[6px] px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    activeSub === cat.id
                      ? 'bg-pill-active-bg font-medium text-pill-active-text'
                      : 'text-[#444] hover:bg-[#f4f6fa]'
                  }`}
                >
                  {cat.emoji} {cat.label}
                  <span className={`ml-1 text-[11px] ${activeSub === cat.id ? '' : 'text-[#999]'}`}>
                    ({count})
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sub-category (L3) — sidebar version */}
      {activeSub !== null && distinctSubCategories.length > 1 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a8f98]">Sub-category</p>
          <div className="rounded-[8px] bg-[#f4f6fa] p-1.5">
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setActiveSubSub(null)}
                className={`min-h-[36px] rounded-[6px] px-2.5 py-1 text-left text-[12px] font-medium transition-colors ${
                  activeSubSub === null
                    ? 'bg-white shadow-sm font-semibold'
                    : 'text-[#666] hover:bg-white/60'
                }`}
              >
                All
              </button>
              {distinctSubCategories.map((sc) => {
                const meta = SUB_CATEGORY_META[sc]
                return (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setActiveSubSub(sc)}
                    className={`min-h-[36px] rounded-[6px] px-2.5 py-1 text-left text-[12px] transition-colors ${
                      activeSubSub === sc
                        ? 'bg-white font-semibold shadow-sm'
                        : 'text-[#666] hover:bg-white/60'
                    }`}
                  >
                    {meta?.emoji ?? '📦'} {meta?.label ?? sc}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stores */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a8f98]">Stores</p>
        <div className="flex flex-col gap-1">
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
                className={`min-h-[44px] rounded-[6px] border px-3 py-1.5 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2${isEmpty && !isActive ? ' cursor-not-allowed opacity-40' : ''}`}
                style={isActive
                  ? { backgroundColor: meta.hex, color: 'white', borderColor: meta.hex }
                  : { color: meta.hexText, borderColor: meta.hexText, backgroundColor: 'white' }}
              >
                {meta.label}
                <span className={`ml-1 text-[11px] ${isActive ? 'opacity-80' : ''}`}>
                  ({count})
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">This week's deals</h1>
      </div>
      <div className="mb-3 flex items-center justify-between">
        <DataFreshness lastUpdated={pipelineRun?.run_at ?? null} />
        {/* Region chip — persistent setting indicator */}
        <button
          type="button"
          aria-label="Region: Switzerland (all regions)"
          title="Region filter — all Swiss stores shown"
          className="flex items-center gap-1 rounded-[999px] border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#666] hover:border-[#2563eb] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
        >
          📍 Switzerland ▾
        </button>
      </div>

      {/* Verdict summary strip */}
      {verdictText && (
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#bfe3cb] bg-[#e6f4ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#147a2d]">
            {verdictText}
          </span>
        </div>
      )}

      {isStale && pipelineRun && (
        <div className="mb-3">
          <StaleBanner lastUpdated={pipelineRun.run_at} />
        </div>
      )}

      {/* Desktop layout — sidebar + main content */}
      <div className="md:grid md:grid-cols-[220px_1fr] md:gap-6">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden md:block" aria-label="Filters">
          {sidebarFilters}
        </aside>

        {/* Main content */}
        <div>
          {/* ── Tier 1: Top-level tabs (mobile only) ── */}
          <div
            className="mb-2 flex border-b border-border md:hidden"
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

          {/* ── Tier 2: Browse category pills (mobile only) ── */}
          {visibleBrowseCategories.length > 0 && (
            <div className="mb-3 md:hidden">
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
                  className={`min-h-[44px] rounded-full px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
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
                      className={`min-h-[44px] rounded-full px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
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
                      className={`min-h-[44px] rounded-full px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
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

          {/* ── L3 sub-sub-category filter (shown when L2 active, mobile + desktop) ── */}
          {activeSub !== null && distinctSubCategories.length > 1 && (
            <div className="mb-3 md:hidden">
              <div className="rounded-lg bg-[#f4f6fa] p-1.5">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#8a8f98]">
                    Sub
                  </span>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setActiveSubSub(null)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
                        activeSubSub === null
                          ? 'bg-white font-semibold shadow-sm'
                          : 'text-[#666] hover:bg-white/70'
                      }`}
                    >
                      All
                    </button>
                    {distinctSubCategories.map((sc) => {
                      const meta = SUB_CATEGORY_META[sc]
                      return (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => setActiveSubSub(sc)}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
                            activeSubSub === sc
                              ? 'bg-white font-semibold shadow-sm'
                              : 'text-[#666] hover:bg-white/70'
                          }`}
                        >
                          {meta?.emoji ?? '📦'} {meta?.label ?? sc}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Store filter pills (horizontal scroll, mobile only) ── */}
          <div className="mb-3 md:hidden">
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
                    className={`shrink-0 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2${isEmpty && !isActive ? ' cursor-not-allowed opacity-40' : ''}`}
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
          <div className="relative mb-3">
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
                Showing {totalFiltered} {activeLabel} deal{totalFiltered !== 1 ? 's' : ''}
                {isStoreFilterActive && ` from ${[...activeStores].map((s) => STORE_META[s].label).join(', ')}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowCount(INITIAL_SHOW)
                  setActiveSubSub(null)
                  setSearchParams({})
                }}
                className="min-h-[44px] px-2 text-sm font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* ── Starter pack banner (dismissible) ── */}
          {!starterBannerDismissed && (basketItems?.length ?? 0) === 0 && (
            <div className="mb-3 flex items-center justify-between rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
              <span className="text-sm text-[#1d4ed8]">
                New here?{' '}
                <Link to="/onboarding" className="font-semibold underline">
                  Start with Swiss Basics →
                </Link>
              </span>
              <button
                type="button"
                aria-label="Dismiss starter pack suggestion"
                onClick={dismissStarterBanner}
                className="ml-3 flex size-7 shrink-0 items-center justify-center rounded-full text-[#1d4ed8] hover:bg-[#dbeafe] focus-visible:ring-2 focus-visible:ring-[#2563eb]"
              >
                ✕
              </button>
            </div>
          )}

          {/* Content */}
          <div id="deals-tabpanel" role="tabpanel" aria-labelledby={`tab-${inferredTopLevel}`}>
            {!hasResults && (
              <div className="py-12 text-center text-sm text-muted">
                No deals from {isStoreFilterActive
                  ? [...activeStores].map((s) => STORE_META[s].label).join(', ')
                  : 'selected stores'} in {activeLabel.toLowerCase()} this week. Try another category or store.
              </div>
            )}
            {hasResults && (
              <div className="pb-20">
                {/* Result count */}
                <p className="mb-3 text-xs text-muted">
                  Showing {subCategoryBands.length} sub-categor{subCategoryBands.length !== 1 ? 'ies' : 'y'} · {totalFiltered} deal{totalFiltered !== 1 ? 's' : ''}
                </p>

                {subCategoryBands.map((band) => (
                  <SubCategoryBand
                    key={band.subCategory}
                    subCategory={band.label}
                    emoji={band.emoji}
                    deals={band.bandDeals}
                    onAdd={handleBandAdd}
                    addedIds={localAddedIds}
                  />
                ))}

                {/* Fallback: flat cards for deals without sub_category */}
                {subCategoryBands.length === 0 && visibleDeals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    store={deal.store}
                    basketItems={basketItems ?? undefined}
                    onItemAdded={refetchBasket}
                    onItemRemoved={refetchBasket}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky bottom bar — my list */}
      {(basketItems?.length ?? 0) > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 cursor-pointer bg-[#111] px-4 py-3 text-white shadow-md"
          onClick={() => setListPanelOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="Open my list"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setListPanelOpen(true) }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-3">
            {/* Count chip */}
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-[#111]">
              {basketItems?.length}
            </span>
            {/* Label + breakdown */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">My list · {basketItems?.length} {basketItems?.length === 1 ? 'item' : 'items'}</p>
              {basketStoreBreakdown && (
                <p className="truncate text-[11px] text-white/70">{basketStoreBreakdown}</p>
              )}
            </div>
            {/* Open list button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setListPanelOpen(true) }}
              className="shrink-0 rounded-full border border-white/40 px-3 py-1 text-[12px] font-semibold text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#111]"
            >
              Open list
            </button>
            {/* WhatsApp share */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const itemList = (basketItems ?? []).map((i) => `• ${i.label}`).join('\n')
                const text = `My grocery shopping list (basketch):\n${itemList}\n\nCompare prices: ${window.location.origin}/compare/${basketId}`
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
              }}
              className="shrink-0 rounded-full bg-[#25d366] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#1fba59] focus-visible:ring-2 focus-visible:ring-[#25d366] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111]"
            >
              WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* My List Panel overlay */}
      <MyListPanel
        open={listPanelOpen}
        onClose={() => setListPanelOpen(false)}
        basketId={basketId}
        items={basketItems ?? []}
        onItemRemoved={refetchBasket}
      />
    </div>
  )
}
