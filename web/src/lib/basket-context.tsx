import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { createBasket } from './queries'

const BASKET_KEY = 'basketch_favoriteId'

interface BasketContextValue {
  basketId: string | null
  getOrCreate: () => Promise<string>
  setBasketId: (id: string) => void
}

const BasketContext = createContext<BasketContextValue>({
  basketId: null,
  getOrCreate: () => Promise.reject(new Error('BasketProvider not mounted')),
  setBasketId: () => {},
})

export function BasketProvider({ children }: { children: ReactNode }) {
  const [basketId, setBasketId_internal] = useState<string | null>(() => {
    try { return localStorage.getItem(BASKET_KEY) } catch { return null }
  })

  // Listen for storage changes from other tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === BASKET_KEY) {
        setBasketId_internal(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const getOrCreate = useCallback(async (): Promise<string> => {
    try {
      const existing = localStorage.getItem(BASKET_KEY)
      if (existing) {
        setBasketId_internal(existing)
        return existing
      }
    } catch { /* localStorage unavailable */ }
    const basket = await createBasket()
    try { localStorage.setItem(BASKET_KEY, basket.id) } catch { /* ignore */ }
    setBasketId_internal(basket.id)
    return basket.id
  }, [])

  const setBasketId = useCallback((id: string) => {
    try { localStorage.setItem(BASKET_KEY, id) } catch { /* ignore */ }
    setBasketId_internal(id)
  }, [])

  return (
    <BasketContext.Provider value={{ basketId, getOrCreate, setBasketId }}>
      {children}
    </BasketContext.Provider>
  )
}

export function useBasketContext() {
  return useContext(BasketContext)
}
