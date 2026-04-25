'use client'

import { Drawer as Vaul } from 'vaul'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Mobile drawer built on vaul. Desktop uses Sheet (Radix) instead.
// Spec §3.5: enter translate 16px + fade-in; respects reduced motion via vaul's defaults.

export const Drawer = Vaul.Root
export const DrawerTrigger = Vaul.Trigger
export const DrawerClose = Vaul.Close

export function DrawerContent({
  className,
  children,
  title,
  description,
  ...props
}: ComponentProps<typeof Vaul.Content> & {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Vaul.Portal>
      <Vaul.Overlay className="fixed inset-0 z-40 bg-[rgba(11,11,15,0.45)]" />
      <Vaul.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-paper)] shadow-[var(--shadow-md)]',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-[var(--color-line-strong)]"
        />
        <Vaul.Title className="px-5 pt-3 pb-1 text-base font-semibold text-[var(--color-ink)]">
          {title}
        </Vaul.Title>
        {description && (
          <Vaul.Description className="sr-only">{description}</Vaul.Description>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </Vaul.Content>
    </Vaul.Portal>
  )
}
