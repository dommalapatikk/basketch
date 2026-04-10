import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchActiveDeals, fetchFavoriteItems, fetchProductsWithGroups, fetchStarterPacks } from './queries'

const BASE_TITLE = 'basketch'

export function usePageTitle(subtitle?: string) {
  useEffect(() => {
    document.title = subtitle ? `${subtitle} | ${BASE_TITLE}` : `${BASE_TITLE} — Migros or Coop this week?`
    return () => { document.title = `${BASE_TITLE} — Migros or Coop this week?` }
  }, [subtitle])
}

export function useActiveDeals() {
  return useQuery({
    queryKey: ['deals', 'active'],
    queryFn: () => fetchActiveDeals(),
  })
}

export function useFavoriteItems(favoriteId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', favoriteId, 'items'],
    queryFn: () => fetchFavoriteItems(favoriteId!),
    enabled: !!favoriteId,
  })
}

export function useStarterPacks() {
  return useQuery({
    queryKey: ['starter-packs'],
    queryFn: fetchStarterPacks,
  })
}

export function useProductsWithGroups() {
  return useQuery({
    queryKey: ['products', 'with-groups'],
    queryFn: fetchProductsWithGroups,
  })
}
