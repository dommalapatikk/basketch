'use client'

import { useEffect } from 'react'

import { useRouter } from '@/i18n/navigation'
import { useListStore, type ListItem } from '@/stores/list-store'
import { useUiStore } from '@/stores/ui-store'

type Props = {
  items: ListItem[]
  to?: string
}

// Client island used by /[locale]/list to take a server-resolved list of items
// (looked up from the URL `?items=` ids in this week's snapshot) and seed the
// Zustand store before navigating onward. Opens the drawer immediately so the
// recipient sees what's been shared.
export function HydrateAndRedirect({ items, to = '/deals' }: Props) {
  const replaceAll = useListStore((s) => s.replaceAll)
  const setOpen = useUiStore((s) => s.setListDrawerOpen)
  const router = useRouter()

  useEffect(() => {
    replaceAll(items)
    setOpen(true)
    router.replace(to as never)
  }, [items, replaceAll, setOpen, router, to])

  return null
}
