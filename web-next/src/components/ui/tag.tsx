import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Spec §6.1, §6.7: positive tag for "Cheapest" / savings; neutral for compatibility notes.
// Never warning-yellow for compatibility, never red for any savings.
const tagVariants = cva(
  'inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] rounded-[var(--radius-pill)]',
  {
    variants: {
      tone: {
        positive: 'bg-positive-bg text-[var(--color-positive)]',
        neutral: 'bg-[var(--color-page)] text-[var(--color-ink-3)]',
        signal:
          'bg-[color-mix(in_oklab,var(--color-signal)_12%,var(--color-paper))] text-[var(--color-signal)]',
        warning:
          'bg-[color-mix(in_oklab,var(--color-warning)_14%,var(--color-paper))] text-[var(--color-warning)]',
      },
      size: {
        sm: 'h-5 px-2 text-[10px]',
        md: 'h-6 px-2.5 text-[11px]',
      },
    },
    defaultVariants: { tone: 'positive', size: 'sm' },
  },
)

export type TagProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof tagVariants> & { children: ReactNode; icon?: ReactNode }

export function Tag({ className, tone, size, icon, children, ...props }: TagProps) {
  return (
    <span className={cn(tagVariants({ tone, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}
