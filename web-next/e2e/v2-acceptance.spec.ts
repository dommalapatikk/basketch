import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// v2.1 Patch 10 — acceptance suite. One file, one block per AC.
// Selectors mirror what's actually rendered today by Header.tsx and DealCard.tsx.
// Pages enumerated below match the routes shipped under src/app/[locale].

const PAGES = [
  '/de',
  '/de/deals',
  '/de/about',
  '/en',
  '/en/deals',
  '/en/about',
] as const

const NOT_FOUND_TITLE = {
  de: 'Seite nicht gefunden',
  en: 'Page not found',
} as const

// Hex store palette (v2 §3.1 + lib/store-tokens.ts). Convert to rgb() for
// computed-style comparison — browsers always serialise backgrounds as rgb().
const STORE_HEX = [
  '#FF6600', // migros
  '#E30613', // coop
  '#FFD60A', // lidl
  '#00509D', // aldi
  '#C30010', // denner
  '#E31F24', // spar
  '#C8102E', // volg
] as const

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

const STORE_RGB = STORE_HEX.map(hexToRgb)

async function gotoStable(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' })
}

// ---------------------------------------------------------------------------
// AC1 — No store-color rail anywhere on a DealCard.
// ---------------------------------------------------------------------------
test.describe('AC1 — no store-color rail on DealCard', () => {
  for (const path of ['/de/deals?type=household', '/de/deals']) {
    test(`no store-colored thin element inside any article on ${path}`, async ({ page }) => {
      await gotoStable(page, path)
      const articles = page.locator('main article')
      const count = await articles.count()
      // It's OK if the snapshot has zero deals (data may be empty in preview);
      // the test's purpose is to assert that *if* cards render, none have a
      // store-colored rail. Skip rather than fail when there are no cards.
      test.skip(count === 0, 'no DealCards rendered — nothing to assert against')

      for (let i = 0; i < count; i++) {
        const article = articles.nth(i)
        // A "rail" is tall + thin (aspect ratio > 2:1, e.g. 3px × 120px).
        // The 6px dot inside StorePill is 1:1 and is the ONLY exception HR1
        // permits, so we exclude near-square thin elements.
        const offenders = await article.evaluate(
          (el, rgbList) => {
            const out: Array<{ tag: string; w: number; h: number; bg: string }> = []
            const all = el.querySelectorAll<HTMLElement>('*')
            for (const node of Array.from(all)) {
              const rect = node.getBoundingClientRect()
              if (rect.width === 0 || rect.width >= 8) continue
              if (rect.height <= 12) continue // dots and other tiny square chrome
              const bg = window.getComputedStyle(node).backgroundColor
              if (rgbList.includes(bg)) {
                out.push({ tag: node.tagName, w: rect.width, h: rect.height, bg })
              }
            }
            return out
          },
          STORE_RGB as unknown as string[],
        )
        expect(offenders, `card #${i} has store-colored rail`).toEqual([])
      }
    })
  }
})

// ---------------------------------------------------------------------------
// AC2 — Header logo always has a basket glyph (SVG sibling next to wordmark).
// ---------------------------------------------------------------------------
test.describe('AC2 — header logo has basket glyph', () => {
  for (const path of PAGES) {
    test(`logo svg present on ${path}`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'networkidle' })
      // About page may 404 until Patch 4 lands. Skip the assertion in that
      // case — AC3 catches the missing route separately.
      test.skip(!res || res.status() >= 400, `${path} returned ${res?.status()}`)
      const logoSvg = page.locator('header a[aria-label*="basketch"] svg')
      await expect(logoSvg.first()).toBeAttached()
    })
  }
})

// ---------------------------------------------------------------------------
// AC3 — /[locale]/about returns 200 and renders the localized H1.
// ---------------------------------------------------------------------------
test.describe('AC3 — about pages exist per locale', () => {
  const ABOUT_H1 = {
    de: 'Über basketch',
    en: 'About basketch',
  } as const

  for (const locale of ['de', 'en'] as const) {
    test(`/${locale}/about returns 200 with localized h1`, async ({ page }) => {
      const res = await page.goto(`/${locale}/about`, { waitUntil: 'networkidle' })
      expect(res?.status(), `expected 200 for /${locale}/about`).toBe(200)
      // The exact wording lives in messages/${locale}.json under nav.about /
      // about.title. We assert the page contains the nav label as a soft
      // anchor so the test survives small copy edits.
      const h1 = page.locator('main h1').first()
      await expect(h1).toBeVisible()
      const text = (await h1.textContent())?.toLowerCase() ?? ''
      expect(text).toContain(ABOUT_H1[locale].toLowerCase())
    })
  }
})

// ---------------------------------------------------------------------------
// AC4 — Localized 404. /<locale>/<random> returns 404 in the right language.
// ---------------------------------------------------------------------------
test.describe('AC4 — localized 404', () => {
  for (const locale of ['de', 'en'] as const) {
    test(`/${locale}/asdf returns 404 in ${locale}`, async ({ page }) => {
      const res = await page.goto(`/${locale}/asdf`, { waitUntil: 'networkidle' })
      expect(res?.status(), `expected 404 for /${locale}/asdf`).toBe(404)
      const body = (await page.locator('body').textContent())?.toLowerCase() ?? ''
      expect(body).toContain(NOT_FOUND_TITLE[locale].toLowerCase())
      // And critically: the OTHER locale's title must NOT appear (regression
      // test for B4 where /en/asdf showed the German copy).
      const other = locale === 'de' ? 'en' : 'de'
      expect(body).not.toContain(NOT_FOUND_TITLE[other].toLowerCase())
    })
  }
})

