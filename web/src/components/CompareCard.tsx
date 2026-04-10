import type { DealRow, FavoriteComparison } from '@shared/types'
import { Badge, type BadgeProps } from './ui/Badge'

const REC_TAGS: Record<FavoriteComparison['recommendation'], { variant: BadgeProps['variant']; label: string }> = {
  migros: { variant: 'migros', label: 'Migros' },
  coop: { variant: 'coop', label: 'Coop' },
  both: { variant: 'both', label: 'Either' },
  none: { variant: 'none', label: 'No deals' },
}

function DealColumn(props: { deal: DealRow | null; storeName: string; bgClass: string }) {
  const { deal, storeName, bgClass } = props

  if (!deal) {
    return (
      <div className={`rounded-md p-2 text-xs ${bgClass}`}>
        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide">{storeName}</div>
        <div className="italic text-muted">No deal</div>
      </div>
    )
  }

  return (
    <div className={`rounded-md p-2 text-xs ${bgClass}`}>
      <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide">{storeName}</div>
      {deal.image_url && (
        <img
          className="mb-1.5 max-h-[120px] w-full rounded object-contain bg-gray-50"
          src={deal.image_url}
          alt={deal.product_name}
          loading="lazy"
        />
      )}
      <div className="text-lg font-bold">
        CHF {deal.sale_price.toFixed(2)}
      </div>
      {deal.original_price != null && deal.original_price > deal.sale_price && (
        <div className="text-xs text-muted line-through">
          was CHF {deal.original_price.toFixed(2)}
        </div>
      )}
      {deal.discount_percent != null && deal.discount_percent > 0 && (
        <div className="text-xs font-semibold text-success">
          -{deal.discount_percent}%
        </div>
      )}
      <div className="mt-0.5 line-clamp-2 text-sm text-muted">
        {deal.product_name}
      </div>
    </div>
  )
}

export function CompareCard(props: { comparison: FavoriteComparison }) {
  const { favorite, migrosDeal, coopDeal, recommendation } = props.comparison
  const tag = REC_TAGS[recommendation]

  return (
    <div className="mb-2 rounded-md border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <strong>{favorite.label}</strong>
        <Badge variant={tag.variant}>{tag.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DealColumn deal={migrosDeal} storeName="Migros" bgClass="bg-migros-light" />
        <DealColumn deal={coopDeal} storeName="Coop" bgClass="bg-coop-light" />
      </div>
    </div>
  )
}
