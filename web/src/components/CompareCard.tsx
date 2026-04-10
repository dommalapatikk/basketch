import type { FavoriteComparison } from '../../../shared/types'

const REC_TAGS: Record<FavoriteComparison['recommendation'], { className: string; label: string }> = {
  migros: { className: 'tag tag-migros', label: 'Migros' },
  coop: { className: 'tag tag-coop', label: 'Coop' },
  both: { className: 'tag tag-both', label: 'Either' },
  none: { className: 'tag tag-none', label: 'No deals' },
}

export function CompareCard(props: { comparison: FavoriteComparison }) {
  const { favorite, migrosDeal, coopDeal, recommendation } = props.comparison
  const tag = REC_TAGS[recommendation]

  return (
    <div className="compare-card">
      <div className="compare-card-header">
        <div>
          <strong>{favorite.label}</strong>
          <span className="text-sm text-muted ml-8">
            {favorite.keyword}
          </span>
        </div>
        <span className={tag.className}>{tag.label}</span>
      </div>

      <div className="compare-stores">
        <div className="compare-store compare-store-migros">
          <div className="compare-store-name">Migros</div>
          {migrosDeal ? (
            <>
              <div className="compare-store-price">
                CHF {migrosDeal.sale_price.toFixed(2)}
              </div>
              {migrosDeal.discount_percent != null && migrosDeal.discount_percent > 0 && (
                <div className="compare-store-discount">
                  -{migrosDeal.discount_percent}%
                </div>
              )}
              <div className="text-sm text-muted mt-2">
                {migrosDeal.product_name}
              </div>
            </>
          ) : (
            <div className="compare-store-empty">No deal</div>
          )}
        </div>

        <div className="compare-store compare-store-coop">
          <div className="compare-store-name">Coop</div>
          {coopDeal ? (
            <>
              <div className="compare-store-price">
                CHF {coopDeal.sale_price.toFixed(2)}
              </div>
              {coopDeal.discount_percent != null && coopDeal.discount_percent > 0 && (
                <div className="compare-store-discount">
                  -{coopDeal.discount_percent}%
                </div>
              )}
              <div className="text-sm text-muted mt-2">
                {coopDeal.product_name}
              </div>
            </>
          ) : (
            <div className="compare-store-empty">No deal</div>
          )}
        </div>
      </div>
    </div>
  )
}
