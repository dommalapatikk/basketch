'use client'

import { useEffect, useState } from 'react'

// Spec uses Tailwind `lg` (1024px) as the desktop breakpoint everywhere.
// Falls back to `false` on the server / first paint so we don't accidentally
// mount the desktop sheet on a phone before hydration.
const QUERY = '(min-width: 1024px)'

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    setIsDesktop(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isDesktop
}
