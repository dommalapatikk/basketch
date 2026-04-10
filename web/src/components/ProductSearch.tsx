import { useState } from 'react'

import type { Category, DealRow } from '@shared/types'
import { searchDeals } from '../lib/queries'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

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
    props.onSelect(query.trim().toLowerCase(), deal.product_name, deal.category)
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
          placeholder="Search products (e.g. milch, butter, poulet)"
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

      {results.length > 0 && (
        <p className="mb-2 text-sm text-muted">
          Matching keyword: <strong>{query.trim().toLowerCase()}</strong>
        </p>
      )}

      {searched && results.length === 0 && (
        <div>
          <p className="mb-2 text-sm text-muted">
            No current deals found for "{query.trim()}". You can still add it to track future deals.
          </p>
          <Button variant="outline" size="sm" onClick={handleAddCustom} type="button">
            Add "{query.trim()}" to my list
          </Button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="list-none">
          {results.map((deal) => (
            <li key={`${deal.store}-${deal.product_name}`} className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
              <div>
                <div className="font-medium">{deal.product_name}</div>
                <div className="text-xs text-muted">
                  CHF {deal.sale_price.toFixed(2)}
                  {deal.discount_percent ? ` (-${deal.discount_percent}%)` : ''}
                  {' | '}{deal.store}
                </div>
              </div>
              <Button size="sm" onClick={() => handleSelect(deal)} type="button">
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
