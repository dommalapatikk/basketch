import type { Locale } from '@/i18n/locale-from-pathname'
import { cn } from '@/lib/utils'

export type PriceBlockProps = {
  current: number
  previous?: number | null
  perUnit?: string | null
  savingsPct?: number | null
  size?: 'sm' | 'md' | 'lg'
  locale?: Locale
  className?: string
}

// Swiss-locale Intl tag (code review 2026-09-27 SHOULD-FIX 1) — the prop is
// the app's routing Locale ('de' | 'en'), never a raw Intl tag, so a caller
// cannot pass an unvalidated string straight into Intl.NumberFormat. Mapped
// to the actual BCP-47 tag here, same pattern as ListDrawer.tsx's `fmt`.
const formatCHF = (value: number, locale: Locale = 'de') =>
  new Intl.NumberFormat(locale === 'de' ? 'de-CH' : 'en-CH', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

// v2.1 HR6: savings rendered as plain text-positive — not a chip. Strikethrough on
// previous price + the negative percentage carry the meaning. Wraps on narrow rows
// rather than overlapping (HR4/HR8).
export function PriceBlock({
  current,
  previous,
  perUnit,
  savingsPct,
  size = 'md',
  locale = 'de',
  className,
}: PriceBlockProps) {
  const currentSize =
    size === 'lg'
      ? 'text-[28px] leading-8'
      : size === 'sm'
        ? 'text-base leading-5'
        : 'text-2xl leading-7'
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--color-ink-3)]">
          CHF
        </span>
        <span
          className={cn(
            'font-mono font-semibold tabular-nums text-[var(--color-ink)]',
            currentSize,
          )}
        >
          {formatCHF(current, locale)}
        </span>
        {savingsPct != null && savingsPct > 0 && (
          <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--color-positive)]">
            −{Math.round(savingsPct)}%
          </span>
        )}
      </div>
      {previous != null && previous > current && (
        <div className="font-mono text-[13px] tabular-nums text-[var(--color-ink-3)] line-through">
          CHF {formatCHF(previous, locale)}
        </div>
      )}
      {perUnit && <div className="text-[13px] text-[var(--color-ink-3)]">{perUnit}</div>}
    </div>
  )
}
