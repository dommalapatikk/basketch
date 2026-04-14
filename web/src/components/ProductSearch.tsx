import { useState } from 'react'

import type { Category, DealRow, SearchResult, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { searchProducts } from '../lib/queries'
import { useProductGroups } from '../lib/hooks'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

export function ProductSearch(props: {
  onSelect: (keyword: string, label: string, category: Category, productGroupId?: string) => void
}) {
  const { data: allGroups } = useProductGroups()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    const trimmed = query.trim()
    if (!trimmed) return

    setSearching(true)
    setSearched(false)
    const searchResults = await searchProducts(trimmed, allGroups ?? [])
    setResults(searchResults)
    setSearching(false)
    setSearched(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  function handleSelect(result: SearchResult) {
    const kw = query.trim().toLowerCase()
    const keyword = kw.length >= 3 ? kw : result.label.toLowerCase()
    props.onSelect(keyword, result.label, result.category, result.productGroup?.id)
  }

  function handleAddCustom() {
    const trimmed = query.trim()
    if (!trimmed) return
    props.onSelect(trimmed.toLowerCase(), trimmed, 'long-life')
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <label htmlFor="product-search" className="sr-only">Search products</label>
        <Input
          id="product-search"
          type="text"
          placeholder="Search in German (e.g. milch, butter, poulet)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          type="button"
        >
          {searching ? '...' : 'Search'}
        </Button>
      </div>

      {searched && results.length === 0 && (
        <div>
          <p className="mb-2 text-sm text-muted">
            No products found for &ldquo;{query.trim()}&rdquo;. You can still add it to track future deals.
          </p>
          <Button variant="outline" size="sm" onClick={handleAddCustom} type="button">
            Add &ldquo;{query.trim()}&rdquo; to my list
          </Button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="list-none" aria-label="Search results">
          {results.map((result, i) => (
            <li key={result.productGroup?.id ?? `deal-${i}`} className="flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{result.label}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {ALL_STORES.filter((s) => result.storeDeals[s] || result.regularPrices[s] != null).map((store) => (
                    <StorePrice
                      key={store}
                      store={store}
                      deal={result.storeDeals[store] ?? null}
                      regularPrice={result.regularPrices[store] ?? null}
                    />
                  ))}
                </div>
              </div>
              <Button size="sm" onClick={() => handleSelect(result)} type="button">
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StorePrice(props: {
  store: Store
  deal: DealRow | null
  regularPrice: number | null
}) {
  const { store, deal, regularPrice } = props
  const meta = STORE_META[store]

  if (deal) {
    return (
      <span style={{ color: meta.hexText }}>
        <span className="font-semibold">{meta.label}</span>{' '}
        CHF {(deal.sale_price ?? 0).toFixed(2)}
        {deal.discount_percent != null && deal.discount_percent > 0 && (
          <span className="ml-0.5 text-success">-{deal.discount_percent}%</span>
        )}
      </span>
    )
  }

  if (regularPrice != null) {
    return (
      <span className="text-muted">
        <span className="font-semibold">{meta.label}</span>{' '}
        CHF {regularPrice.toFixed(2)} <span className="italic">regular</span>
      </span>
    )
  }

  return null
}
