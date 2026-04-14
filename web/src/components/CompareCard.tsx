import type { DealRow, FavoriteComparison, RegularPrice, Store } from '@shared/types'
import { ALL_STORES, STORE_META } from '@shared/types'

function DealColumn(props: {
  deal: DealRow | null
  regularPrice: RegularPrice | null
  store: Store
  productKnown: boolean
}) {
  const { deal, regularPrice, store } = props
  const meta = STORE_META[store]

  // Show deal if available
  if (deal) {
    return (
      <div className={`rounded-md p-2 ${meta.colorLight}`} aria-label={`${meta.label} deal`}>
        <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${meta.colorText}`}>
          {meta.label}
        </div>
        {deal.image_url && (
          <img
            className="mb-1.5 max-h-[80px] w-full rounded object-contain bg-gray-50"
            src={deal.image_url}
            alt=""
            loading="lazy"
          />
        )}
        <div className="text-lg font-bold">
          CHF {deal.sale_price.toFixed(2)}
        </div>
        {deal.original_price != null && deal.original_price > deal.sale_price && (
          <div className="text-sm text-muted line-through">
            was CHF {deal.original_price.toFixed(2)}
          </div>
        )}
        {deal.discount_percent != null && deal.discount_percent > 0 && (
          <div className="text-xs font-semibold text-success">
            -{deal.discount_percent}%
          </div>
        )}
        <div className="mt-1 line-clamp-2 text-sm text-muted">
          {deal.product_name}
        </div>
      </div>
    )
  }

  // Show regular price if available (no deal)
  if (regularPrice) {
    return (
      <div className={`rounded-md p-2 ${meta.colorLight}`} aria-label={`${meta.label} price`}>
        <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${meta.colorText}`}>
          {meta.label}
        </div>
        <div className="text-lg font-bold">
          CHF {regularPrice.price.toFixed(2)}
        </div>
        <div className="text-xs text-muted">Regular price</div>
        <div className="mt-1 line-clamp-2 text-sm text-muted">
          {regularPrice.productName}
        </div>
      </div>
    )
  }

  // No deal, no regular price — show status message
  return (
    <div className={`rounded-md p-2 ${meta.colorLight}`} aria-label={`${meta.label} deal`}>
      <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${meta.colorText}`}>
        {meta.label}
      </div>
      <div className="py-2">
        <p className="text-sm italic text-muted">
          Not on promotion at {meta.label} this week
        </p>
      </div>
    </div>
  )
}

function buildAriaLabel(comparison: FavoriteComparison): string {
  const { favorite, stores, bestStore } = comparison
  const parts: string[] = [favorite.label + ':']

  for (const store of ALL_STORES) {
    const match = stores[store]
    if (!match) continue
    const meta = STORE_META[store]
    if (match.deal) {
      parts.push(`on sale at ${meta.label} for CHF ${match.deal.sale_price.toFixed(2)}${
        match.deal.discount_percent ? ` (${match.deal.discount_percent}% off)` : ''
      }.`)
    }
  }

  if (bestStore !== 'none') {
    parts.push(`Best deal at ${STORE_META[bestStore].label}.`)
  }

  return parts.join(' ')
}

export function CompareCard(props: { comparison: FavoriteComparison }) {
  const { favorite, stores, bestStore, bestDeal } = props.comparison

  // Get stores that have any data (deal or regular price)
  const activeStores = ALL_STORES.filter((s) => stores[s] !== undefined)

  // Badge label for best store
  const bestLabel = bestStore !== 'none'
    ? `Best: ${STORE_META[bestStore].label}`
    : '--'

  return (
    <article
      className="mb-3 rounded-md border border-border bg-surface p-3"
      aria-label={buildAriaLabel(props.comparison)}
    >
      <div className="mb-1 flex items-center justify-between">
        <div>
          <strong className="text-base">{favorite.label}</strong>
          <div className="text-xs text-muted">{favorite.keyword}</div>
        </div>
        {bestDeal ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${STORE_META[bestStore as Store].colorBg}`}>
            {bestLabel}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted">
            {bestLabel}
          </span>
        )}
      </div>

      {/* Show columns for stores that have data — limit to first 2 for mobile layout */}
      {activeStores.length > 0 ? (
        <div
          className={`grid gap-2 ${activeStores.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {activeStores.slice(0, 2).map((store) => {
            const match = stores[store]!
            return (
              <DealColumn
                key={store}
                deal={match.deal}
                regularPrice={match.regularPrice}
                store={store}
                productKnown={match.productKnown}
              />
            )
          })}
        </div>
      ) : (
        <p className="text-sm italic text-muted">No price data found for this item.</p>
      )}
    </article>
  )
}
