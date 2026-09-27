'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Localized error boundary for the [locale] segment (RCA final plan step 9,
 * docs/rca/2026-09-25-tech-lead-404-shows-500.md). NOT a fix for the
 * 404-shows-500 defect — recorded here so the expectation isn't
 * over-claimed later:
 *
 * - It would NOT have caught that bug. The error was thrown while rendering
 *   the streaming `<head>` inside `Next.Metadata`'s `MetadataBoundary`,
 *   which sits above every segment's own error boundary (RCA §3 step 5;
 *   architect cross-review § 2.6).
 * - It does NOT catch an error thrown by `[locale]/layout.tsx` itself, or by
 *   `Header`/`Footer` (both rendered by that layout). Per the Next docs
 *   (`error.md`): "error.js ... does not wrap the layout.js ... above it in
 *   the same segment." Those still escape to `global-error.tsx`.
 *
 * What it DOES do: keep the header, footer and locale for an ORDINARY
 * page-level error, instead of falling all the way to the unstyled,
 * English-only global-error. Deliberately has no test-only throwing route —
 * that would ship a footgun to production. Covered instead by a component
 * test that renders this file directly with a real thrown Error.
 */
export default function LocaleError({ error, reset }: Props) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="mx-auto flex max-w-[640px] flex-col items-start gap-4 px-4 py-24 md:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">500</p>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
        {t('server_error_title')}
      </h1>
      <p className="max-w-[44ch] text-base leading-7 text-[var(--color-ink-2)]">
        {t('server_error_body')}
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-[var(--color-ink-3)]">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" onClick={reset}>
          {t('try_again')}
        </Button>
        <Link href="/">
          <Button variant="secondary" size="lg">
            {t('back_to_home')}
          </Button>
        </Link>
      </div>
    </section>
  )
}
