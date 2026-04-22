// Chip strip for format selection within a v4 DealBand.
// Values + counts come from the schema and the band's current dataset.

import { titleCase } from '../lib/deal-format'

export interface FormatChip {
  value: string
  label: string
  count: number
}

interface FormatChipsProps {
  chips: FormatChip[]
  selected: string | null
  onChange: (value: string | null) => void
}

export function FormatChips({ chips, selected, onChange }: FormatChipsProps) {
  if (chips.length === 0) return null
  return (
    <div
      className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1'
      role='tablist'
      aria-label='Format filter'
    >
      {chips.map((chip) => {
        const isActive = selected === chip.value
        return (
          <button
            key={chip.value}
            type='button'
            role='tab'
            aria-selected={isActive}
            onClick={() => onChange(isActive ? null : chip.value)}
            className={`shrink-0 min-h-[44px] rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${
              isActive
                ? 'bg-[#1a1a1a] text-white'
                : 'border border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#1a1a1a]'
            }`}
          >
            {titleCase(chip.label)} · {chip.count}
          </button>
        )
      })}
    </div>
  )
}
