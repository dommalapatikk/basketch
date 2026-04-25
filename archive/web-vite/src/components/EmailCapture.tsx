import { useState } from 'react'

import { saveFavoriteEmail } from '../lib/queries'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'

export function EmailCapture(props: {
  favoriteId: string
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError('Please enter a valid email address')
      return
    }

    setSaving(true)
    setError(null)
    const success = await saveFavoriteEmail(props.favoriteId, trimmed)

    if (success) {
      setSaved(true)
      setTimeout(() => props.onSaved(), 1500)
    } else {
      setError('Could not save email. Try again.')
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
  }

  if (saved) {
    return (
      <div className="rounded-md bg-success-light p-6 text-center font-semibold text-success" role="status">
        List saved! Redirecting to your deals...
      </div>
    )
  }

  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">Save your list</h3>
      <p className="mb-2 text-sm text-muted">
        Enter your email so you can find your list again next week.
        No account needed. We only use it to look up your list — no spam, no marketing, never shared.
      </p>
      <div className="flex gap-2">
        <label htmlFor="email-capture" className="sr-only">Email address</label>
        <Input
          id="email-capture"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button onClick={handleSave} disabled={saving} type="button">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-error" role="alert">{error}</p>}
    </Card>
  )
}
