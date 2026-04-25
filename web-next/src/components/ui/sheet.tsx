'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Desktop side sheet built on Radix Dialog. Mobile uses Drawer (vaul) instead.
// Spec §6.6: focus trap, returns focus to trigger, Escape to close, aria-labelledby.

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({
  className,
  side = 'right',
  children,
  title,
  description,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right'
  title: string
  description?: string
  children: ReactNode
}) {
  const sideClass =
    side === 'right'
      ? 'right-0 border-l data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
      : 'left-0 border-r data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(11,11,15,0.45)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        aria-describedby={description ? undefined : undefined}
        className={cn(
          'fixed top-0 z-50 flex h-full w-[420px] max-w-[90vw] flex-col bg-[var(--color-paper)] shadow-[var(--shadow-md)] border-[var(--color-line)]',
          sideClass,
          className,
        )}
        {...props}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4">
          <DialogPrimitive.Title className="text-base font-semibold text-[var(--color-ink)]">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close"
            className="rounded-full p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-page)]"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </DialogPrimitive.Close>
        </header>
        {description && (
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
