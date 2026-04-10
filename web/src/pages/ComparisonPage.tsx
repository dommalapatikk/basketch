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

  const migrosCount = comparisons.filter((c) => c.recommendation === 'migros').length
  const coopCount = comparisons.filter((c) => c.recommendation === 'coop').length

  return (
    <div>
      <h1 className="page-title">Your deals this week</h1>
      <p className="page-subtitle">
        {comparisons.length} items compared
        {migrosCount > 0 && ` | ${migrosCount} at Migros`}
        {coopCount > 0 && ` | ${coopCount} at Coop`}
      </p>

      <SplitList comparisons={comparisons} />

      <div className="mt-24 text-center">
        <Link to="/onboarding" className="btn btn-outline btn-sm">
          Edit my list
        </Link>
      </div>
    </div>
  )
}
