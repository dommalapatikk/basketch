'use client'

import { ShoppingBag } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useListCount } from '@/stores/list-store'
import { useUiStore } from '@/stores/ui-store'

type Variant = 'header' | 'bottombar'

type Props = {
  variant?: Variant
}

// Generic open-the-list-drawer trigger. Used both in the desktop header and
// the mobile bottom bar — same store subscription so the count stays in sync.
export function MyListButton({ variant = 'header' }: Props) {
  const t = useTranslations('list')
  const count = useListCount()
  const open = useUiStore((s) => s.setListDrawerOpen)

  if (variant === 'bottombar') {
    return (
      <button
        type="button"
        onClick={() => open(true)}
        className="flex h-full w-full items-center justify-center gap-2 text-sm font-medium text-[var(--color-ink)]"
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {t('title')} <span className="font-mono tabular-nums">· {count}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => open(true)}
      className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-page)]"
    >
      <ShoppingBag className="h-4 w-4" aria-hidden /> {t('title')}{' '}
      <span className="font-mono tabular-nums text-[var(--color-ink-3)]">{count}</span>
    </button>
  )
}
