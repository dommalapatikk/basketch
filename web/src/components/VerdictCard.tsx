import { useRef, useState } from 'react'

import type { WeeklyVerdict } from '@shared/types'
import { Button } from './ui/Button'

function categoryLabel(cat: string): string {
  if (cat === 'fresh') return 'Fresh'
  if (cat === 'long-life') return 'Long-life'
  return 'Household'
}

function buildAriaLabel(verdict: WeeklyVerdict): string {
  const parts = verdict.categories.map((c) => {
    const cat = categoryLabel(c.category)
    if (c.winner === 'tie') {
      return `Tied on ${cat} with ${c.migrosDeals} deals each`
    }
    const winner = c.winner === 'migros' ? 'Migros' : 'Coop'
    const deals = c.winner === 'migros' ? c.migrosDeals : c.coopDeals
    const avg = c.winner === 'migros' ? c.migrosAvgDiscount : c.coopAvgDiscount
    return `${winner} leads ${cat} with ${deals} deals averaging ${avg}% off`
  })
  return `This week's verdict: ${parts.join('. ')}.`
}

export interface VerdictCardProps {
  verdict: WeeklyVerdict
}

export function VerdictCard(props: VerdictCardProps) {
  const { verdict } = props
  const cardRef = useRef<HTMLDivElement>(null)
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<'idle' | 'success' | 'downloading'>('idle')

  const weekDate = new Date(verdict.weekOf).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function handleCopyCard() {
    if (!cardRef.current || copying) return
    setCopying(true)

    try {
      // Lazy-load html2canvas — never in the main bundle
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1a1a2e',
        scale: 2,
        useCORS: true,
      })

      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) {
          setCopying(false)
          return
        }

        try {
          // Try clipboard write
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ])
          setCopyResult('success')
        } catch {
          // Fallback: download as PNG
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'basketch-verdict.png'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          setCopyResult('downloading')
        }

        setCopying(false)
        setTimeout(() => setCopyResult('idle'), 2000)
      }, 'image/png')
    } catch {
      setCopying(false)
    }
  }

  const buttonLabel = copying
    ? 'Copying...'
    : copyResult === 'success'
      ? 'Card copied!'
      : copyResult === 'downloading'
        ? 'Card saved!'
        : 'Copy verdict card'

  return (
    <div>
      <div
        ref={cardRef}
        role="img"
        aria-label={buildAriaLabel(verdict)}
        className="mx-auto w-[360px] max-w-full rounded-2xl border border-card-border bg-card-bg p-6"
      >
        {/* Header */}
        <div className="mb-5">
          <div className="text-xl font-bold text-card-text">basketch</div>
          <div className="mt-1 text-[15px] text-card-text-muted">This Week's Verdict</div>
          <div className="text-[15px] text-card-text-muted">Week of {weekDate}</div>
        </div>

        {/* Category rows */}
        <div className="space-y-3">
          {verdict.categories.map((cat) => {
            const catName = categoryLabel(cat.category)
            let barColor = '#6B7280' // tie/gray
            let winnerLine = `Tied on ${catName}`
            let statsLine = `${cat.migrosDeals} deals each`

            if (cat.migrosScore === 0 && cat.coopScore === 0) {
              winnerLine = `Not enough data for ${catName}`
              statsLine = 'Fewer than 3 deals'
            } else if (cat.winner === 'migros') {
              barColor = '#e65100'
              winnerLine = `MIGROS leads ${catName}`
              statsLine = `${cat.migrosDeals} deals  |  avg ${cat.migrosAvgDiscount}% off`
            } else if (cat.winner === 'coop') {
              barColor = '#007a3d'
              winnerLine = `COOP leads ${catName}`
              statsLine = `${cat.coopDeals} deals  |  avg ${cat.coopAvgDiscount}% off`
            }

            return (
              <div
                key={cat.category}
                className="flex overflow-hidden rounded-lg bg-card-row-bg"
              >
                <div
                  className="w-1.5 shrink-0"
                  style={{ backgroundColor: barColor }}
                />
                <div className="p-4">
                  <div className="text-lg font-bold text-card-text">{winnerLine}</div>
                  <div className="mt-0.5 text-[15px] text-[#d1d5db]">{statsLine}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Stale data warning */}
        {verdict.dataFreshness === 'stale' && (
          <div className="mt-4 text-xs text-warning">
            Deals may be outdated — last updated{' '}
            {new Date(verdict.lastUpdated).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-card-border pt-4">
          <div className="text-[15px] font-bold text-card-text">basketch.ch</div>
          <div className="text-[13px] text-card-text-muted">
            Your weekly promotions, compared.
          </div>
        </div>
      </div>

      {/* Copy button — outside the card for html2canvas */}
      <div className="mt-3 text-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyCard}
          disabled={copying}
          type="button"
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}
