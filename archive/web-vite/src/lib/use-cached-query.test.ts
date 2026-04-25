// Tests for useCachedQuery hook.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useCachedQuery } from './use-cached-query'

// Mock localStorage
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]) }),
  get length() { return Object.keys(store).length },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })
  localStorageMock.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCachedQuery', () => {
  it('returns loading state initially on cache miss', async () => {
    const fetcher = vi.fn(() => Promise.resolve(['item1', 'item2']))

    const { result } = renderHook(() =>
      useCachedQuery('test-key', fetcher),
    )

    // Initially loading
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(['item1', 'item2'])
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('returns cached data immediately on cache hit', async () => {
    const cacheKey = 'bsk:cached-key'
    const cachedData = { data: ['cached'], timestamp: Date.now() }
    store[cacheKey] = JSON.stringify(cachedData)

    const fetcher = vi.fn(() => Promise.resolve(['fresh']))

    const { result } = renderHook(() =>
      useCachedQuery('cached-key', fetcher),
    )

    // Should have cached data immediately, no loading
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toEqual(['cached'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('treats stale cache as miss and fetches fresh data', async () => {
    const cacheKey = 'bsk:stale-key'
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const cachedData = { data: ['old'], timestamp: twoHoursAgo }
    store[cacheKey] = JSON.stringify(cachedData)

    const fetcher = vi.fn(() => Promise.resolve(['fresh']))

    const { result } = renderHook(() =>
      useCachedQuery('stale-key', fetcher, 60),
    )

    // Stale data should trigger fetch
    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(['fresh'])
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('sets error on fetch failure', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('Network error')))

    const { result } = renderHook(() =>
      useCachedQuery('error-key', fetcher),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Network error')
  })

  it('refetch triggers a new fetch', async () => {
    let callCount = 0
    const fetcher = vi.fn(() => {
      callCount++
      return Promise.resolve(`result-${callCount}`)
    })

    const { result } = renderHook(() =>
      useCachedQuery('refetch-key', fetcher),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBe('result-1')

    // Trigger refetch
    act(() => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.data).toBe('result-2')
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('stores fetched data in localStorage', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ count: 42 }))

    const { result } = renderHook(() =>
      useCachedQuery('store-key', fetcher),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'bsk:store-key',
      expect.stringContaining('"count":42'),
    )
  })

  it('handles corrupted localStorage gracefully', async () => {
    store['bsk:corrupt-key'] = 'not-valid-json{{'
    const fetcher = vi.fn(() => Promise.resolve('recovered'))

    const { result } = renderHook(() =>
      useCachedQuery('corrupt-key', fetcher),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBe('recovered')
  })
})
