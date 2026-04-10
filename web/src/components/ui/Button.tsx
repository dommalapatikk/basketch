import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-semibold transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white hover:opacity-90',
        outline: 'bg-transparent border border-border text-current hover:opacity-90',
        migros: 'bg-migros text-white hover:opacity-90',
        coop: 'bg-coop text-white hover:opacity-90',
        ghost: 'bg-transparent text-muted hover:text-current',
      },
      size: {
        default: 'px-5 py-2.5',
        sm: 'px-4 py-2 text-xs',
      },
      fullWidth: {
        true: 'flex w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth, className }))}
      ref={ref}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { buttonVariants }
