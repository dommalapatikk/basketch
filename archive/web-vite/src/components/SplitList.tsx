import type { FavoriteComparison } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'
import { splitShoppingList } from '../lib/matching'

import { CompareCard } from './CompareCard'

export function SplitList(props: { comparisons: FavoriteComparison[] }) {
  const { byStore, noDeals } = splitShoppingList(props.comparisons)

  if (props.comparisons.length === 0) {
    return <div className="py-12 text-center text-muted">Your list is empty. Add items to see deals.</div>
  }

  return (
    <div>
      {ALL_STORES.map((store) => {
        const items = byStore[store]
        if (!items || items.length === 0) return null
        const meta = STORE_META[store]

        return (
          <section key={store}>
            <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
              <span className="size-3 rounded-full" style={{ backgroundColor: meta.hex }} />
              Buy at {meta.label} ({items.length})
            </h2>
            {items.map((c) => (
              <CompareCard key={c.favorite.id} comparison={c} />
            ))}
          </section>
        )
      })}

      {noDeals.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
            <span className="size-3 rounded-full bg-muted" />
            No price data ({noDeals.length})
          </h2>
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {noDeals.map((c) => (
                <span key={c.favorite.id}>{c.favorite.label}</span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">No deals or regular prices available for these items yet.</p>
          </div>
        </section>
      )}
    </div>
  )
}
