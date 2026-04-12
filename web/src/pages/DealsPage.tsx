import { useMemo, useState } from 'react'

import type { BrowseCategory, DealComparison, DealRow } from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'
import { useDealComparisons, usePageTitle } from '../lib/hooks'
import { Badge } from '../components/ui/Badge'

// ── Inline sub-components ──────────────────────────────────────────

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
          <span className="whitespace-nowrap text-base font-bold">
            {deal.sale_price === 0 ? 'Free' : `CHF ${(deal.sale_price ?? 0).toFixed(2)}`}
          </span>
          {deal.original_price != null && deal.original_price > deal.sale_price && (
            <span className="whitespace-nowrap text-xs text-muted line-through">
              CHF {deal.original_price.toFixed(2)}
            </span>
          )}
          {deal.discount_percent != null && deal.discount_percent > 0 && (
            <span className="text-xs font-semibold text-success">-{deal.discount_percent}%</span>
          )}
        </div>
      </div>
    </div>
  )
}

function DealComparisonColumn(props: {
  deal: DealRow | null
  storeName: string
  bgClass: string
  textClass: string
  isWinner: boolean
}) {
  const { deal, storeName, bgClass, textClass, isWinner } = props

  if (!deal) {
    return (
      <div className={`rounded-md p-3 ${bgClass}`}>
        <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${textClass}`}>
          {storeName}
        </div>
        <div className="py-4 text-center text-sm italic text-muted">No deal</div>
      </div>
    )
  }

  return (
    <div className={`rounded-md p-3 ${bgClass} ${isWinner ? 'ring-2 ring-success' : ''}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${textClass}`}>
          {storeName}
        </span>
        {isWinner && (
          <Badge variant="both">Best</Badge>
        )}
      </div>
      {deal.image_url && (
        <img
          className="mb-2 max-h-[80px] w-full rounded object-contain bg-gray-50"
          src={deal.image_url}
          alt={deal.product_name}
          loading="lazy"
        />
      )}
      <div className="truncate text-lg font-bold">
        {deal.sale_price === 0 ? 'Free' : `CHF ${(deal.sale_price ?? 0).toFixed(2)}`}
      </div>
      {deal.original_price != null && deal.original_price > deal.sale_price && (
        <div className="whitespace-nowrap text-xs text-muted line-through">
          was CHF {deal.original_price.toFixed(2)}
        </div>
      )}
      {deal.discount_percent != null && deal.discount_percent > 0 && (
        <div className="text-xs font-semibold text-success">
          -{deal.discount_percent}%
        </div>
      )}
      <div className="mt-1 line-clamp-2 text-xs text-muted">
        {deal.product_name}
      </div>
    </div>
  )
}

function DealComparisonCard(props: { comparison: DealComparison }) {
  const { label, matchType, migrosDeal, coopDeal, recommendation } = props.comparison

  const recTag = recommendation === 'migros'
    ? { variant: 'migros' as const, label: 'Migros wins' }
    : recommendation === 'coop'
      ? { variant: 'coop' as const, label: 'Coop wins' }
      : { variant: 'both' as const, label: 'Same price' }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <strong className="line-clamp-1 text-sm">{label}</strong>
          {matchType === 'name-similarity' && (
            <span className="text-xs text-muted"> (similar name)</span>
          )}
        </div>
        <Badge variant={recTag.variant}>{recTag.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DealComparisonColumn
          deal={migrosDeal}
          storeName="Migros"
          bgClass="bg-migros-light"
          textClass="text-migros-text"
          isWinner={recommendation === 'migros'}
        />
        <DealComparisonColumn
          deal={coopDeal}
          storeName="Coop"
          bgClass="bg-coop-light"
          textClass="text-coop-text"
          isWinner={recommendation === 'coop'}
        />
      </div>
    </div>
  )
}

function CollapsibleDealSection(props: {
  title: string
  deals: DealRow[]
  defaultOpen?: boolean
}) {
  const { title, deals, defaultOpen = false } = props
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const visibleDeals = showAll ? deals : deals.slice(0, 50)

  if (deals.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-gray-50 min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <span>{title} ({deals.length} deal{deals.length !== 1 ? 's' : ''})</span>
        <span className="text-muted">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isOpen && (
        <div className="border-t border-border px-4">
          {visibleDeals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
          {!showAll && deals.length > 50 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-center text-sm font-medium text-accent hover:underline min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Show all {deals.length} deals
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Category matching (kept from original) ─────────────────────────

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

function dealMatchesBrowseCategory(deal: DealRow, categoryId: BrowseCategory): boolean {
  if (categoryId === 'all') return true
  const cat = BROWSE_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat) return false
  return matchDealToCategory(deal, cat.subCategories)
}

function comparisonMatchesBrowseCategory(
  comparison: DealComparison,
  categoryId: BrowseCategory,
): boolean {
  if (categoryId === 'all') return true
  // Check either deal
  if (comparison.migrosDeal && dealMatchesBrowseCategory(comparison.migrosDeal, categoryId)) return true
  if (comparison.coopDeal && dealMatchesBrowseCategory(comparison.coopDeal, categoryId)) return true
  return false
}

// ── Main page component ────────────────────────────────────────────

export function DealsPage() {
  usePageTitle('Browse Deals')
  const { data: comparisons, deals, isLoading, error } = useDealComparisons()
  const [activeCategory, setActiveCategory] = useState<BrowseCategory>('all')

  // Category counts based on all deals (for pill badges)
  const categoryCounts = useMemo(() => {
    if (!deals) return new Map<BrowseCategory, number>()

    const counts = new Map<BrowseCategory, number>()
    for (const deal of deals) {
      for (const cat of BROWSE_CATEGORIES) {
        if (matchDealToCategory(deal, cat.subCategories)) {
          counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1)
          break
        }
      }
    }
    return counts
  }, [deals])

  // Filter comparisons and unmatched deals by active category
  const filtered = useMemo(() => {
    if (!comparisons) return { matched: [], unmatchedMigros: [], unmatchedCoop: [] }

    if (activeCategory === 'all') return comparisons

    return {
      matched: comparisons.matched.filter((c) => comparisonMatchesBrowseCategory(c, activeCategory)),
      unmatchedMigros: comparisons.unmatchedMigros.filter((d) => dealMatchesBrowseCategory(d, activeCategory)),
      unmatchedCoop: comparisons.unmatchedCoop.filter((d) => dealMatchesBrowseCategory(d, activeCategory)),
    }
  }, [comparisons, activeCategory])

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
          className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }

  const totalDeals = deals?.length ?? 0
  const hasResults = filtered.matched.length > 0 || filtered.unmatchedMigros.length > 0 || filtered.unmatchedCoop.length > 0

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Browse Deals</h1>
      <p className="mb-1 text-sm text-muted">
        {totalDeals} active deals across Migros and Coop
      </p>
      {comparisons && (
        <p className="mb-4 text-sm text-muted">
          {comparisons.matched.length} comparable product{comparisons.matched.length !== 1 ? 's' : ''} found
        </p>
      )}

      {/* Category pills */}
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Filter by category"
      >
        <button
          className={`rounded-full px-4 py-2.5 text-sm transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
            activeCategory === 'all'
              ? 'bg-accent text-white'
              : 'bg-surface border border-border hover:border-accent'
          }`}
          onClick={() => setActiveCategory('all')}
          type="button"
          role="radio"
          aria-checked={activeCategory === 'all'}
        >
          All ({totalDeals})
        </button>
        {BROWSE_CATEGORIES.map((cat) => {
          const count = categoryCounts.get(cat.id) ?? 0
          if (count === 0) return null
          return (
            <button
              key={cat.id}
              className={`rounded-full px-4 py-2.5 text-sm transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
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

      {/* Content */}
      {!hasResults ? (
        <div className="py-12 text-center text-muted">No deals in this category</div>
      ) : (
        <div className="space-y-6">
          {/* Matched comparisons */}
          {filtered.matched.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">
                Side-by-side comparisons ({filtered.matched.length})
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filtered.matched.map((comparison) => (
                  <DealComparisonCard key={comparison.id} comparison={comparison} />
                ))}
              </div>
            </div>
          )}

          {/* Unmatched sections */}
          {(filtered.unmatchedCoop.length > 0 || filtered.unmatchedMigros.length > 0) && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Store exclusives</h2>
              <CollapsibleDealSection
                title="Only at Coop"
                deals={filtered.unmatchedCoop}
                defaultOpen={filtered.matched.length < 5}
              />
              <CollapsibleDealSection
                title="Only at Migros"
                deals={filtered.unmatchedMigros}
                defaultOpen={filtered.matched.length < 5}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
