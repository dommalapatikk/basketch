// Region (canton) selector. Replaces the static "📍 Switzerland ▾" chip.
// Hides stores that don't operate in the selected canton.

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'

import type { Canton } from '@shared/regions'
import { CANTONS } from '@shared/regions'

export interface RegionSelectProps {
  value: Canton | 'all'
  onChange: (next: Canton | 'all') => void
}

export function RegionSelect({ value, onChange }: RegionSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const label = value === 'all'
    ? 'Ganze Schweiz'
    : CANTONS.find((c) => c.code === value)?.label ?? value

  return (
    <div ref={rootRef} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((x) => !x)}
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label={`Region: ${label}`}
        className='flex min-h-[44px] items-center gap-1.5 rounded-[999px] border border-[#e5e5e5] bg-white px-3 py-1 text-[12px] font-semibold text-[#1a1a1a] hover:border-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2'
      >
        <MapPin className='size-3.5' strokeWidth={1.75} aria-hidden='true' />
        {label}
        <span className='text-[10px] text-[#666]' aria-hidden='true'>▾</span>
      </button>

      {open && (
        <ul
          role='listbox'
          aria-label='Select a canton'
          className='absolute right-0 z-40 mt-1 max-h-[60vh] w-56 overflow-y-auto rounded-[10px] border border-[#e5e5e5] bg-white py-1 shadow-lg'
        >
          <li>
            <button
              type='button'
              role='option'
              aria-selected={value === 'all'}
              onClick={() => { onChange('all'); setOpen(false) }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#f4f5f7] ${value === 'all' ? 'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a]' : 'text-[#1a1a1a]'}`}
            >
              Ganze Schweiz
            </button>
          </li>
          <li className='my-1 border-t border-[#e5e5e5]' aria-hidden='true' />
          {CANTONS.map((c) => (
            <li key={c.code}>
              <button
                type='button'
                role='option'
                aria-selected={value === c.code}
                onClick={() => { onChange(c.code); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#f4f5f7] ${value === c.code ? 'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a]' : 'text-[#1a1a1a]'}`}
              >
                <span>{c.label}</span>
                <span className='text-[10px] text-inherit opacity-60'>{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
