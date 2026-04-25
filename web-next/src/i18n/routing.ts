import { defineRouting } from 'next-intl/routing'

// FR + IT translations are deferred until post-launch — adding them back is a
// matter of (1) dropping fr.json/it.json into src/messages and (2) re-adding
// the locale codes to this list. See docs/adr-M0-decisions.md (M3 deferrals).
export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'as-needed',
})
