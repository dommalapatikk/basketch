import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface ToastContextValue {
  show: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const show = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 2500)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}
