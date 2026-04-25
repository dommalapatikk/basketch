import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-md border border-border bg-surface p-4 shadow-sm',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'
