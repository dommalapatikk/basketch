import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { lookupBasketByEmail } from '../lib/queries'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

export function EmailLookup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState(false)

  async function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError('Please enter a valid email address')
      return
    }

    setSearching(true)
    setError(null)
    try {
      const basket = await lookupBasketByEmail(trimmed)
      if (basket) {
        setFound(true)
        localStorage.setItem('basketch_favoriteId', basket.id)
        setTimeout(() => navigate(`/compare/${basket.id}`), 500)
      } else {
        setError('No list found for this email.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  if (found) {
    return (
      <div className="rounded-md bg-success-light p-4 text-center text-sm font-semibold text-success" role="status">
        Found! Redirecting...
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted">Already have a list? Enter your email.</p>
      <div className="flex gap-2">
        <label htmlFor="email-lookup" className="sr-only">Email address</label>
        <Input
          id="email-lookup"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          onClick={handleSubmit}
          disabled={searching}
          type="button"
        >
          {searching ? 'Searching...' : 'Find'}
        </Button>
      </div>
      {error && (
        <div className="mt-2">
          <p className="text-sm text-error" role="alert">{error}</p>
          {error.includes('No list found') && (
            <Link to="/onboarding" className="mt-1 inline-block text-sm text-accent underline">
              Want to create one?
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
