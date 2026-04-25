import { notFound } from 'next/navigation'

// Catch-all under [locale] so unmatched URLs like /en/asdf render the
// localized not-found.tsx (with header/footer + correct copy) instead of
// falling through to the root app/not-found.tsx which is locale-agnostic.
// Next 16 routes unmatched URLs to root app/not-found.js by default —
// see node_modules/next/dist/docs/01-app/.../not-found.md line 131.
export default function CatchAll() {
  notFound()
}
