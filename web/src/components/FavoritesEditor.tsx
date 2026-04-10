import { useState } from 'react'

import type { Category, FavoriteItemRow } from '../../../shared/types'
import { addFavoriteItem, removeFavoriteItem } from '../lib/queries'

import { ProductSearch } from './ProductSearch'

export function FavoritesEditor(props: {
  favoriteId: string
  items: FavoriteItemRow[]
  onItemsChange: (items: FavoriteItemRow[]) => void
}) {
  const [adding, setAdding] = useState(false)

  async function handleRemove(itemId: string) {
    const success = await removeFavoriteItem(itemId)
    if (success) {
      props.onItemsChange(props.items.filter((i) => i.id !== itemId))
    }
  }

  async function handleAdd(keyword: string, label: string, category: Category) {
    const item = await addFavoriteItem(props.favoriteId, { keyword, label, category })
    if (item) {
      props.onItemsChange([...props.items, item])
    }
    setAdding(false)
  }

  return (
    <div>
      <div className="flex-between mb-16">
        <h2 className="section-title mb-0">Your favorites</h2>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => setAdding(!adding)}
          type="button"
        >
          {adding ? 'Cancel' : '+ Add item'}
        </button>
      </div>

      {adding && (
        <div className="card mb-16">
          <ProductSearch onSelect={handleAdd} />
        </div>
      )}

      {props.items.length === 0 ? (
        <div className="empty-msg">
          No items yet. Add some favorites to compare deals.
        </div>
      ) : (
        <ul className="fav-list">
          {props.items.map((item) => (
            <li key={item.id} className="fav-item">
              <div>
                <div className="fav-item-label">{item.label}</div>
                <div className="fav-item-keyword">{item.keyword}</div>
              </div>
              <button
                className="fav-remove"
                onClick={() => handleRemove(item.id)}
                type="button"
                aria-label={`Remove ${item.label}`}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="text-sm text-muted mt-16">
        {props.items.length} item{props.items.length !== 1 ? 's' : ''} in your list
      </div>
    </div>
  )
}
