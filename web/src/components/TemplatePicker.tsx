import { useState } from 'react'

import type { StarterPackRow } from '@shared/types'
import { useStarterPacks } from '../lib/hooks'
import { Button } from './ui/Button'

export function TemplatePicker(props: {
  onSelect: (pack: StarterPackRow) => void
  onSkip?: () => void
}) {
  const { data: packs, isLoading, error } = useStarterPacks()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted">
        Loading starter packs...
        <div className="mx-auto mt-3 size-6 rounded-full border-[3px] border-border border-t-accent animate-spin" />
      </div>
    )
  }
  if (error) return <div className="rounded-md bg-error-light p-6 text-center text-error">Could not load starter packs</div>
  if (!packs || packs.length === 0) {
    return (
      <div className="py-12 text-center text-muted">
        No starter packs available.
        {props.onSkip && (
          <div className="mt-4">
            <Button variant="outline" onClick={props.onSkip} type="button">Build from scratch</Button>
          </div>
        )}
      </div>
    )
  }

  function handleSelect(pack: StarterPackRow) {
    if (selectedId) return // Prevent double-clicks while loading
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
        {packs.map((pack) => (
          <button
            key={pack.id}
            className={`cursor-pointer rounded-lg border-2 p-4 text-center transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              selectedId === pack.id
                ? 'border-accent bg-accent-light shadow-md'
                : selectedId
                  ? 'border-border bg-surface opacity-50 cursor-not-allowed'
                  : 'border-border bg-surface hover:border-accent hover:shadow-md'
            }`}
            onClick={() => handleSelect(pack)}
            disabled={!!selectedId}
            type="button"
          >
            <div className="text-base font-semibold">{pack.label}</div>
            {pack.description && (
              <div className="mt-1 text-xs text-muted">{pack.description}</div>
            )}
            <div className="mt-1.5 text-xs leading-snug text-muted">
              {pack.items.slice(0, 6).map((i) => i.label).join(', ')}
              {pack.items.length > 6 && ` +${pack.items.length - 6} more`}
            </div>
          </button>
        ))}
      </div>
      {props.onSkip && (
        <Button variant="outline" fullWidth className="mt-4" onClick={props.onSkip} disabled={!!selectedId} type="button">
          Build my own list
        </Button>
      )}
    </div>
  )
}
