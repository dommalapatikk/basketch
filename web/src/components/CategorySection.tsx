import { Link } from 'react-router-dom'

import type { CategoryVerdict, DealRow } from '@shared/types'

function categoryDisplayName(cat: string): string {
  if (cat === 'fresh') return 'FRESH'
  if (cat === 'long-life') return 'LONG-LIFE'
  return 'NON-FOOD / HOUSEHOLD'
}

function topDeal(deals: DealRow[]): DealRow | null {
  if (deals.length === 0) return null
  return [...deals].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))[0] ?? null
}

export interface CategorySectionProps {
  verdict: CategoryVerdict
  migrosDeals: DealRow[]
  coopDeals: DealRow[]
}

export function CategorySection(props: CategorySectionProps) {
  const { verdict, migrosDeals, coopDeals } = props
  const topMigros = topDeal(migrosDeals)
  const topCoop = topDeal(coopDeals)

  // Link to deals page filtered by top-level category
  const catParam = verdict.category

  const ariaLabel = `${categoryDisplayName(verdict.category)} category: ${
    verdict.winner === 'migros'
      ? `Migros leads with ${verdict.migrosDeals} deals averaging ${verdict.migrosAvgDiscount}% off`
      : verdict.winner === 'coop'
        ? `Coop leads with ${verdict.coopDeals} deals averaging ${verdict.coopAvgDiscount}% off`
        : `Tied with ${verdict.migrosDeals} Migros and ${verdict.coopDeals} Coop deals`
  }`

  return (
    <Link
      to={`/deals?category=${catParam}`}
      className="block rounded-md border border-border bg-surface p-4 no-underline transition-shadow hover:shadow-md"
    >
      <article aria-label={ariaLabel}>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
          {categoryDisplayName(verdict.category)}
        </h2>

        <div className="space-y-1 text-sm">
          <p>
            <span className="font-semibold text-migros-text">Migros:</span>{' '}
            <span className="text-muted">
              {verdict.migrosDeals} deals, avg {verdict.migrosAvgDiscount}% off
            </span>
          </p>
          <p>
            <span className="font-semibold text-coop-text">Coop:</span>{' '}
            <span className="text-muted">
              {verdict.coopDeals} deals, avg {verdict.coopAvgDiscount}% off
            </span>
          </p>
        </div>

        {(topMigros || topCoop) && (
          <div className="mt-3 space-y-1 text-xs text-muted">
            {topMigros && (
              <p>
                Top deal: {topMigros.product_name} -{topMigros.discount_percent}% at{' '}
                <span className="font-semibold text-migros-text">Migros</span>
              </p>
            )}
            {topCoop && (
              <p>
                Top deal: {topCoop.product_name} -{topCoop.discount_percent}% at{' '}
                <span className="font-semibold text-coop-text">Coop</span>
              </p>
            )}
          </div>
        )}
      </article>
    </Link>
  )
}
