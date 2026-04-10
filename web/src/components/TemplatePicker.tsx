import { useState } from 'react'

import type { StarterPackRow } from '@shared/types'
import { useStarterPacks } from '../lib/hooks'
import { Badge } from './ui/Badge'

export function TemplatePicker(props: {
  onSelect: (pack: StarterPackRow) => void
}) {
  const { data: packs, isLoading, error } = useStarterPacks()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading) return <div className="py-12 text-center text-muted">Loading starter packs...</div>
  if (error) return <div className="rounded-md bg-error-light p-6 text-center text-error">Could not load starter packs</div>
  if (!packs || packs.length === 0) return <div className="py-12 text-center text-muted">No starter packs available</div>

  function handleSelect(pack: StarterPackRow) {
    setSelectedId(pack.id)
    props.onSelect(pack)
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Pick a starter pack</h2>
      <p className="mb-4 text-sm text-muted">
        Choose a template to pre-fill your list. You can add or remove items next.
      </p>
      <div className="grid grid-cols-2 gap-3 max-[400px]:grid-cols-1">
        {packs.map((pack, index) => (
          <button
            key={pack.id}
            className={`cursor-pointer rounded-md border-2 p-4 text-center transition-colors ${
              selectedId === pack.id
                ? 'border-accent bg-accent-light'
                : 'border-border bg-surface hover:border-accent'
            }`}
            onClick={() => handleSelect(pack)}
            type="button"
          >
            {index === 0 && (
              <Badge variant="accent">Recommended</Badge>
            )}
            <div className="mt-2 text-[0.95rem] font-semibold">{pack.label}</div>
            {pack.description && (
              <div className="mt-1 text-xs text-muted">{pack.description}</div>
            )}
            <div className="mt-1.5 text-[0.7rem] leading-snug text-muted">
              {pack.items.slice(0, 4).map((i) => i.label).join(', ')}
              {pack.items.length > 4 && ` +${pack.items.length - 4} more`}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
