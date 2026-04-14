import { useState } from 'react'

import type { BasketItem, Category, DealRow, StarterPackItem, Store } from '@shared/types'
import { STARTER_PACKS, STORE_META } from '@shared/types'

import { addBasketItem } from '../lib/queries'
import { useBasketId } from '../lib/hooks'
import { matchRelevance } from '../lib/matching'

export interface DealCardProps {
  deal: DealRow
  store: Store
  basketItems?: BasketItem[]
  onItemAdded?: () => void
}

/**
 * Build a deduplicated map of keyword → best StarterPackItem metadata.
 * Merges excludeTerms/preferTerms from all packs for the same keyword,
 * keeping the longest list of each.
 */
const KEYWORD_META: Map<string, StarterPackItem> = (() => {
  const map = new Map<string, StarterPackItem>()
  for (const pack of STARTER_PACKS) {
    for (const item of pack.items) {
      const existing = map.get(item.keyword)
      if (!existing || (item.excludeTerms?.length ?? 0) > (existing.excludeTerms?.length ?? 0)) {
        map.set(item.keyword, item)
      }
    }
  }
  return map
})()

/**
 * Find the best starter pack keyword that matches this deal's product name.
 * Returns the keyword + its metadata (excludeTerms, preferTerms, label).
 * Falls back to using the raw product name if no starter pack keyword matches.
 */
function findKeywordForDeal(deal: DealRow): {
  keyword: string
  label: string
  excludeTerms?: string[]
  preferTerms?: string[]
} {
  let bestKeyword: StarterPackItem | null = null
  let bestScore = 0

  for (const [, item] of KEYWORD_META) {
    if (item.category !== deal.category) continue
    const score = matchRelevance(item.keyword, deal.product_name)
    if (score > bestScore) {
      bestScore = score
      bestKeyword = item
    }
  }

  if (bestKeyword && bestScore >= 2) {
    return {
      keyword: bestKeyword.keyword,
      label: bestKeyword.label,
      excludeTerms: bestKeyword.excludeTerms,
      preferTerms: bestKeyword.preferTerms,
    }
  }

  // Fallback: use raw product name
  return {
    keyword: deal.product_name.toLowerCase().replace(/\s+/g, ' ').trim(),
    label: deal.product_name,
  }
}

export function DealCard(props: DealCardProps) {
  const { deal, store, basketItems, onItemAdded } = props
  const storeHex = STORE_META[store].hex
  const { getOrCreate } = useBasketId()

  const [adding, setAdding] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const [addError, setAddError] = useState(false)

  const meta = findKeywordForDeal(deal)
  const alreadyInList = basketItems?.some((item) => item.keyword === meta.keyword) ?? false

  const showCheck = alreadyInList || justAdded

  async function handleAdd() {
    if (showCheck || adding) return
    setAdding(true)
    try {
      setAddError(false)
      const basketId = await getOrCreate()
      await addBasketItem(basketId, {
        keyword: meta.keyword,
        label: meta.label,
        category: deal.category as Category,
        excludeTerms: meta.excludeTerms,
        preferTerms: meta.preferTerms,
      })
      setJustAdded(true)
      onItemAdded?.()
      setTimeout(() => setJustAdded(false), 2000)
    } catch {
      setAddError(true)
      setTimeout(() => setAddError(false), 2000)
    } finally {
      setAdding(false)
    }
  }

  const ariaLabel = `${deal.product_name}, CHF ${deal.sale_price.toFixed(2)}${
    deal.discount_percent ? `, ${deal.discount_percent}% off` : ''
  } at ${STORE_META[store].label}`

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
          {STORE_META[store].label.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: storeHex }}>
            {STORE_META[store].label}
          </span>
          <span className="line-clamp-1 text-sm font-semibold">{deal.product_name}</span>
        </div>
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
            <span className="ml-auto inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: storeHex }}>
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
        className={`flex size-11 shrink-0 items-center justify-center self-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
          addError
            ? 'bg-error-light text-error'
            : showCheck
              ? 'bg-green-100 text-green-600'
              : 'bg-gray-100 text-muted hover:bg-gray-200 hover:text-current'
        }`}
      >
        {adding ? (
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
        ) : addError ? (
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
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
