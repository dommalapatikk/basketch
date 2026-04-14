import { useState } from 'react'

import type { BasketItem, Category, DealRow } from '@shared/types'

import { addBasketItem } from '../lib/queries'
import { useBasketId } from '../lib/hooks'

export interface DealCardProps {
  deal: DealRow
  store: 'migros' | 'coop'
  basketItems?: BasketItem[]
  onItemAdded?: () => void
}

function dealToKeyword(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function DealCard(props: DealCardProps) {
  const { deal, store, basketItems, onItemAdded } = props
  const storeColor = store === 'migros' ? 'bg-migros' : 'bg-coop'
  const { getOrCreate } = useBasketId()

  const [adding, setAdding] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  const keyword = dealToKeyword(deal.product_name)
  const alreadyInList = basketItems?.some((item) => item.keyword === keyword) ?? false

  const showCheck = alreadyInList || justAdded

  async function handleAdd() {
    if (showCheck || adding) return
    setAdding(true)
    try {
      const basketId = await getOrCreate()
      await addBasketItem(basketId, {
        keyword,
        label: deal.product_name,
        category: deal.category as Category,
      })
      setJustAdded(true)
      onItemAdded?.()
      setTimeout(() => setJustAdded(false), 2000)
    } catch {
      // silently fail — duplicate keyword constraint or network error
    } finally {
      setAdding(false)
    }
  }

  const ariaLabel = `${deal.product_name}, CHF ${deal.sale_price.toFixed(2)}${
    deal.discount_percent ? `, ${deal.discount_percent}% off` : ''
  } at ${store === 'migros' ? 'Migros' : 'Coop'}`

  return (
    <article
      className="flex gap-3 rounded-md border border-border bg-surface p-3"
      aria-label={ariaLabel}
    >
      {deal.image_url ? (
        <img
          className="size-16 shrink-0 rounded object-contain bg-gray-50"
          src={deal.image_url}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded bg-gray-50 text-xs text-muted">
          {store === 'migros' ? 'M' : 'C'}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-semibold">{deal.product_name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-bold">
            CHF {deal.sale_price.toFixed(2)}
          </span>
          {deal.original_price != null && deal.original_price > deal.sale_price && (
            <span className="text-xs text-muted line-through">
              {deal.original_price.toFixed(2)}
            </span>
          )}
          {deal.discount_percent != null && deal.discount_percent > 0 && (
            <span className={`ml-auto inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white ${storeColor}`}>
              -{deal.discount_percent}%
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={showCheck || adding}
        aria-label={showCheck ? 'Already in list' : `Add ${deal.product_name} to list`}
        className={`flex size-9 shrink-0 items-center justify-center self-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
          showCheck
            ? 'bg-green-100 text-green-600'
            : 'bg-gray-100 text-muted hover:bg-gray-200 hover:text-current'
        }`}
      >
        {adding ? (
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
        ) : showCheck ? (
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
          </svg>
        )}
      </button>
    </article>
  )
}
