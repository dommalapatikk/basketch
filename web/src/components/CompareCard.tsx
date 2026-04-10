import type { DealRow, FavoriteComparison } from '../../../shared/types'

const REC_TAGS: Record<FavoriteComparison['recommendation'], { className: string; label: string }> = {
  migros: { className: 'tag tag-migros', label: 'Migros' },
  coop: { className: 'tag tag-coop', label: 'Coop' },
  both: { className: 'tag tag-both', label: 'Either' },
  none: { className: 'tag tag-none', label: 'No deals' },
}

function DealColumn(props: { deal: DealRow | null; storeName: string; storeClass: string }) {
  const { deal, storeName, storeClass } = props

  if (!deal) {
    return (
      <div className={`compare-store ${storeClass}`}>
        <div className="compare-store-name">{storeName}</div>
        <div className="compare-store-empty">No deal</div>
      </div>
    )
  }

  return (
    <div className={`compare-store ${storeClass}`}>
      <div className="compare-store-name">{storeName}</div>
      {deal.image_url && (
        <img
          className="compare-store-img"
          src={deal.image_url}
          alt={deal.product_name}
          loading="lazy"
        />
      )}
      <div className="compare-store-price">
        CHF {deal.sale_price.toFixed(2)}
      </div>
      {deal.original_price != null && deal.original_price > deal.sale_price && (
        <div className="compare-store-original">
          was CHF {deal.original_price.toFixed(2)}
        </div>
      )}
      {deal.discount_percent != null && deal.discount_percent > 0 && (
        <div className="compare-store-discount">
          -{deal.discount_percent}%
        </div>
      )}
      <div className="text-sm text-muted mt-2">
        {deal.product_name}
      </div>
    </div>
  )
}

export function CompareCard(props: { comparison: FavoriteComparison }) {
  const { favorite, migrosDeal, coopDeal, recommendation } = props.comparison
  const tag = REC_TAGS[recommendation]

  return (
    <div className="compare-card">
      <div className="compare-card-header">
        <div>
          <strong>{favorite.label}</strong>
        </div>
        <span className={tag.className}>{tag.label}</span>
      </div>

      <div className="compare-stores">
        <DealColumn deal={migrosDeal} storeName="Migros" storeClass="compare-store-migros" />
        <DealColumn deal={coopDeal} storeName="Coop" storeClass="compare-store-coop" />
      </div>
    </div>
  )
}
