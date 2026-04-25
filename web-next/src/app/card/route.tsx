import { ImageResponse } from 'next/og'

import { CATEGORY_LABELS_DE, CATEGORY_LABELS_EN } from '@/lib/category-rules'
import { formatShortDate } from '@/lib/format'
import { STORE_BRAND } from '@/lib/store-tokens'
import type { CategoryVerdict, DealCategory } from '@/lib/types'
import { getWeeklySnapshot } from '@/server/data/snapshot'

// Inter at two weights — fetched once per cold start, then cached in module
// scope. jsdelivr serves @fontsource/inter without requiring it as a runtime
// dependency, which keeps the bundle smaller. M7 polish — earlier the route
// fell back to system-ui which renders inconsistently across WhatsApp clients.
const FONT_INTER_REGULAR =
  'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-400-normal.woff'
const FONT_INTER_SEMIBOLD =
  'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-600-normal.woff'

let interRegularPromise: Promise<ArrayBuffer> | null = null
let interSemiboldPromise: Promise<ArrayBuffer> | null = null

async function loadFonts() {
  if (!interRegularPromise) interRegularPromise = fetch(FONT_INTER_REGULAR).then((r) => r.arrayBuffer())
  if (!interSemiboldPromise) interSemiboldPromise = fetch(FONT_INTER_SEMIBOLD).then((r) => r.arrayBuffer())
  const [regular, semibold] = await Promise.all([interRegularPromise, interSemiboldPromise])
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: semibold, weight: 600 as const, style: 'normal' as const },
  ]
}

// next/og auto-sets content-type and dimensions via the ImageResponse below.
// `runtime` and `contentType`/`size` segment exports are not allowed under
// Next 16 cacheComponents — keep route handler export-clean.

const SIZE = { width: 1200, height: 630 }

// /card?locale=de|en — server-rendered shareable verdict image.
// Used as og:image from the landing page and as the "Share this week's verdict"
// destination. Inner getWeeklySnapshot is cached (cacheTag 'deals'), so render
// cost is just the layout work.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'de'
  const snapshot = await getWeeklySnapshot({ locale })

  const labels = locale === 'de' ? CATEGORY_LABELS_DE : CATEGORY_LABELS_EN
  const dateStr = formatShortDate(snapshot.updatedAt, locale).toUpperCase()
  const activeStores = snapshot.stores.filter((s) => s.dealCount > 0).length

  const fonts = await loadFonts()
  const sentences = snapshot.categories.map((v) => sentenceFor(v, labels, locale))
  const stat =
    locale === 'de'
      ? `${snapshot.totalDeals.toLocaleString('de')} Aktionen aus ${activeStores} Schweizer Läden`
      : `${snapshot.totalDeals.toLocaleString('en')} deals across ${activeStores} Swiss stores`

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#FFFFFF',
        padding: '64px 80px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#0B0B0F',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' }}>
          basketch
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#6B6B75',
          }}
        >
          {locale === 'de' ? 'DIESE WOCHE' : 'THIS WEEK'} · {dateStr}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 56,
          gap: 8,
        }}
      >
        {sentences.map((s, i) => (
          <div
            key={`${s}-${i}`}
            style={{
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            {s}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          fontSize: 24,
          color: '#1F1F25',
        }}
      >
        {stat}
      </div>

      {/* Bottom accent stripe — concatenated category colors, mirrors the card-row accent */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          display: 'flex',
        }}
      >
        {snapshot.categories.map((v) => (
          <div
            key={`bar-${v.category}`}
            style={{
              flex: 1,
              background: ACCENT_HEX[v.category as DealCategory] ?? '#6B6B75',
            }}
          />
        ))}
      </div>
    </div>,
    { ...SIZE, fonts },
  )
}

// Static colors mirroring globals.css --cat-* tokens. ImageResponse can't read
// CSS variables, so we copy the values once.
const ACCENT_HEX: Record<DealCategory, string> = {
  fresh: '#EA7A2B',
  longlife: '#B6361C',
  household: '#2E4CDE',
}

function sentenceFor(
  v: CategoryVerdict,
  labels: Record<string, string>,
  locale: 'de' | 'en',
): string {
  const cat = labels[v.category as keyof typeof labels] ?? String(v.category)
  if (v.state === 'winner' && v.winner) {
    const store = STORE_BRAND[v.winner].label
    return locale === 'de' ? `${store} gewinnt ${cat}.` : `${store} wins ${cat}.`
  }
  if (v.state === 'tied') return locale === 'de' ? `${cat} ist unentschieden.` : `${cat} is tied.`
  if (v.state === 'single-store') {
    return locale === 'de'
      ? `Nur ein Anbieter für ${cat}.`
      : `Only one store offering ${cat}.`
  }
  return locale === 'de' ? `Keine Daten für ${cat}.` : `No data for ${cat}.`
}
