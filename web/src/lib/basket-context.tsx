import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { createBasket } from './queries'

const BASKET_KEY = 'basketch_favoriteId'

interface BasketContextValue {
  basketId: string | null
  getOrCreate: () => Promise<string>
}

const BasketContext = createContext<BasketContextValue>({
  basketId: null,
  getOrCreate: () => Promise.reject(new Error('BasketProvider not mounted')),
})

export function BasketProvider({ children }: { children: ReactNode }) {
  const [basketId, setBasketId] = useState<string | null>(() => {
    try { return localStorage.getItem(BASKET_KEY) } catch { return null }
  })

  // Listen for storage changes from other tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === BASKET_KEY) {
        setBasketId(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const getOrCreate = useCallback(async (): Promise<string> => {
    try {
      const existing = localStorage.getItem(BASKET_KEY)
      if (existing) {
        setBasketId(existing)
        return existing
      }
    } catch { /* localStorage unavailable */ }
    const basket = await createBasket()
    try { localStorage.setItem(BASKET_KEY, basket.id) } catch { /* ignore */ }
    setBasketId(basket.id)
    return basket.id
  }, [])

  return (
    <BasketContext.Provider value={{ basketId, getOrCreate }}>
      {children}
    </BasketContext.Provider>
  )
}

export function useBasketContext() {
  return useContext(BasketContext)
}
