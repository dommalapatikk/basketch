import { useState } from 'react'

import type { Category, FavoriteItemRow } from '@shared/types'
import { addFavoriteItem, removeFavoriteItem } from '../lib/queries'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { ProductSearch } from './ProductSearch'

export function FavoritesEditor(props: {
  favoriteId: string
  items: FavoriteItemRow[]
  onItemsChange: (items: FavoriteItemRow[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [duplicateMsg, setDuplicateMsg] = useState<string | null>(null)

  async function handleRemove(itemId: string) {
    setRemoving((prev) => new Set(prev).add(itemId))
    const success = await removeFavoriteItem(props.favoriteId, itemId)
    if (success) {
      props.onItemsChange(props.items.filter((i) => i.id !== itemId))
      // Cache will refresh on next navigation (useCachedQuery stale time)
    }
    setRemoving((prev) => {
      const next = new Set(prev)
      next.delete(itemId)
      return next
    })
  }

  async function handleAdd(keyword: string, label: string, category: Category, productGroupId?: string) {
    // Prevent duplicate keywords
    const normalizedKeyword = keyword.toLowerCase().trim()
    if (props.items.some((i) => i.keyword.toLowerCase().trim() === normalizedKeyword)) {
      setDuplicateMsg(`"${label}" is already in your list`)
      setTimeout(() => setDuplicateMsg(null), 2500)
      return
    }

    const item = await addFavoriteItem(props.favoriteId, { keyword, label, category, productGroupId })
    if (item) {
      props.onItemsChange([...props.items, item])
      // Cache will refresh on next navigation (useCachedQuery stale time)
    }
    setAdding(false)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your favorites</h2>
        <Button variant="outline" size="sm" onClick={() => setAdding(!adding)} type="button">
          {adding ? 'Cancel' : '+ Add item'}
        </Button>
      </div>

      {duplicateMsg && (
        <div className="mb-3 rounded-md bg-warning/10 p-2.5 text-center text-sm text-warning" role="alert">
          {duplicateMsg}
        </div>
      )}

      {adding && (
        <Card className="mb-4">
          <ProductSearch onSelect={handleAdd} />
        </Card>
      )}

      {props.items.length === 0 ? (
        <div className="py-12 text-center text-muted">
          Add your first product to see this week's best deals.
        </div>
      ) : (
        <ul className="list-none" aria-label="Your favorite items">
          {props.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-xs text-muted">{item.keyword}</div>
              </div>
              <button
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center border-none bg-transparent text-lg text-muted hover:text-error"
                onClick={() => handleRemove(item.id)}
                disabled={removing.has(item.id)}
                type="button"
                aria-label={`Remove ${item.label}`}
              >
                {removing.has(item.id) ? '\u00B7\u00B7\u00B7' : '\u00D7'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 text-sm text-muted">
        {props.items.length} item{props.items.length !== 1 ? 's' : ''} in your list
      </div>
    </div>
  )
}
