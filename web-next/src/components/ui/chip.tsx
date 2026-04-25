import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  selected?: boolean
  count?: number
  leading?: ReactNode
}

// Generic chip primitive used by StoreChip and CategoryChip.
// Selected state = filled ink background, paper text. Never brand-colored backgrounds.
export function Chip({
  className,
  children,
  selected = false,
  count,
  leading,
  disabled,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 min-h-[36px] items-center gap-2 rounded-[var(--radius-pill)] border px-3 text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2',
        selected
          ? 'bg-[var(--color-ink)] text-[var(--color-paper)] border-[var(--color-ink)]'
          : 'bg-[var(--color-paper)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:border-[var(--color-ink-3)]',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        className,
      )}
      {...props}
    >
      {leading}
      <span>{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'tabular-nums text-[12px]',
            selected ? 'text-[var(--color-paper)]/70' : 'text-[var(--color-ink-3)]',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
