import type { FavoriteComparison } from '@shared/types'
import { splitShoppingList } from '../lib/matching'

import { CompareCard } from './CompareCard'

export function SplitList(props: { comparisons: FavoriteComparison[] }) {
  const { migros, coop, either, noDeals } = splitShoppingList(props.comparisons)

  if (props.comparisons.length === 0) {
    return <div className="py-12 text-center text-muted">Your list is empty. Add items to see deals.</div>
  }

  return (
    <div>
      {migros.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
            <span className="size-3 rounded-full bg-migros" />
            Buy at Migros ({migros.length})
          </h2>
          {migros.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}

      {coop.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
            <span className="size-3 rounded-full bg-coop" />
            Buy at Coop ({coop.length})
          </h2>
          {coop.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}

      {either.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 py-3 text-base font-semibold">
            <span className="size-3 rounded-full bg-success" />
            Same deal at both ({either.length})
          </h2>
          {either.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}

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
