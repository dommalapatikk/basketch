import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { buildDealComparisons } from './matching'
import { fetchActiveDeals, fetchAllProductGroups, fetchFavoriteItems, fetchProductsWithGroups, fetchStarterPacks } from './queries'

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

export function useProductGroups() {
  return useQuery({
    queryKey: ['product-groups'],
    queryFn: fetchAllProductGroups,
    staleTime: 1000 * 60 * 30,  // 30 min — groups rarely change
  })
}

export function useDealComparisons() {
  const { data: deals, isLoading: dealsLoading, error: dealsError } = useActiveDeals()
  const { data: products, isLoading: productsLoading, error: productsError } = useProductsWithGroups()
  const { data: productGroups, isLoading: groupsLoading, error: groupsError } = useProductGroups()

  const comparisons = useMemo(() => {
    if (!deals || !products || !productGroups) return null
    return buildDealComparisons(deals, products, productGroups)
  }, [deals, products, productGroups])

  return {
    data: comparisons,
    deals,
    isLoading: dealsLoading || productsLoading || groupsLoading,
    error: dealsError || productsError || groupsError,
  }
}
