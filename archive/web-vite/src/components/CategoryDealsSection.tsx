import { useState } from 'react'

import type { BasketItem, CategoryMatch, DealRow, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { DealCard } from './DealCard'

const DEFAULT_SHOW = 5

function StoreDealList(props: {
  store: Store
  deals: DealRow[]
  basketItems: BasketItem[]
  onItemAdded?: () => void
  onItemRemoved?: () => void
}) {
  const { store, deals, basketItems, onItemAdded, onItemRemoved } = props
  const meta = STORE_META[store]
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? deals : deals.slice(0, DEFAULT_SHOW)
  const hidden = deals.length - DEFAULT_SHOW

  return (
    <div className="mb-4">
      {/* Store sub-header: coloured pill + name + count */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className="h-4 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: meta.hex }}
          aria-hidden="true"
        />
        <span
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: meta.hexText }}
        >
          {meta.label}
        </span>
        <span className="text-xs text-muted">
          {deals.length} deal{deals.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            store={store}
            basketItems={basketItems}
            onItemAdded={onItemAdded}
            onItemRemoved={onItemRemoved ?? onItemAdded}
          />
        ))}
      </div>

      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full rounded-md border border-border py-2.5 text-center text-xs font-medium text-accent hover:bg-gray-50 min-h-[44px]"
        >
          Show {hidden} more {meta.label} deal{hidden !== 1 ? 's' : ''}
        </button>
      )}
      {expanded && deals.length > DEFAULT_SHOW && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 w-full rounded-md border border-border py-2.5 text-center text-xs font-medium text-muted hover:bg-gray-50 min-h-[44px]"
        >
          Show fewer
        </button>
      )}
    </div>
  )
}

export function CategoryDealsSection(props: {
  match: CategoryMatch
  basketItems: BasketItem[]
  onItemAdded?: () => void
  onItemRemoved?: () => void
}) {
  const { match, basketItems, onItemAdded, onItemRemoved } = props

  const storesWithDeals = ALL_STORES.filter((s) => (match.dealsByStore[s]?.length ?? 0) > 0)
  const allEmpty = storesWithDeals.length === 0
  const itemNames = match.sourceItems.map((i) => i.label).join(', ')

  return (
    <section
      className="mb-6"
      aria-label={`${match.browseCategoryLabel} deals`}
    >
      {/* Category header: emoji + label + deal count chip */}
      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
        <h2 className="text-base font-bold">
          {match.browseCategoryEmoji} {match.browseCategoryLabel}
        </h2>
        {!allEmpty && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted">
            {match.totalDealCount} deals
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">Tracking: {itemNames}</p>

      {allEmpty ? (
        /* Positive-framed empty state */
        <div className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-3">
          <span className="text-2xl" aria-hidden="true">{match.browseCategoryEmoji}</span>
          <div>
            <p className="text-sm font-medium text-muted">
              No {match.browseCategoryLabel} deals this week
            </p>
            <p className="mt-0.5 text-xs text-muted">
              New deals land Thursday evening — check back then.
            </p>
          </div>
        </div>
      ) : (
        storesWithDeals.map((store) => (
          <StoreDealList
            key={store}
            store={store}
            deals={match.dealsByStore[store]!}
            basketItems={basketItems}
            onItemAdded={onItemAdded}
            onItemRemoved={onItemRemoved ?? onItemAdded}
          />
        ))
      )}
    </section>
  )
}
