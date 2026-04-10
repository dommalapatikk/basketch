import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

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
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  function invalidateItems() {
    queryClient.invalidateQueries({ queryKey: ['favorites', props.favoriteId, 'items'] })
  }

  async function handleRemove(itemId: string) {
    setRemoving((prev) => new Set(prev).add(itemId))
    const success = await removeFavoriteItem(itemId)
    if (success) {
      props.onItemsChange(props.items.filter((i) => i.id !== itemId))
      invalidateItems()
    }
    setRemoving((prev) => {
      const next = new Set(prev)
      next.delete(itemId)
      return next
    })
  }

  async function handleAdd(keyword: string, label: string, category: Category) {
    const item = await addFavoriteItem(props.favoriteId, { keyword, label, category })
    if (item) {
      props.onItemsChange([...props.items, item])
      invalidateItems()
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
        <ul className="list-none">
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
                {removing.has(item.id) ? '...' : 'x'}
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
