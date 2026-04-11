import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BrowseCategory, DealRow } from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'
import { useActiveDeals, usePageTitle } from '../lib/hooks'
import { Card } from '../components/ui/Card'

function DealCard(props: { deal: DealRow }) {
  const { deal } = props

  return (
    <div className="flex gap-3 border-b border-border py-3 last:border-b-0">
      {deal.image_url && (
        <img
          className="size-16 shrink-0 rounded object-contain bg-gray-50"
          src={deal.image_url}
          alt={deal.product_name}
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-medium">{deal.product_name}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-base font-bold">{deal.sale_price === 0 ? 'Free' : `CHF ${(deal.sale_price ?? 0).toFixed(2)}`}</span>
          {deal.original_price != null && deal.original_price > deal.sale_price && (
            <span className="text-xs text-muted line-through">CHF {deal.original_price.toFixed(2)}</span>
          )}
          {deal.discount_percent != null && deal.discount_percent > 0 && (
            <span className="text-xs font-semibold text-success">-{deal.discount_percent}%</span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted capitalize">{deal.store}</div>
      </div>
    </div>
  )
}

export function DealsPage() {
  usePageTitle('Browse Deals')
  const { data: deals, isLoading, error } = useActiveDeals()
  const [activeCategory, setActiveCategory] = useState<BrowseCategory>('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      ro.disconnect()
    }
  }, [checkScroll])

  function scrollPillsRight() {
    scrollRef.current?.scrollBy({ left: 150, behavior: 'smooth' })
  }

  // Map deals to browse categories via sub_category matching
  const categorizedDeals = useMemo(() => {
    if (!deals) return new Map<BrowseCategory, DealRow[]>()

    const map = new Map<BrowseCategory, DealRow[]>()

    for (const deal of deals) {
      // Find which browse category this deal belongs to based on product sub_category
      // We need to check the deal's source_category or infer from product_name
      let matched = false
      for (const cat of BROWSE_CATEGORIES) {
        // Match by known keywords in product name as fallback
        if (matchDealToCategory(deal, cat.subCategories)) {
          const existing = map.get(cat.id) ?? []
          existing.push(deal)
          map.set(cat.id, existing)
          matched = true
          break
        }
      }
      if (!matched) {
        // Put in a general bucket
        const existing = map.get('all') ?? []
        existing.push(deal)
        map.set('all', existing)
      }
    }

    return map
  }, [deals])

  const filteredDeals = useMemo(() => {
    if (!deals) return []
    if (activeCategory === 'all') return deals

    return categorizedDeals.get(activeCategory) ?? []
  }, [deals, activeCategory, categorizedDeals])

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts = new Map<BrowseCategory, number>()
    for (const [catId, catDeals] of categorizedDeals) {
      counts.set(catId, catDeals.length)
    }
    return counts
  }, [categorizedDeals])


  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted">
        Loading deals...
        <div className="mx-auto mt-3 size-6 rounded-full border-[3px] border-border border-t-accent animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-error-light p-6 text-center text-error">
        <p>Could not load deals</p>
        <button
          className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 min-h-[44px]"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Browse Deals</h1>
      <p className="mb-4 text-sm text-muted">
        {deals?.length ?? 0} active deals across Migros and Coop
      </p>

      {/* Category pills */}
      <div className="relative mb-4">
        <div
          ref={scrollRef}
          className={`flex gap-2 overflow-x-auto pb-2 no-scrollbar ${canScrollRight ? 'pr-10' : ''}`}
          role="radiogroup"
          aria-label="Filter by category"
        >
          <button
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              activeCategory === 'all'
                ? 'bg-accent text-white'
                : 'bg-surface border border-border hover:border-accent'
            }`}
            onClick={() => setActiveCategory('all')}
            type="button"
            role="radio"
            aria-checked={activeCategory === 'all'}
          >
            All ({deals?.length ?? 0})
          </button>
          {BROWSE_CATEGORIES.map((cat) => {
            const count = categoryCounts.get(cat.id) ?? 0
            if (count === 0) return null
            return (
              <button
                key={cat.id}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  activeCategory === cat.id
                    ? 'bg-accent text-white'
                    : 'bg-surface border border-border hover:border-accent'
                }`}
                onClick={() => setActiveCategory(cat.id)}
                type="button"
                role="radio"
                aria-checked={activeCategory === cat.id}
              >
                {cat.emoji} {cat.label} ({count})
              </button>
            )
          })}
        </div>
        {canScrollRight && (
          <button
            type="button"
            onClick={scrollPillsRight}
            className="absolute right-0 top-0 flex h-[44px] w-10 items-center justify-center bg-gradient-to-l from-bg via-bg/90 to-transparent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            aria-label="Scroll categories right"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Deals list */}
      {filteredDeals.length === 0 ? (
        <div className="py-12 text-center text-muted">No deals in this category</div>
      ) : (
        <Card>
          {filteredDeals.slice(0, 50).map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
          {filteredDeals.length > 50 && (
            <p className="py-4 text-center text-sm text-muted">
              Showing top 50 of {filteredDeals.length} deals
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

/**
 * Match a deal to a browse category based on product name keywords.
 * This is a simple heuristic until we have proper sub_category on all deals.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  fruit: ['apfel', 'äpfel', 'banane', 'erdbeere', 'himbeere', 'heidelbeere', 'beeren', 'kiwi', 'mango', 'orange', 'trauben', 'birne', 'ananas', 'melone'],
  vegetables: ['tomaten', 'kartoffel', 'zwiebel', 'karotten', 'rüebli', 'salat', 'gurke', 'peperoni', 'zucch', 'aubergine', 'spinat', 'broccoli', 'blumenkohl', 'lauch', 'champignon', 'pilze', 'spargel'],
  meat: ['hackfleisch', 'rinds', 'schwein', 'kalb', 'lamm', 'steak', 'filet', 'entrecôte'],
  poultry: ['poulet', 'chicken', 'trut', 'poul'],
  deli: ['salami', 'schinken', 'wurst', 'cervelat', 'bratwurst', 'wienerli', 'bresaola', 'prosciutto'],
  fish: ['lachs', 'salmon', 'thunfisch', 'crevetten', 'shrimp', 'garnelen', 'fisch', 'forelle', 'dorsch', 'pangasius'],
  dairy: ['milch', 'joghurt', 'jogurt', 'käse', 'butter', 'rahm', 'quark', 'mozzarella', 'feta', 'gruyère', 'emmentaler', 'mascarpone', 'ricotta', 'cream'],
  eggs: ['eier', 'freiland'],
  bread: ['brot', 'toast', 'zopf', 'weggli', 'bürli', 'ciabatta', 'focaccia', 'baguette', 'naan', 'brötchen'],
  chocolate: ['schokolade', 'praline', 'branche'],
  snacks: ['chips', 'müesli', 'nüsse', 'mandeln', 'erdnüsse', 'cashew', 'guezli', 'cookie', 'kekse', 'cracker'],
  'pasta-rice': ['pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'reis', 'basmati', 'risotto', 'couscous', 'mehl'],
  drinks: ['wein', 'bier', 'prosecco', 'saft', 'sirup', 'mineral', 'wasser', 'cola', 'rivella', 'energy'],
  'coffee-tea': ['kaffee', 'espresso', 'tee', 'cappuccino'],
  'ready-meals': ['pizza', 'lasagne', 'nuggets', 'rösti', 'gratin', 'fertig', 'convenience', 'cubes', 'tiefkühl', 'frites', 'glace', 'glacé'],
  canned: ['pelati', 'passata', 'dose', 'konserve', 'tomatenpüree', 'tomatensauce', 'kokosmilch', 'linsen', 'kichererbsen', 'bohnen', 'oliven'],
  condiments: ['olivenöl', 'sonnenblumenöl', 'rapsöl', 'zucker', 'senf', 'ketchup', 'essig', 'sauce', 'gewürz'],
  cleaning: ['reiniger', 'putzmittel', 'abwaschmittel', 'geschirrspül'],
  laundry: ['waschmittel', 'waschpulver', 'weichspüler'],
  'paper-goods': ['toilettenpapier', 'wc-papier', 'küchenpapier', 'taschentücher', 'tempo'],
  household: ['kerze', 'sack', 'müll', 'frischhalte', 'alufolie'],
  'personal-care': ['shampoo', 'duschgel', 'zahnpasta', 'zahncreme', 'deo', 'deodorant', 'creme', 'seife', 'lotion'],
}

function matchDealToCategory(deal: DealRow, subCategories: string[]): boolean {
  const name = deal.product_name.toLowerCase()
  for (const subCat of subCategories) {
    const keywords = CATEGORY_KEYWORDS[subCat]
    if (keywords && keywords.some((kw) => name.includes(kw))) {
      return true
    }
  }
  return false
}
