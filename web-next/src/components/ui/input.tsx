'use client'

import { Search, X } from 'lucide-react'
import {
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  leading?: ReactNode
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, ...props },
  ref,
) {
  return (
    <div
      className={cn(
        'flex h-12 min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 transition-colors',
        'focus-within:border-[var(--color-ink-3)] focus-within:ring-2 focus-within:ring-[var(--color-focus)] focus-within:ring-offset-2',
        className,
      )}
    >
      {leading}
      <input
        ref={ref}
        className="flex-1 bg-transparent text-[15px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
        {...props}
      />
      {trailing}
    </div>
  )
})

export type SearchInputProps = Omit<InputProps, 'leading' | 'trailing'> & {
  value?: string
  onClear?: () => void
  showHint?: boolean
}

export function SearchInput({
  value,
  onClear,
  showHint = true,
  placeholder = 'Search deals…',
  onKeyDown,
  ...props
}: SearchInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && onClear) onClear()
    onKeyDown?.(e)
  }
  const showClear = !!value && !!onClear
  return (
    <Input
      {...props}
      value={value}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      leading={
        <Search aria-hidden="true" className="h-5 w-5 text-[var(--color-ink-3)]" strokeWidth={1.5} />
      }
      trailing={
        <>
          {showClear && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={onClear}
              className="rounded-full p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
          {showHint && !showClear && (
            <kbd className="hidden items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-page)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-ink-3)] md:inline-flex">
              ⌘K
            </kbd>
          )}
        </>
      }
    />
  )
}
