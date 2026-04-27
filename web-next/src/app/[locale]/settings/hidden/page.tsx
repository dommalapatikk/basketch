import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'

import { HiddenSuggestionsClient } from './HiddenSuggestionsClient'

// Surface 3.5 — Settings: Hidden Suggestions (per docs/design-3-new-surfaces.md §3.5).
// Route: /[locale]/settings/hidden
// Reachable from: Surface 3 toast undo expiry + Settings nav entry.

type Params = { locale: string }

export default async function HiddenSuggestionsPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('hidden_suggestions')

  // The actual list of dismissed concepts comes from a per-email lookup
  // bound at runtime in the client component (uses localStorage email key
  // matching v3.2 favorites pattern). Server renders the chrome.
  return (
    <main className="mx-auto max-w-screen-md px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-ink)]">{t('page_title')}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-2)]">{t('page_subtitle')}</p>
      </header>
      <HiddenSuggestionsClient />
    </main>
  )
}
