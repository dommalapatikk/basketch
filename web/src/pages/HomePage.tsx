import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { DealRow, WeeklyVerdict } from '../../../shared/types'
import { fetchActiveDeals } from '../lib/queries'
import { computeWeeklyVerdict } from '../lib/verdict'
import { VerdictBanner } from '../components/VerdictBanner'

export function HomePage() {
  const [verdict, setVerdict] = useState<WeeklyVerdict | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActiveDeals().then((deals: DealRow[]) => {
      const todayStr = new Date().toISOString().slice(0, 10)
      setVerdict(computeWeeklyVerdict(deals, todayStr))
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <div className="hero">
        <h1 className="hero-title">
          Your groceries.<br />
          Two stores. One smart list.
        </h1>
        <p className="hero-subtitle">
          See which of your regular items are on sale this week at Migros or Coop.
        </p>
        <div className="hero-cta">
          <Link to="/onboarding" className="btn btn-primary btn-block">
            Build my shopping list
          </Link>
        </div>
      </div>

      {!loading && <VerdictBanner verdict={verdict} />}

      <div className="card mt-24">
        <h3 className="section-title">Already have a list?</h3>
        <p className="text-sm text-muted mb-8">
          Use the bookmark or link you saved last time to return to your comparison.
        </p>
        <Link to="/onboarding" className="btn btn-outline btn-block">
          Or start a new list
        </Link>
      </div>
    </div>
  )
}
