import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full rounded-md border border-border px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
