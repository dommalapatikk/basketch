// VerdictPage at /v/:weekOf — permalink target for WhatsApp verdict shares.
// Recomputes the verdict from deals active during the requested week,
// regardless of is_active, so historical links keep working.

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { DealRow } from '@shared/types'
import { STORE_META } from '@shared/types'

import { usePageTitle } from '../lib/hooks'
import { useCachedQuery } from '../lib/use-cached-query'
import { fetchDealsForWeek } from '../lib/queries'
import { calculateVerdict } from '../lib/verdict'
import { verdictShareText, verdictWhatsAppUrl } from '../lib/verdict-share'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { VerdictBanner } from '../components/VerdictBanner'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidWeekOf(value: string): boolean {
  return ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value))
}

export function VerdictPage() {
  const { weekOf = '' } = useParams()
  usePageTitle(`basketch verdict — week of ${weekOf || 'unknown'}`)

  const validWeek = isValidWeekOf(weekOf)

  const { data: deals, loading, error } = useCachedQuery<DealRow[]>(
    `deals:week:${weekOf}`,
    () => validWeek ? fetchDealsForWeek(weekOf) : Promise.resolve([]),
    60 * 24, // stale 24h — historical weeks don't change
  )

  const verdict = useMemo(() => {
    if (!deals || deals.length === 0) return null
    const v = calculateVerdict(deals)
    // Honour the URL's weekOf on historical permalinks rather than today's date.
    return { ...v, weekOf }
  }, [deals, weekOf])

  if (!validWeek) {
    return (
      <div className='mx-auto max-w-2xl px-4 py-12'>
        <h1 className='mb-2 text-[22px] font-bold'>Verdict link not found</h1>
        <p className='mb-4 text-[14px] text-[#666]'>
          The week identifier in this link isn&rsquo;t a valid date.
        </p>
        <Link to='/deals' className='text-[#2563eb] hover:underline'>
          → Go to this week&rsquo;s deals
        </Link>
      </div>
    )
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error.message} />

  if (!verdict) {
    return (
      <div className='mx-auto max-w-2xl px-4 py-12'>
        <h1 className='mb-2 text-[22px] font-bold'>No deals for this week</h1>
        <p className='mb-4 text-[14px] text-[#666]'>
          We don&rsquo;t have promotional data for week of {weekOf}. The verdict for this week can&rsquo;t be reconstructed.
        </p>
        <Link to='/deals' className='text-[#2563eb] hover:underline'>
          → Go to this week&rsquo;s deals
        </Link>
      </div>
    )
  }

  const storesInDeals = new Set(deals!.map((d) => d.store))

  return (
    <div className='mx-auto max-w-3xl px-4 py-6'>
      <nav className='mb-3 text-[12px] text-[#666]'>
        <Link to='/deals' className='hover:underline'>
          ← This week&rsquo;s deals
        </Link>
      </nav>

      <header className='mb-4'>
        <p className='text-[11px] font-semibold uppercase tracking-wider text-[#8a8f98]'>
          basketch verdict
        </p>
        <h1 className='mt-1 text-[22px] font-bold'>Week of {weekOf}</h1>
        <p className='mt-1 text-[13px] text-[#666]'>
          {deals!.length} deals across {storesInDeals.size} stores
        </p>
      </header>

      <VerdictBanner verdict={verdict} />

      {/* Secondary share block — explicit permalink */}
      <div className='mt-6 rounded-[10px] border border-[#e5e5e5] bg-white p-4'>
        <p className='mb-2 text-[12px] font-semibold text-[#1a1a1a]'>Share this verdict</p>
        <pre className='mb-3 whitespace-pre-wrap rounded-[6px] bg-[#f4f5f7] p-2 text-[12px] text-[#333]'>
          {verdictShareText(verdict)}
        </pre>
        <a
          href={verdictWhatsAppUrl(verdict)}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white'
        >
          Send to WhatsApp
        </a>
      </div>

      {/* Breakdown */}
      <section className='mt-6 rounded-[10px] border border-[#e5e5e5] bg-white p-4'>
        <h2 className='mb-2 text-[14px] font-bold'>Per-category breakdown</h2>
        <ul className='space-y-2 text-[13px] text-[#1a1a1a]'>
          {verdict.categories.map((cat) => (
            <li key={cat.category}>
              <strong className='uppercase tracking-wide text-[#8a8f98]'>
                {cat.category}
              </strong>{' '}
              —{' '}
              {cat.winner === 'tie'
                ? 'Tie'
                : cat.winner != null
                  ? <span style={{ color: STORE_META[cat.winner].hexText }}>
                      {STORE_META[cat.winner].label} wins
                    </span>
                  : '—'}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
