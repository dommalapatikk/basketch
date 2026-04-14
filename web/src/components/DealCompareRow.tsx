import type { DealComparison, DealRow, Store } from '@shared/types'
import { STORE_META } from '@shared/types'

/**
 * Side-by-side comparison row showing the same product across multiple stores.
 * Highlights the cheapest price.
 */
export function DealCompareRow(props: { comparison: DealComparison }) {
  const { label, storeDeals, bestStore } = props.comparison

  const stores = Object.entries(storeDeals) as [Store, DealRow][]

  if (stores.length < 2) return null

  // Sort: best store first, then by price
  stores.sort((a, b) => {
    if (a[0] === bestStore) return -1
    if (b[0] === bestStore) return 1
    return a[1].sale_price - b[1].sale_price
  })

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      {/* Product name */}
      <div className="mb-2 text-sm font-semibold">{label}</div>

      {/* Store price columns */}
      <div className={`grid gap-2 ${stores.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {stores.slice(0, 3).map(([store, deal]) => {
          const meta = STORE_META[store]
          const isBest = store === bestStore
          return (
            <div
              key={store}
              className={`rounded-md p-2 text-center ${isBest ? 'ring-2 ring-offset-1' : ''}`}
              style={{
                backgroundColor: meta.hexLight,
                ...(isBest ? { ringColor: meta.hex } : {}),
              }}
            >
              {/* Store badge */}
              <span
                className="mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                style={{ backgroundColor: meta.hex }}
              >
                {meta.label}
              </span>

              {/* Image */}
              {deal.image_url && (
                <img
                  className="mx-auto mb-1 max-h-[60px] rounded object-contain"
                  src={deal.image_url}
                  alt=""
                  loading="lazy"
                />
              )}

              {/* Price */}
              <div className="text-lg font-bold">
                CHF {deal.sale_price.toFixed(2)}
              </div>

              {/* Original price */}
              {deal.original_price != null && deal.original_price > deal.sale_price && (
                <div className="text-xs text-muted line-through">
                  CHF {deal.original_price.toFixed(2)}
                </div>
              )}

              {/* Discount */}
              {deal.discount_percent != null && deal.discount_percent > 0 && (
                <div className="text-xs font-semibold" style={{ color: meta.hexText }}>
                  -{deal.discount_percent}%
                </div>
              )}

              {/* Best badge */}
              {isBest && (
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-success">
                  Best price
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Show remaining stores count if > 3 */}
      {stores.length > 3 && (
        <div className="mt-1 text-xs text-muted text-center">
          +{stores.length - 3} more store{stores.length - 3 > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