// ---------------------------------------------------------------------------
// AC5 — Mobile DealCard: title and price-block bounding rects don't intersect.
// ---------------------------------------------------------------------------
test.describe('AC5 — no overlap on mobile DealCard', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('title link and price block are non-intersecting on /de/deals', async ({ page }) => {
    await gotoStable(page, '/de/deals')
    const articles = page.locator('main article')
    const count = await articles.count()
    test.skip(count === 0, 'no DealCards rendered')

    for (let i = 0; i < Math.min(count, 12); i++) {
      const article = articles.nth(i)
      const title = article.locator('a[id^="dc-"]').first()
      // PriceBlock uses tabular-nums and contains the price text. Pick the
      // first descendant containing a CHF currency string as the price box.
      const price = article
        .locator('text=/CHF|Fr\\./')
        .first()
      const titleBox = await title.boundingBox()
      const priceBox = await price.boundingBox()
      if (!titleBox || !priceBox) continue
      const overlap =
        titleBox.x < priceBox.x + priceBox.width &&
        titleBox.x + titleBox.width > priceBox.x &&
        titleBox.y < priceBox.y + priceBox.height &&
        titleBox.y + titleBox.height > priceBox.y
      expect(overlap, `card #${i} title overlaps price`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// AC7 — At most one positive chip per card (the "Cheapest" tag).
// ---------------------------------------------------------------------------
test.describe('AC7 — one positive chip per card max', () => {
  test('each article has ≤1 positive-toned chip on /de/deals', async ({ page }) => {
    await gotoStable(page, '/de/deals')
    const articles = page.locator('main article')
    const count = await articles.count()
    test.skip(count === 0, 'no DealCards rendered')

    for (let i = 0; i < count; i++) {
      const article = articles.nth(i)
      // Tag with tone="positive" uses a class containing "positive" and a
      // background mixed from --color-positive. Both rules below are coarse
      // (class-based) — counting any descendant that visually presents as a
      // positive chip. Strikethrough prev-price is text, not a chip.
      const positiveChips = await article
        .locator('[class*="positive"]')
        .filter({ hasNot: page.locator('s, del') })
        .count()
      expect(positiveChips, `card #${i} has too many positive chips`).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// AC8 — Every section <h2> in main has an <svg> child icon.
// ---------------------------------------------------------------------------
test.describe('AC8 — section icons in headings', () => {
  test('every h2 in main on /de/deals has an svg', async ({ page }) => {
    await gotoStable(page, '/de/deals')
    const headings = page.locator('main h2')
    const headingCount = await headings.count()
    test.skip(headingCount === 0, 'no section headings rendered')

    const headingsWithSvg = await page.locator('main h2 svg').count()
    expect(headingsWithSvg).toBeGreaterThanOrEqual(headingCount)
  })
})

// ---------------------------------------------------------------------------
// AC9 — Every page has a real (non-URL) <title>.
// ---------------------------------------------------------------------------
test.describe('AC9 — page titles', () => {
  for (const path of PAGES) {
    test(`<title> on ${path} is non-empty and not a URL`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'networkidle' })
      // Skip if the page doesn't resolve — AC3/AC4 catch missing routes.
      test.skip(!res || res.status() >= 400, `${path} returned ${res?.status()}`)
      const title = await page.title()
      expect(title.trim().length).toBeGreaterThan(0)
      expect(title).not.toMatch(/^https?:\/\//)
      expect(title).not.toMatch(/vercel\.app|localhost/)
    })
  }
})

// ---------------------------------------------------------------------------
// AC11 — axe-core: no serious or critical violations on key routes.
// ---------------------------------------------------------------------------
test.describe('AC11 — axe-core sweep', () => {
  for (const path of ['/de', '/de/deals', '/de/about'] as const) {
    test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'networkidle' })
      test.skip(!res || res.status() >= 400, `${path} returned ${res?.status()}`)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(
        blocking,
        `${path} a11y violations:\n${JSON.stringify(blocking, null, 2)}`,
      ).toEqual([])
    })
  }
})

// ---------------------------------------------------------------------------
// AC12 — Keyboard: skip link is the first stop, then header logo, then nav,
// then content. Asserts focusable order exists rather than exact identity to
// avoid being brittle as nav items evolve.
// ---------------------------------------------------------------------------
test.describe('AC12 — keyboard order', () => {
  test('tab order starts at skip-link and reaches header logo', async ({ page }) => {
    await gotoStable(page, '/de/deals')
    await page.keyboard.press('Tab')

    // 1st tab → the skip-link (first focusable in <body>).
    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement
      return {
        tag: el?.tagName.toLowerCase(),
        text: el?.textContent?.trim() ?? '',
        href: (el as HTMLAnchorElement | null)?.getAttribute?.('href') ?? null,
      }
    })
    expect(firstFocused.tag).toBe('a')
    expect(firstFocused.href).toBe('#main-content')

    // Tab a few more times — at least one of the next focusables must be the
    // header logo (aria-label contains "basketch"). Bound the loop so this
    // never hangs the suite.
    let logoReached = false
    for (let i = 0; i < 8 && !logoReached; i++) {
      await page.keyboard.press('Tab')
      logoReached = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const label = el?.getAttribute('aria-label') ?? ''
        return /basketch/i.test(label)
      })
    }
    expect(logoReached, 'header logo never received focus within 8 tabs').toBe(true)
  })
})
