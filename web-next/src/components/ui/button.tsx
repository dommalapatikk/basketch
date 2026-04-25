import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--color-signal)] text-white hover:bg-[var(--color-signal-ink)]',
        secondary:
          'bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-page)]',
        ghost: 'bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-page)]',
        link: 'bg-transparent text-[var(--color-signal)] underline underline-offset-4 hover:text-[var(--color-signal-ink)] px-0',
      },
      size: {
        sm: 'h-9 px-3 text-sm min-h-[36px]',
        md: 'h-11 px-5 text-[15px] min-h-[44px]',
        lg: 'h-12 px-6 text-base min-h-[48px]',
        icon: 'h-11 w-11 p-0 min-h-[44px] min-w-[44px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { children: ReactNode }

export function Button({ className, variant, size, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  )
}

export { buttonVariants }
