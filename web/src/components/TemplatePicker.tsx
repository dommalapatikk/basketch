import { useEffect, useState } from 'react'

import type { StarterPackRow } from '../../../shared/types'
import { fetchStarterPacks } from '../lib/queries'

export function TemplatePicker(props: {
  onSelect: (pack: StarterPackRow) => void
}) {
  const [packs, setPacks] = useState<StarterPackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchStarterPacks()
      .then((data) => {
        setPacks(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load starter packs')
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="loading">Loading starter packs...</div>
  if (error) return <div className="error-msg">{error}</div>
  if (packs.length === 0) return <div className="empty-msg">No starter packs available</div>

  function handleSelect(pack: StarterPackRow) {
    setSelectedId(pack.id)
    props.onSelect(pack)
  }

  return (
    <div>
      <h2 className="section-title">Pick a starter pack</h2>
      <p className="text-sm text-muted mb-16">
        Choose a template that matches your shopping style. You can customise it next.
      </p>
      <div className="pack-grid">
        {packs.map((pack) => (
          <button
            key={pack.id}
            className={`pack-card ${selectedId === pack.id ? 'selected' : ''}`}
            onClick={() => handleSelect(pack)}
            type="button"
          >
            <div className="pack-card-label">{pack.label}</div>
            {pack.description && (
              <div className="pack-card-desc">{pack.description}</div>
            )}
            <div className="text-sm text-muted mt-8">
              {pack.items.length} items
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
