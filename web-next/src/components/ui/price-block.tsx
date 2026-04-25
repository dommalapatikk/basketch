import { cn } from '@/lib/utils'

import { Tag } from './tag'

export type PriceBlockProps = {
  current: number
  previous?: number | null
  perUnit?: string | null
  savingsPct?: number | null
  size?: 'sm' | 'md' | 'lg'
  locale?: string
  className?: string
}

const formatCHF = (value: number, locale = 'de-CH') =>
  new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

// Spec §6.7: tabular numerals; current price is the hero; previous strikethrough in ink-3;
// per-unit always rendered when available; savings = positive Tag (never red).
export function PriceBlock({
  current,
  previous,
  perUnit,
  savingsPct,
  size = 'md',
  locale = 'de-CH',
  className,
}: PriceBlockProps) {
  const currentSize = size === 'lg' ? 'text-[28px] leading-8' : size === 'sm' ? 'text-base leading-5' : 'text-2xl leading-7'
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--color-ink-3)]">CHF</span>
        <span
          className={cn(
            'font-mono font-semibold tabular-nums text-[var(--color-ink)]',
            currentSize,
          )}
        >
          {formatCHF(current, locale)}
        </span>
        {savingsPct != null && savingsPct > 0 && (
          <Tag tone="positive">−{Math.round(savingsPct)}%</Tag>
        )}
      </div>
      {previous != null && previous > current && (
        <div className="font-mono text-[13px] tabular-nums text-[var(--color-ink-3)] line-through">
          CHF {formatCHF(previous, locale)}
        </div>
      )}
      {perUnit && (
        <div className="text-[13px] text-[var(--color-ink-3)]">{perUnit}</div>
      )}
    </div>
  )
}
