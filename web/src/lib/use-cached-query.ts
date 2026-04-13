// Custom caching hook replacing React Query (ADR-005).
// localStorage cache with 1-hour stale time.

import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_STALE_MINUTES = 60

interface CacheEntry<T> {
  data: T
  timestamp: number
}

function getCached<T>(key: string, staleMinutes: number): T | null {
  try {
    const raw = localStorage.getItem(`bsk:${key}`)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const age = Date.now() - entry.timestamp
    if (age > staleMinutes * 60 * 1000) return null
    return entry.data
  } catch {
    return null
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    localStorage.setItem(`bsk:${key}`, JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export interface CachedQueryResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Fetch data with localStorage caching.
 * Returns cached data immediately if fresh (< staleMinutes old),
 * then refetches in background. On cache miss, fetches and caches.
 */
export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  staleMinutes: number = DEFAULT_STALE_MINUTES,
): CachedQueryResult<T> {
  const [data, setData] = useState<T | null>(() => getCached<T>(key, staleMinutes))
  const [loading, setLoading] = useState<boolean>(data === null)
  const [error, setError] = useState<Error | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const doFetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcherRef.current()
      .then((result) => {
        setData(result)
        setCache(key, result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        setLoading(false)
      })
  }, [key])

  useEffect(() => {
    const cached = getCached<T>(key, staleMinutes)
    if (cached !== null) {
      setData(cached)
      setLoading(false)
      return
    }
    doFetch()
  }, [key, staleMinutes, doFetch])

  return { data, loading, error, refetch: doFetch }
}
