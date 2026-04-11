import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import { useActiveDeals, useFavoriteItems, usePageTitle, useProductsWithGroups } from '../lib/hooks'
import { matchFavorites } from '../lib/matching'
import { Button, buttonVariants } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { SplitList } from '../components/SplitList'

export function ComparisonPage() {
  usePageTitle('Your deals')
  const { favoriteId } = useParams<{ favoriteId: string }>()
  const [copied, setCopied] = useState(false)

  const {
    data: items,
    isLoading: itemsLoading,
    error: itemsError,
  } = useFavoriteItems(favoriteId)

  const {
    data: deals,
    isLoading: dealsLoading,
    error: dealsError,
  } = useActiveDeals()

  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useProductsWithGroups()

  const comparisons = useMemo(() => {
    if (!items?.length || !deals?.length) return []
    return matchFavorites(items, deals, products)
  }, [items, deals, products])

  const loading = itemsLoading || dealsLoading || productsLoading
  const error = itemsError || dealsError || productsError

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback: select a temporary input for manual copy
      const input = document.createElement('input')
      input.value = window.location.href
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: 'My basketch shopping list',
        text: 'Check out my split shopping list for Migros and Coop',
        url: window.location.href,
      })
    } else {
      handleCopyLink()
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-muted">
        Loading your deals...
        <div className="mx-auto mt-3 size-6 rounded-full border-[3px] border-border border-t-accent animate-spin" />
      </div>
    )
  }

  if (error || !favoriteId) {
    if (typeof window !== 'undefined') localStorage.removeItem('basketch_favoriteId')
    return (
      <div>
        <div className="rounded-md bg-error-light p-6 text-center text-error">
          {!favoriteId ? 'No favorites list found' : 'Could not load your deals'}
        </div>
        <Link to="/onboarding" className={buttonVariants({ fullWidth: true, className: 'mt-4' })}>
          Create a new list
        </Link>
      </div>
    )
  }

  if (items && items.length === 0) {
    return (
      <div>
        <div className="rounded-md bg-error-light p-6 text-center text-error">
          Your favorites list is empty
        </div>
        <Link to="/onboarding" className={buttonVariants({ fullWidth: true, className: 'mt-4' })}>
          Create a new list
        </Link>
      </div>
    )
  }

  const migrosItems = comparisons.filter((c) => c.recommendation === 'migros')
  const coopItems = comparisons.filter((c) => c.recommendation === 'coop')
  const withInfo = comparisons.filter((c) => c.recommendation !== 'none')
  const noInfo = comparisons.filter((c) => c.recommendation === 'none')

  const migrosTotal = migrosItems.reduce((sum, c) => {
    if (c.migrosDeal) return sum + c.migrosDeal.sale_price
    if (c.migrosRegularPrice) return sum + c.migrosRegularPrice.price
    return sum
  }, 0)
  const coopTotal = coopItems.reduce((sum, c) => {
    if (c.coopDeal) return sum + c.coopDeal.sale_price
    if (c.coopRegularPrice) return sum + c.coopRegularPrice.price
    return sum
  }, 0)

  // Calculate total savings (original - sale price for matched deals)
  const totalSavings = withInfo.reduce((sum, c) => {
    const deal = c.recommendation === 'migros' ? c.migrosDeal
      : c.recommendation === 'coop' ? c.coopDeal
        : c.migrosDeal ?? c.coopDeal
    if (!deal || deal.original_price == null) return sum
    return sum + Math.max(0, deal.original_price - deal.sale_price)
  }, 0)

  // Build verdict sentence
  function buildVerdict(): string {
    const parts: string[] = []
    if (migrosItems.length > 0) parts.push(`${migrosItems.length} at Migros`)
    if (coopItems.length > 0) parts.push(`${coopItems.length} at Coop`)
    if (parts.length === 0) return 'No deals matched this week.'
    const verdict = `Buy ${parts.join(', ')}.`
    if (totalSavings > 0) return `${verdict} Save CHF ${totalSavings.toFixed(2)} by splitting.`
    return verdict
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your deals this week</h1>
          <p className="mt-1 text-sm text-muted">
            {comparisons.length} items — {withInfo.length} with prices{noInfo.length > 0 ? `, ${noInfo.length} pending` : ''}
          </p>
        </div>
        <Link to="/onboarding" state={{ favoriteId, editMode: true }} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Edit list
        </Link>
      </div>

      {/* Verdict sentence */}
      {withInfo.length === 0 && comparisons.length > 0 && (
        <div className="mb-4 rounded-md bg-accent-light border border-accent/20 p-4 text-center text-sm">
          No deals matched your items this week. Check back next Wednesday when new promotions start.
        </div>
      )}

      {withInfo.length > 0 && (
        <div className="mb-4 rounded-md bg-accent-light border border-accent/20 p-4 text-center text-sm font-semibold">
          {buildVerdict()}
        </div>
      )}

      {/* Bookmark/share prompt — prominent for first-time visitors */}
      <Card className="mb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Bookmark this page to check deals next week.</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyLink} type="button">
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
            <Button size="sm" onClick={handleShare} type="button">
              Share
            </Button>
          </div>
        </div>
      </Card>

      {(migrosItems.length > 0 || coopItems.length > 0) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-migros-light p-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-migros-text">Migros</div>
            <div className="mt-0.5 text-xl font-bold">CHF {migrosTotal.toFixed(2)}</div>
            <div className="text-xs text-muted">{migrosItems.length} item{migrosItems.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="rounded-md bg-coop-light p-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-coop">Coop</div>
            <div className="mt-0.5 text-xl font-bold">CHF {coopTotal.toFixed(2)}</div>
            <div className="text-xs text-muted">{coopItems.length} item{coopItems.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      )}

      {(() => {
        const savingsEstimate = withInfo.reduce((sum, c) => {
          if (c.migrosDeal && c.coopDeal) {
            return sum + Math.abs(c.migrosDeal.sale_price - c.coopDeal.sale_price)
          }
          return sum
        }, 0)
        if (savingsEstimate <= 0) return null
        return (
          <div className="mb-4 rounded-md bg-success-light p-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-success">Estimated savings by splitting</div>
            <div className="mt-0.5 text-2xl font-bold text-success">CHF {savingsEstimate.toFixed(2)}</div>
          </div>
        )
      })()}

      <SplitList comparisons={comparisons} />
    </div>
  )
}
