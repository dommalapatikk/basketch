import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { DealRow, WeeklyVerdict } from '../../../shared/types'
import { fetchActiveDeals, lookupFavoriteByEmail } from '../lib/queries'
import { computeWeeklyVerdict } from '../lib/verdict'
import { VerdictBanner } from '../components/VerdictBanner'

export function HomePage() {
  const navigate = useNavigate()
  const [verdict, setVerdict] = useState<WeeklyVerdict | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetchActiveDeals().then((deals: DealRow[]) => {
      const todayStr = new Date().toISOString().slice(0, 10)
      setVerdict(computeWeeklyVerdict(deals, todayStr))
      setLoading(false)
    })
  }, [])

  async function handleEmailLookup() {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address')
      return
    }

    setSearching(true)
    setEmailError(null)
    const favoriteId = await lookupFavoriteByEmail(trimmed)

    if (favoriteId) {
      navigate(`/compare/${favoriteId}`)
    } else {
      setEmailError('No list found for this email. Try creating a new one.')
      setSearching(false)
    }
  }

  function handleEmailKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleEmailLookup()
  }

  return (
    <div>
      <div className="hero">
        <h1 className="hero-title">
          Smart grocery shopping<br />
          for Swiss shoppers
        </h1>
        <p className="hero-subtitle">
          Compare Migros and Coop deals for the items you actually buy.
          Save CHF 20-40 per month by shopping where deals are best.
        </p>
        <div className="hero-cta">
          <Link to="/onboarding" className="btn btn-primary btn-block">
            Build my shopping list
          </Link>
        </div>
      </div>

      <div className="card mt-24">
        <h3 className="section-title">Already have a list?</h3>
        <p className="text-sm text-muted mb-8">
          Enter the email you saved with your list to find it.
        </p>
        <div className="email-group">
          <label htmlFor="email-lookup" className="sr-only">Email address</label>
          <input
            id="email-lookup"
            className="input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleEmailKeyDown}
          />
          <button
            className="btn btn-primary"
            onClick={handleEmailLookup}
            disabled={searching}
            type="button"
          >
            {searching ? 'Searching...' : 'Find my list'}
          </button>
        </div>
        {emailError && <p className="text-sm mt-8 text-error" role="alert">{emailError}</p>}
      </div>

      {!loading && <div className="mt-24"><VerdictBanner verdict={verdict} /></div>}
    </div>
  )
}
