import { useEffect, useRef } from 'react'

import type { BrowseCategory } from '@shared/types'
import { BROWSE_CATEGORIES } from '@shared/types'

export function CategoryPicker(props: {
  itemLabel: string
  currentCategory: BrowseCategory | null
  onSelect: (category: BrowseCategory) => void
  onClose: () => void
}) {
  const { itemLabel, currentCategory, onSelect, onClose } = props
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape, trap focus inside
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    // Focus first radio on open
    const first = dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')
    first?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Change category for ${itemLabel}`}
        className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 className="mb-4 text-base font-semibold">
          Change category for &ldquo;{itemLabel}&rdquo;
        </h2>

        <div role="radiogroup" aria-label="Category" className="space-y-1">
          {BROWSE_CATEGORIES.map((cat) => {
            const isSelected = cat.id === currentCategory
            return (
              <label
                key={cat.id}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  isSelected ? 'bg-accent-light text-accent' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="browse-category"
                  value={cat.id}
                  checked={isSelected}
                  onChange={() => onSelect(cat.id)}
                  className="sr-only"
                />
                <span className="text-base">{cat.emoji}</span>
                <span className="text-sm font-medium">{cat.label}</span>
                {isSelected && (
                  <span className="ml-auto text-xs font-semibold text-accent">✓</span>
                )}
              </label>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm font-medium text-muted hover:bg-gray-50 min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
