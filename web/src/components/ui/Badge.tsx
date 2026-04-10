import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-block rounded-full px-2.5 py-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        migros: 'bg-migros-light text-migros-text',
        coop: 'bg-coop-light text-coop',
        both: 'bg-success-light text-success',
        none: 'bg-gray-100 text-muted',
        accent: 'bg-accent text-white text-[0.65rem] uppercase tracking-wide',
      },
    },
    defaultVariants: {
      variant: 'none',
    },
  },
)

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}
