'use client'

import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import type { DealsFilters } from '@/lib/filters'

type Props = {
  filters: DealsFilters
  onChange: (next: DealsFilters) => void
}

// Debounced commit so each keystroke doesn't re-derive sections + counts
// against the snapshot. 250 ms feels responsive while collapsing fast-typing
// bursts into one update.
const DEBOUNCE_MS = 250

export function DealsSearch({ filters, onChange }: Props) {
  const t = useTranslations('deals')
  const [value, setValue] = useState(filters.q)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset local state when the parent filter changes from elsewhere (Reset pill etc).
  useEffect(() => {
    setValue(filters.q)
  }, [filters.q])

  function push(next: string) {
    onChange({ ...filters, q: next })
  }

  function handleChange(v: string) {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => push(v), DEBOUNCE_MS)
  }

  function clear() {
    setValue('')
    if (timer.current) clearTimeout(timer.current)
    push('')
  }

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('search_placeholder')}
        aria-label={t('search_placeholder')}
        className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] pl-9 pr-10 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
