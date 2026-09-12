'use client'

import { useEffect, useState } from 'react'

/**
 * `window.location.origin` once the component has hydrated, `''` before that.
 *
 * A client component still runs through the server prerender pass, where there
 * is no `window`. Reading it during render would crash the prerender; reading
 * it during render only on the client would produce a hydration mismatch,
 * because the server and client first passes must agree.
 *
 * So the first client render deliberately agrees with the server — origin
 * unknown — and the effect fills it in immediately afterwards. Share controls
 * render as disabled buttons for that one frame and become real links with
 * real hrefs once this resolves. That is the honest sequence: for the moment
 * we genuinely do not know the destination, we do not render something that
 * claims to be a link.
 */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  return origin
}
