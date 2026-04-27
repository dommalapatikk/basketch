import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

export function MethodologyStrip() {
  const t = useTranslations('methodology')
  const tHidden = useTranslations('hidden_suggestions')
  const steps = [
    { n: '01', t: t('step1_t'), d: t('step1_d') },
    { n: '02', t: t('step2_t'), d: t('step2_d') },
    { n: '03', t: t('step3_t'), d: t('step3_d') },
  ]

  return (
    <section aria-labelledby="how-it-works" className="mt-20">
      <h2
        id="how-it-works"
        className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-ink-3)]"
      >
        {t('title')}
      </h2>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <li
            key={s.n}
            className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-paper)] px-5 py-5"
          >
            <p className="font-mono text-xs tabular-nums text-[var(--color-ink-3)]">{s.n}</p>
            <p className="mt-2 text-base font-semibold text-[var(--color-ink)]">{s.t}</p>
            <p className="mt-1 text-sm text-[var(--color-ink-2)]">{s.d}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-[var(--color-ink-3)]">
        <Link href="/settings/hidden" className="underline-offset-4 hover:underline">
          {tHidden('page_title')}
        </Link>
      </p>
    </section>
  )
}
