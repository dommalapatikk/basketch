import { useQuery } from '@tanstack/react-query'

import { fetchActiveDeals, fetchFavoriteItems, fetchStarterPacks } from './queries'

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
