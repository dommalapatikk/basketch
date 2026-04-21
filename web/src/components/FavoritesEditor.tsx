import { useState } from 'react'

import type { BasketItem, BrowseCategory, Category, FavoriteItemRow } from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'
import { addFavoriteItem, removeFavoriteItem } from '../lib/queries'
import { useProductGroups } from '../lib/hooks'
import { resolveBrowseCategory } from '../lib/matching'
import { readCategoryOverrides, writeCategoryOverride } from '../lib/category-overrides'
import { useToast } from './Toast'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { ProductSearch } from './ProductSearch'
import { CategoryPicker } from './CategoryPicker'

function toBasketItem(row: FavoriteItemRow): BasketItem {
  return {
    id: row.id,
    basketId: row.favorite_id,
    keyword: row.keyword,
    label: row.label,
    category: row.category,
    excludeTerms: row.exclude_terms,
    preferTerms: row.prefer_terms,
    productGroupId: row.product_group_id,
    createdAt: row.created_at,
  }
}

function getCategoryInfo(
  item: FavoriteItemRow,
  productGroups: ReturnType<typeof useProductGroups>['data'],
  overrides: Record<string, BrowseCategory>,
): { id: BrowseCategory; label: string; emoji: string } | null {
  const bc = resolveBrowseCategory(toBasketItem(item), productGroups ?? [], overrides)
  if (!bc) return null
  const info = BROWSE_CATEGORIES.find((c) => c.id === bc)
  if (!info) return null
  return { id: info.id, label: info.label, emoji: info.emoji }
}

export function FavoritesEditor(props: {
  favoriteId: string
  items: FavoriteItemRow[]
  onItemsChange: (items: FavoriteItemRow[]) => void
}) {
  const toast = useToast()
  const { data: productGroups } = useProductGroups()

  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [duplicateMsg, setDuplicateMsg] = useState<string | null>(null)
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const [pickerItem, setPickerItem] = useState<FavoriteItemRow | null>(null)
  const [overrides, setOverrides] = useState<Record<string, BrowseCategory>>(readCategoryOverrides)

  async function handleRemove(itemId: string) {
    setRemoving((prev) => new Set(prev).add(itemId))
    try {
      await removeFavoriteItem(props.favoriteId, itemId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const alreadyGone = msg.toLowerCase().includes('not found')
      if (!alreadyGone) {
        toast.show(`Could not remove item — please try again`)
        setRemoving((prev) => { const next = new Set(prev); next.delete(itemId); return next })
        return
      }
      // Item already gone from DB — fall through and remove from UI
    }
    // Write the post-mutation list into both cache keys so that any
    // concurrent or subsequent background refetch cannot re-hydrate stale
    // data. Clearing the key (previous workaround) leaves a window where
    // a racing doFetch writes the old list back; writing the correct list
    // here closes that window because setCache uses Date.now() as the
    // timestamp, making this entry newer than any in-flight fetch result.
    const afterRemove = props.items.filter((i) => i.id !== itemId)
    const cacheEntry = JSON.stringify({ data: afterRemove, timestamp: Date.now() })
    try { localStorage.setItem(`bsk:favorites:${props.favoriteId}:items`, cacheEntry) } catch { /* ignore */ }
    try { localStorage.setItem(`bsk:basket:${props.favoriteId}:items`, cacheEntry) } catch { /* ignore */ }
    props.onItemsChange(afterRemove)
    setRemoving((prev) => { const next = new Set(prev); next.delete(itemId); return next })
  }

  async function handleAdd(keyword: string, label: string, category: Category, productGroupId?: string) {
    const normalizedKeyword = keyword.toLowerCase().trim()
    if (props.items.some((i) => i.keyword.toLowerCase().trim() === normalizedKeyword)) {
      setDuplicateMsg(`"${label}" is already in your list`)
      setTimeout(() => setDuplicateMsg(null), 2500)
      return
    }

    const item = await addFavoriteItem(props.favoriteId, { keyword, label, category, productGroupId })
    if (item) {
      props.onItemsChange([...props.items, item])
      setNewItemId(item.id)
      setTimeout(() => setNewItemId(null), 2000)

      // Toast: show which category the item maps to
      const catInfo = getCategoryInfo(item, productGroups, overrides)
      toast.show(catInfo ? `${label} added to ${catInfo.label}` : `${label} added to your list`)
    }
    setAdding(false)
  }

  function handleCategoryChange(item: FavoriteItemRow, newCategory: BrowseCategory) {
    writeCategoryOverride(item.id, newCategory)
    setOverrides((prev) => ({ ...prev, [item.id]: newCategory }))
    const catInfo = BROWSE_CATEGORIES.find((c) => c.id === newCategory)
    if (catInfo) toast.show(`${item.label} moved to ${catInfo.label}`)
    setPickerItem(null)
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
          {props.items.map((item) => {
            const catInfo = getCategoryInfo(item, productGroups, overrides)
            const isNew = item.id === newItemId
            return (
              <li
                key={item.id}
                className={`flex items-center justify-between border-b border-border py-2.5 last:border-b-0 transition-colors ${
                  isNew ? 'border-l-2 border-l-success pl-2' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.label}</div>
                  {catInfo ? (
                    <button
                      type="button"
                      onClick={() => setPickerItem(item)}
                      className="mt-0.5 text-left text-xs text-muted hover:text-accent focus-visible:outline-none focus-visible:underline"
                      aria-label={`Change category for ${item.label} — currently ${catInfo.label}`}
                    >
                      {catInfo.emoji} {catInfo.label}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerItem(item)}
                      className="mt-0.5 text-left text-xs text-muted italic hover:text-accent focus-visible:outline-none focus-visible:underline"
                      aria-label={`Set category for ${item.label}`}
                    >
                      Set category
                    </button>
                  )}
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
            )
          })}
        </ul>
      )}

      <div className="mt-4 text-sm text-muted">
        {props.items.length} item{props.items.length !== 1 ? 's' : ''} in your list
      </div>

      {pickerItem && (
        <CategoryPicker
          itemLabel={pickerItem.label}
          currentCategory={getCategoryInfo(pickerItem, productGroups, overrides)?.id ?? null}
          onSelect={(cat) => handleCategoryChange(pickerItem, cat)}
          onClose={() => setPickerItem(null)}
        />
      )}
    </div>
  )
}
