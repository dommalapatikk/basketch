import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { Button } from '@/components/ui/button'

export default function LocaleNotFound() {
  const t = useTranslations('errors')
  return (
    <section className="mx-auto flex max-w-[640px] flex-col items-start gap-4 px-4 py-24 md:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]">404</p>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('not_found_title')}</h1>
      <p className="max-w-[44ch] text-base leading-7 text-[var(--color-ink-2)]">{t('not_found_body')}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link href="/deals">
          <Button variant="primary" size="lg">
            {t('browse_deals')}
          </Button>
        </Link>
        <Link href="/">
          <Button variant="secondary" size="lg">
            {t('back_to_home')}
          </Button>
        </Link>
      </div>
    </section>
  )
}
