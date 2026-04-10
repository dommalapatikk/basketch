import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import type { DealRow, FavoriteComparison, FavoriteItemRow } from '../../../shared/types'
import { fetchActiveDeals, fetchFavoriteItems } from '../lib/queries'
import { matchFavorites } from '../lib/matching'
import { SplitList } from '../components/SplitList'

export function ComparisonPage() {
  const { favoriteId } = useParams<{ favoriteId: string }>()
  const [comparisons, setComparisons] = useState<FavoriteComparison[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!favoriteId) {
      setError('No favorites list found')
      setLoading(false)
      return
    }

    Promise.all([
      fetchFavoriteItems(favoriteId),
      fetchActiveDeals(),
    ]).then(([items, deals]: [FavoriteItemRow[], DealRow[]]) => {
      if (items.length === 0) {
        setError('Your favorites list is empty')
        setLoading(false)
        return
      }
      const matched = matchFavorites(items, deals)
      setComparisons(matched)
      setLoading(false)
    }).catch(() => {
      setError('Could not load your deals')
      setLoading(false)
    })
  }, [favoriteId])

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

  if (loading) return <div className="loading">Loading your deals...</div>
  if (error) {
    return (
      <div>
        <div className="error-msg">{error}</div>
        <Link to="/onboarding" className="btn btn-primary btn-block mt-16">
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
      <h1 className="page-title">Your deals this week</h1>
      <p className="page-subtitle">
        {comparisons.length} items compared
      </p>

      {(migrosItems.length > 0 || coopItems.length > 0) && (
        <div className="savings-summary">
          <div className="savings-card savings-card-migros">
            <div className="savings-card-label store-migros">Migros</div>
            <div className="savings-card-amount">CHF {migrosTotal.toFixed(2)}</div>
            <div className="savings-card-count">{migrosItems.length} item{migrosItems.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="savings-card savings-card-coop">
            <div className="savings-card-label store-coop">Coop</div>
            <div className="savings-card-amount">CHF {coopTotal.toFixed(2)}</div>
            <div className="savings-card-count">{coopItems.length} item{coopItems.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      )}

      <SplitList comparisons={comparisons} />

      <div className="share-section mt-16">
        <h3 className="section-title">Save this list</h3>
        <p className="text-sm text-muted mb-8">
          Bookmark this page or share the link to access your list anytime.
        </p>
        <div className="share-url">
          <div className="share-url-text">{window.location.href}</div>
          <button className="btn btn-sm btn-outline" onClick={handleCopyLink} type="button">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={handleShare} type="button">
            Share
          </button>
        </div>
      </div>

      <div className="mt-16 text-center">
        <Link to="/onboarding" className="btn btn-outline btn-sm" state={{ favoriteId, editMode: true }}>
          Edit my list
        </Link>
      </div>
    </div>
  )
}
