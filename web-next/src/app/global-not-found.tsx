// Global 404 — handled at the routing level for any URL that matches no
// route at all (Next skips rendering the app entirely). Fixes the
// 404-shows-500 defect: docs/rca/2026-09-25-tech-lead-404-shows-500.md
// § "Final plan" step 6.
//
// Per the Next docs (node_modules/next/dist/docs/.../not-found.md), this
// file bypasses normal rendering, so it imports its own global styles and
// fonts and must return a full <html>/<body> document — there is no shared
// layout to inherit one from, since the app's root layout is defined by a
// top-level dynamic segment ([locale]), which is the documented reason to
// use global-not-found instead of a [...rest] catch-all page.
//
// Stays fully static (D1 / architect cross-review amendment A1): no
// headers(), cookies() or connection(). Both locale blocks render on the
// server from the SAME messages/{de,en}.json errors.* keys the localized
// [locale]/not-found.tsx already uses — one source of truth, no copy drift
// — and NotFoundLocale (a client island) picks the visible one from the URL.
//
// PM decision P-11 (docs/rca/2026-09-25-tech-lead-404-shows-500.md
// "Designer decision: 404 buttons"): a simple page — a basketch brand bar,
// the title, and two localized buttons. No full Header/Footer: those need
// NextIntlClientProvider and the list store, neither of which exists here.
import './globals.css'

import { GeistMono } from 'geist/font/mono'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { NotFoundLocale } from './NotFoundLocale'

import { BasketchMark } from '@/components/BasketchMark'
import { buttonVariants } from '@/components/ui/button'

import deMessages from '../messages/de.json'
import enMessages from '../messages/en.json'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'basketch — 404',
  description: 'Seite nicht gefunden — Page not found',
}

type BlockCopy = {
  lang: 'de' | 'en'
  title: string
  body: string
  browseDeals: string
  backToHome: string
  dealsHref: string
  homeHref: string
}

// Hrefs are locale-prefixed by hand (not next-intl's <Link>, which needs a
// request-scoped locale this static page doesn't have) — 'as-needed' means
// German stays unprefixed and English is the only prefixed locale.
const BLOCKS: readonly BlockCopy[] = [
  {
    lang: 'de',
    title: deMessages.errors.not_found_title,
    body: deMessages.errors.not_found_body,
    browseDeals: deMessages.errors.browse_deals,
    backToHome: deMessages.errors.back_to_home,
    dealsHref: '/deals',
    homeHref: '/',
  },
  {
    lang: 'en',
    title: enMessages.errors.not_found_title,
    body: enMessages.errors.not_found_body,
    browseDeals: enMessages.errors.browse_deals,
    backToHome: enMessages.errors.back_to_home,
    dealsHref: '/en/deals',
    homeHref: '/en',
  },
]

export default function GlobalNotFound() {
  return (
    <html lang="de" suppressHydrationWarning className={`${inter.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
        <NotFoundLocale />
        {/* German is the visible block until the client island resolves the
            real locale from the URL — see NotFoundLocale for the accepted
            flash / no-JS cost. */}
        <style>{`
          [data-locale-block] { display: none }
          html:not([data-locale='en']) [data-locale-block='de'] { display: block }
          html[data-locale='en'] [data-locale-block='en'] { display: block }
        `}</style>
        {BLOCKS.map((block) => (
          <div key={block.lang} data-locale-block={block.lang} lang={block.lang}>
            <BrandBar homeHref={block.homeHref} />
            <section className="mx-auto flex max-w-[640px] flex-col items-start gap-4 px-4 py-24 md:px-10">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
                404
              </p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{block.title}</h1>
              <p className="max-w-[44ch] text-base leading-7 text-[var(--color-ink-2)]">
                {block.body}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <a href={block.dealsHref} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                  {block.browseDeals}
                </a>
                <a href={block.homeHref} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                  {block.backToHome}
                </a>
              </div>
            </section>
          </div>
        ))}
      </body>
    </html>
  )
}

// Minimal brand bar (PM decision P-11) — a logo linking home, nothing else.
// Not the site's real <Header>: that component needs NextIntlClientProvider
// and the list store, neither available on this fully static page.
function BrandBar({ homeHref }: { homeHref: string }) {
  return (
    <header className="border-b border-[var(--color-line)]">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center px-4 md:px-10">
        <a
          href={homeHref}
          aria-label="basketch — home"
          className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--color-ink)]"
        >
          <BasketchMark size={26} />
          basketch
        </a>
      </div>
    </header>
  )
}
