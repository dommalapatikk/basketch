// Application hooks. Uses useCachedQuery (ADR-005) instead of React Query.

import { useEffect, useMemo } from 'react'

import { useCachedQuery } from './use-cached-query'
import { buildDealComparisons } from './matching'
import {
  fetchActiveDeals,
  fetchAllProductGroups,
  fetchBasketItems,
  fetchFavoriteItems,
  fetchProductsWithGroups,
  fetchStarterPacks,
} from './queries'

const BASE_TITLE = 'basketch'

export function usePageTitle(subtitle?: string) {
  useEffect(() => {
    document.title = subtitle ? `${subtitle} | ${BASE_TITLE}` : `${BASE_TITLE} — Migros or Coop this week?`
    return () => { document.title = `${BASE_TITLE} — Migros or Coop this week?` }
  }, [subtitle])
}

export function useActiveDeals() {
  return useCachedQuery(
    'deals:active',
    () => fetchActiveDeals(),
  )
}

export function useBasketItems(basketId: string | undefined) {
  return useCachedQuery(
    `basket:${basketId ?? 'none'}:items`,
    () => {
      if (!basketId) return Promise.resolve([])
      return fetchBasketItems(basketId)
    },
  )
}

/** @deprecated Use useBasketItems */
export function useFavoriteItems(favoriteId: string | undefined) {
  return useCachedQuery(
    `favorites:${favoriteId ?? 'none'}:items`,
    () => {
      if (!favoriteId) return Promise.resolve([])
      return fetchFavoriteItems(favoriteId)
    },
  )
}

export function useStarterPacks() {
  return useCachedQuery(
    'starter-packs',
    fetchStarterPacks,
  )
}

export function useProductsWithGroups() {
  return useCachedQuery(
    'products:with-groups',
    fetchProductsWithGroups,
  )
}

export function useProductGroups() {
  return useCachedQuery(
    'product-groups',
    fetchAllProductGroups,
    30, // 30 min — groups rarely change
  )
}

export function useDealComparisons() {
  const { data: deals, loading: dealsLoading, error: dealsError } = useActiveDeals()
  const { data: products, loading: productsLoading, error: productsError } = useProductsWithGroups()
  const { data: productGroups, loading: groupsLoading, error: groupsError } = useProductGroups()

  const comparisons = useMemo(() => {
    if (!deals || !products || !productGroups) return null
    return buildDealComparisons(deals, products, productGroups)
  }, [deals, products, productGroups])

  return {
    data: comparisons,
    deals,
    loading: dealsLoading || productsLoading || groupsLoading,
    error: dealsError || productsError || groupsError,
  }
}
