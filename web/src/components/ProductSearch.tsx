import { useState } from 'react'

import type { Category, DealRow } from '../../../shared/types'
import { searchDeals } from '../lib/queries'

export function ProductSearch(props: {
  onSelect: (keyword: string, label: string, category: Category) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DealRow[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    const trimmed = query.trim()
    if (!trimmed) return

    setSearching(true)
    setSearched(false)
    const deals = await searchDeals(trimmed)

    // Deduplicate by product name, keeping best discount
    const seen = new Map<string, DealRow>()
    for (const deal of deals) {
      const existing = seen.get(deal.product_name)
      if (!existing || (deal.discount_percent ?? 0) > (existing.discount_percent ?? 0)) {
        seen.set(deal.product_name, deal)
      }
    }

    setResults(Array.from(seen.values()).slice(0, 10))
    setSearching(false)
    setSearched(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  function handleSelect(deal: DealRow) {
    // Use the search query as keyword, product name as label
    props.onSelect(query.trim().toLowerCase(), deal.product_name, deal.category)
  }

  function handleAddCustom() {
    const trimmed = query.trim()
    if (!trimmed) return
    props.onSelect(trimmed.toLowerCase(), trimmed, 'long-life')
  }

  return (
    <div>
      <div className="flex gap-8 mb-8">
        <label htmlFor="product-search" className="sr-only">Search products</label>
        <input
          id="product-search"
          className="input"
          type="text"
          placeholder="Search products (e.g. milch, butter, poulet)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search products"
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          type="button"
        >
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <p className="text-sm text-muted mb-8">
          Matching keyword: <strong>{query.trim().toLowerCase()}</strong>
        </p>
      )}

      {searched && results.length === 0 && (
        <div>
          <p className="text-sm text-muted mb-8">
            No current deals found for "{query.trim()}". You can still add it to track future deals.
          </p>
          <button
            className="btn btn-sm btn-outline"
            onClick={handleAddCustom}
            type="button"
          >
            Add "{query.trim()}" to my list
          </button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="fav-list">
          {results.map((deal) => (
            <li key={`${deal.store}-${deal.product_name}`} className="fav-item">
              <div>
                <div className="fav-item-label">{deal.product_name}</div>
                <div className="fav-item-keyword">
                  CHF {deal.sale_price.toFixed(2)}
                  {deal.discount_percent ? ` (-${deal.discount_percent}%)` : ''}
                  {' | '}{deal.store}
                </div>
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => handleSelect(deal)}
                type="button"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
