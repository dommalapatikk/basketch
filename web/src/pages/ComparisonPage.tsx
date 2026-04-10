import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import { useActiveDeals, useFavoriteItems } from '../lib/hooks'
import { matchFavorites } from '../lib/matching'
import { Button, buttonVariants } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { SplitList } from '../components/SplitList'

export function ComparisonPage() {
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

  const comparisons = useMemo(() => {
    if (!items?.length || !deals?.length) return []
    return matchFavorites(items, deals)
  }, [items, deals])

  const loading = itemsLoading || dealsLoading
  const error = itemsError || dealsError

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
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
        <div className="mx-auto mt-3 size-6 rounded-full border-3 border-border border-t-accent animate-spin" />
      </div>
    )
  }

  if (error || !favoriteId) {
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

  const migrosTotal = migrosItems.reduce((sum, c) => sum + (c.migrosDeal?.sale_price ?? 0), 0)
  const coopTotal = coopItems.reduce((sum, c) => sum + (c.coopDeal?.sale_price ?? 0), 0)

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Your deals this week</h1>
      <p className="mb-6 text-sm text-muted">
        {comparisons.length} items compared
      </p>

      {(migrosItems.length > 0 || coopItems.length > 0) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-migros-light p-3 text-center">
            <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-migros">Migros</div>
            <div className="mt-0.5 text-xl font-bold">CHF {migrosTotal.toFixed(2)}</div>
            <div className="text-xs text-muted">{migrosItems.length} item{migrosItems.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="rounded-md bg-coop-light p-3 text-center">
            <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-coop">Coop</div>
            <div className="mt-0.5 text-xl font-bold">CHF {coopTotal.toFixed(2)}</div>
            <div className="text-xs text-muted">{coopItems.length} item{coopItems.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      )}

      <SplitList comparisons={comparisons} />

      <Card className="mt-4">
        <h3 className="mb-2 text-lg font-semibold">Save this list</h3>
        <p className="mb-2 text-sm text-muted">
          Bookmark this page or share the link to access your list anytime.
        </p>
        <div className="flex gap-2">
          <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border bg-bg px-3 py-2 text-xs text-muted">
            {window.location.href}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyLink} type="button">
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button size="sm" onClick={handleShare} type="button">
            Share
          </Button>
        </div>
      </Card>

      <div className="mt-4 text-center">
        <Link to="/onboarding" state={{ favoriteId, editMode: true }} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Edit my list
        </Link>
      </div>
    </div>
  )
}
