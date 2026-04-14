import type { DealRow } from '@shared/types'

export interface DealCardProps {
  deal: DealRow
  store: 'migros' | 'coop'
}

export function DealCard(props: DealCardProps) {
  const { deal, store } = props
  const storeColor = store === 'migros' ? 'bg-migros' : 'bg-coop'

  const ariaLabel = `${deal.product_name}, CHF ${deal.sale_price.toFixed(2)}${
    deal.discount_percent ? `, ${deal.discount_percent}% off` : ''
  } at ${store === 'migros' ? 'Migros' : 'Coop'}`

  return (
    <article
      className="flex gap-3 rounded-md border border-border bg-surface p-3"
      aria-label={ariaLabel}
    >
      {deal.image_url ? (
        <img
          className="size-16 shrink-0 rounded object-contain bg-gray-50"
          src={deal.image_url}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded bg-gray-50 text-xs text-muted">
          {store === 'migros' ? 'M' : 'C'}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-semibold">{deal.product_name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-bold">
            CHF {deal.sale_price.toFixed(2)}
          </span>
          {deal.original_price != null && deal.original_price > deal.sale_price && (
            <span className="text-xs text-muted line-through">
              {deal.original_price.toFixed(2)}
            </span>
          )}
          {deal.discount_percent != null && deal.discount_percent > 0 && (
            <span className={`ml-auto inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white ${storeColor}`}>
              -{deal.discount_percent}%
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
