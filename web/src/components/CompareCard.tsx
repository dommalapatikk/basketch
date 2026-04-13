import type { DealRow, FavoriteComparison, RegularPrice } from '@shared/types'
import { Badge, type BadgeProps } from './ui/Badge'
import { CoopStatusMessage } from './CoopStatusMessage'

const REC_TAGS: Record<FavoriteComparison['recommendation'], { variant: BadgeProps['variant']; label: string }> = {
  migros: { variant: 'migros', label: 'Migros' },
  coop: { variant: 'coop', label: 'Coop' },
  both: { variant: 'both', label: 'Either' },
  none: { variant: 'none', label: '--' },
}

function DealColumn(props: {
  deal: DealRow | null
  regularPrice: RegularPrice | null
  storeName: string
  storeKey: 'migros' | 'coop'
  bgClass: string
  textClass: string
  coopProductKnown?: boolean
}) {
  const { deal, regularPrice, storeName, storeKey, bgClass, textClass, coopProductKnown } = props

  // Show deal if available
  if (deal) {
    return (
      <div className={`rounded-md p-2 ${bgClass}`} aria-label={`${storeName} deal`}>
        <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${textClass}`}>
          {storeName}
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
      <div className={`rounded-md p-2 ${bgClass}`} aria-label={`${storeName} deal`}>
        <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${textClass}`}>
          {storeName}
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
    <div className={`rounded-md p-2 ${bgClass}`} aria-label={`${storeName} deal`}>
      <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${textClass}`}>
        {storeName}
      </div>
      <div className="py-2">
        {storeKey === 'coop' && coopProductKnown !== undefined ? (
          <CoopStatusMessage coopProductKnown={coopProductKnown} />
        ) : (
          <p className="text-sm italic text-muted">
            Not on promotion at {storeName} this week
          </p>
        )}
      </div>
    </div>
  )
}

function buildAriaLabel(comparison: FavoriteComparison): string {
  const { favorite, migrosDeal, coopDeal, recommendation } = comparison
  const parts: string[] = [favorite.label + ':']

  if (migrosDeal) {
    parts.push(`on sale at Migros for CHF ${migrosDeal.sale_price.toFixed(2)}${
      migrosDeal.discount_percent ? ` (${migrosDeal.discount_percent}% off)` : ''
    }.`)
  } else {
    parts.push('Not on promotion at Migros.')
  }

  if (coopDeal) {
    parts.push(`On sale at Coop for CHF ${coopDeal.sale_price.toFixed(2)}${
      coopDeal.discount_percent ? ` (${coopDeal.discount_percent}% off)` : ''
    }.`)
  } else if (comparison.coopProductKnown) {
    parts.push('Not on promotion at Coop this week.')
  } else {
    parts.push('Not found at Coop yet.')
  }

  if (recommendation !== 'none') {
    const rec = recommendation === 'both' ? 'Either store'
      : recommendation === 'migros' ? 'Buy at Migros'
        : 'Buy at Coop'
    parts.push(rec + '.')
  }

  return parts.join(' ')
}

export function CompareCard(props: { comparison: FavoriteComparison }) {
  const { favorite, migrosDeal, coopDeal, migrosRegularPrice, coopRegularPrice, coopProductKnown, recommendation } = props.comparison
  const tag = REC_TAGS[recommendation]

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
        <Badge variant={tag.variant}>{tag.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DealColumn
          deal={migrosDeal}
          regularPrice={migrosRegularPrice}
          storeName="Migros"
          storeKey="migros"
          bgClass="bg-migros-light"
          textClass="text-migros-text"
        />
        <DealColumn
          deal={coopDeal}
          regularPrice={coopRegularPrice}
          storeName="Coop"
          storeKey="coop"
          bgClass="bg-coop-light"
          textClass="text-coop-text"
          coopProductKnown={coopProductKnown}
        />
      </div>
    </article>
  )
}
