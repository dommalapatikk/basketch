import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { formatShortDate } from '@/lib/format'
import { STORE_BRAND } from '@/lib/store-tokens'
import type { CategoryVerdict, WeeklySnapshot } from '@/lib/types'

import { Button } from '@/components/ui/button'

type Props = {
  snapshot: WeeklySnapshot
  locale: string
}

export function VerdictHero({ snapshot, locale }: Props) {
  const t = useTranslations('home')
  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN
  const activeStores = snapshot.stores.filter((s) => s.dealCount > 0)
  const dateStr = formatShortDate(snapshot.updatedAt, locale)

  const sentences = snapshot.categories.map((v) => verdictSentence(v, labels, t))

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {t('kicker')} · {t('updated_prefix')} {dateStr}
      </p>

      <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight md:text-[48px] md:leading-[52px]">
        {sentences.map((s, i) => (
          <span key={`${s}-${i}`} className="block">
            {s}
          </span>
        ))}
      </h1>

      <p className="mt-6 max-w-[44ch] text-base leading-7 text-[var(--color-ink-2)]">
        {t('stat', {
          deals: snapshot.totalDeals.toLocaleString(locale),
          stores: activeStores.length,
        })}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/deals">
          <Button variant="primary" size="lg">
            {t('cta_browse')}
          </Button>
        </Link>
        <Link href="/card">
          <Button variant="secondary" size="lg">
            {t('cta_share')}
          </Button>
        </Link>
      </div>
    </div>
  )
}

function verdictSentence(
  v: CategoryVerdict,
  labels: Record<string, string>,
  t: ReturnType<typeof useTranslations<'home'>>,
): string {
  const cat = labels[v.category as keyof typeof labels] ?? String(v.category)
  if (v.state === 'winner' && v.winner) {
    return t('verdict_winner', { store: STORE_BRAND[v.winner].label, category: cat })
  }
  if (v.state === 'tied') return t('verdict_tied', { category: cat })
  if (v.state === 'single-store') return t('verdict_single_store', { category: cat })
  return t('verdict_no_data', { category: cat })
}
