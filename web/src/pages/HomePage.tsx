import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { lookupFavoriteByEmail } from '../lib/queries'
import { Button, buttonVariants } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

export function HomePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

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
      <div className="py-8 text-center">
        <h1 className="text-[1.75rem] font-extrabold leading-tight">
          Smart grocery shopping<br />
          for Swiss shoppers
        </h1>
        <p className="mt-2 text-base text-muted">
          Compare Migros and Coop deals for the items you actually buy.
          Save CHF 20-40 per month by shopping where deals are best.
        </p>
        <div className="mt-6">
          <Link to="/onboarding" className={buttonVariants({ fullWidth: true })}>
            Build my shopping list
          </Link>
        </div>
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-lg font-semibold">Already have a list?</h3>
        <p className="mb-2 text-sm text-muted">
          Enter the email you saved with your list to find it.
        </p>
        <div className="flex gap-2">
          <label htmlFor="email-lookup" className="sr-only">Email address</label>
          <Input
            id="email-lookup"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleEmailKeyDown}
            className="flex-1"
          />
          <Button
            onClick={handleEmailLookup}
            disabled={searching}
            type="button"
          >
            {searching ? 'Searching...' : 'Find my list'}
          </Button>
        </div>
        {emailError && <p className="mt-2 text-sm text-error" role="alert">{emailError}</p>}
      </Card>
    </div>
  )
}
