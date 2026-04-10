import { useState } from 'react'

import { saveFavoriteEmail } from '../lib/queries'

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
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
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
      <div className="success-msg" role="status">
        List saved! Redirecting to your deals...
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="section-title">Secure your list</h3>
      <p className="text-sm text-muted mb-8">
        Enter your email so you can find your list again next week.
        No account needed.
      </p>
      <div className="email-group">
        <label htmlFor="email-capture" className="sr-only">Email address</label>
        <input
          id="email-capture"
          className="input"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Email address"
        />
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="text-sm mt-8 text-error" role="alert">{error}</p>}
    </div>
  )
}
