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
          <div className="flex items-center gap-2 py-3 font-semibold">
            <span className="size-3 rounded-full bg-migros" />
            Buy at Migros ({migros.length})
          </div>
          {migros.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}

      {coop.length > 0 && (
        <section>
          <div className="flex items-center gap-2 py-3 font-semibold">
            <span className="size-3 rounded-full bg-coop" />
            Buy at Coop ({coop.length})
          </div>
          {coop.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}

      {either.length > 0 && (
        <section>
          <div className="flex items-center gap-2 py-3 font-semibold">
            <span className="size-3 rounded-full bg-success" />
            Same deal at both ({either.length})
          </div>
          {either.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}

      {noDeals.length > 0 && (
        <section>
          <div className="flex items-center gap-2 py-3 font-semibold">
            <span className="size-3 rounded-full bg-muted" />
            No deals this week ({noDeals.length})
          </div>
          {noDeals.map((c) => (
            <CompareCard key={c.favorite.id} comparison={c} />
          ))}
        </section>
      )}
    </div>
  )
}
