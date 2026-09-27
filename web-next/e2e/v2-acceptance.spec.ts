import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

// T3 (regression 2026-09-25: 404 served global-error (500)) — every test in
// this file fails on a first-party pageerror. See
// e2e/fixtures/no-first-party-errors.ts.
import { expect, test } from './fixtures/no-first-party-errors'

// v2.1 Patch 10 — acceptance suite. One file, one block per AC.
// Selectors mirror what's actually rendered today by Header.tsx and DealCard.tsx.
// Pages enumerated below match the routes shipped under src/app/[locale].

const PAGES = ['/de', '/de/deals', '/de/about', '/en', '/en/deals', '/en/about'] as const

const NOT_FOUND_TITLE = {
  de: 'Seite nicht gefunden',
  en: 'Page not found',
} as const

// PM decision P-11 / Designer decision 2026-09-27 (keep existing errors.*
// keys). Primary button -> deals, secondary -> home, both locale-aware.
const BROWSE_DEALS = { de: 'Aktionen ansehen', en: 'Browse deals' } as const
const BACK_TO_HOME = { de: 'Zur Startseite', en: 'Back to home' } as const
const DEALS_HREF = { de: '/deals', en: '/en/deals' } as const
const HOME_HREF = { de: '/', en: '/en' } as const

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
  // T3 (regression 2026-09-25: 404 served global-error (500)) — the other
  // half of the global guard: a page that swallows its own error (no
  // pageerror event, e.g. a caught render error) but still shows the
  // unstyled global-error fallback must fail too.
  await expect(
    page.getByText('Something went wrong', { exact: false }),
    `${url} rendered the global-error fallback`,
  ).toHaveCount(0)
}

// ---------------------------------------------------------------------------
// The deals page never silently renders empty (code review of 422bd51, F1).
//
// Nine assertions in this file `test.skip(count === 0, …)` over "no
// DealCards rendered" — deliberately, per each one's own comment, so a
// quiet preview snapshot doesn't fail a test that has nothing to check. The
// same mechanism converts a REAL total outage (a bad SELECT_COLUMNS entry,
// an unapplied migration, a Supabase query erroring outright) into a fully
// green suite: proven live — a Playwright run against main and against a
// branch that broke this exact way reported 46 pass/14 skip vs 38 pass/22
// skip, zero FAILURES either time, because every assertion gated on
// `main article` count skipped instead of failing.
//
// This assertion is the one exception: it is never allowed to skip. An
// empty deals page is not "nothing to assert" here — it IS the failure.
// ---------------------------------------------------------------------------
test.describe('the deals page never silently renders empty', () => {
  test('/de/deals renders at least one deal card', async ({ page }) => {
    await gotoStable(page, '/de/deals')
    const count = await page.locator('main article').count()
    expect(
      count,
      'zero DealCards rendered on /de/deals — this must FAIL, not skip, over an empty page',
    ).toBeGreaterThan(0)
  })
})

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

      // Patch G fix: cards above the fold use content-visibility:auto, which
      // means off-screen children return 0×0 from getBoundingClientRect.
      // Scroll each article into view before measuring so layout is forced.
      for (let i = 0; i < Math.min(count, 12); i++) {
        const article = articles.nth(i)
        await article.scrollIntoViewIfNeeded().catch(() => {})
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
// AC4 / T1 — Localized 404 (regression 2026-09-25: 404 served global-error
// (500), docs/rca/2026-09-25-tech-lead-404-shows-500.md § "Final plan" step
// 1). Replaces the long-skipped AC4 above. Every URL below used to return
// HTTP 404 while SHOWING "Something went wrong" (the unstyled global-error
// 500 page) — see the RCA for the mechanism (a PPR fallback shell's cached
// error document with permanently dangling Flight rows). Fixed via
// global-not-found.tsx + parseLocale; see also e2e/404-structural.spec.ts
// (T2, the HTTP-level primary gate) and e2e/fixtures/no-first-party-errors.ts
// (T3, the pageerror guard every test in this file now uses).
//
// Text checks use VISIBLE text (toBeVisible / getByText), not textContent
// (architect cross-review § 4, amendment A2): global-not-found.tsx
// server-renders BOTH locale blocks and hides one with CSS, so a plain
// textContent check would find both locales' titles in the DOM regardless
// of which is actually shown to the user.
// ---------------------------------------------------------------------------
const UNKNOWN_URLS = [
  { url: '/en/does-not-exist', locale: 'en', hasBrandBar: true },
  { url: '/en/settings/hidden', locale: 'en', hasBrandBar: true },
  { url: '/does-not-exist', locale: 'de', hasBrandBar: true },
  { url: '/xx/foo', locale: 'de', hasBrandBar: true },
  { url: '/en/deals/x/y', locale: 'en', hasBrandBar: true },
  { url: '/de/nope', locale: 'de', hasBrandBar: true },
  { url: '/en/nope/', locale: 'en', hasBrandBar: true },
  // /foo.bar: a dotted single segment the next-intl proxy skips, reaching
  // [locale]/layout.tsx with an invalid locale. parseLocale rejects it, and
  // that notFound() bubbles to the root app/not-found.tsx (always German —
  // see that file's own comment), NOT to global-not-found. That file has no
  // brand bar (code review 2026-09-27 MUST-FIX 2: assert only its /deals and
  // / links).
  { url: '/foo.bar', locale: 'de', hasBrandBar: false },
  { url: '/en/foo.bar', locale: 'en', hasBrandBar: true },
] as const

test.describe('AC4 / T1 — every unmatched URL is a real, localized 404 (never global-error)', () => {
  // Pin the browser's Accept-Language to the app's own default (de-CH,
  // Swiss market — CLAUDE.md). Without this, next-intl's `as-needed`
  // middleware negotiates a locale from Accept-Language for any genuinely
  // unprefixed or invalid-prefix path (e.g. redirecting /does-not-exist to
  // /en/does-not-exist for an English-preferring browser like Playwright's
  // Chromium default) BEFORE it ever reaches global-not-found or
  // localeFromPathname — real, correct next-intl behaviour, not the defect
  // this suite tests. Pinning it makes the "de" expectations below
  // deterministic instead of accidentally depending on the test runner's
  // browser locale.
  test.use({ locale: 'de-CH' })

  for (const { url, locale, hasBrandBar } of UNKNOWN_URLS) {
    const other = locale === 'de' ? 'en' : 'de'

    test(`${url} is a visible, localized 404 in ${locale}`, async ({ page }) => {
      const res = await page.goto(url, { waitUntil: 'networkidle' })
      expect(res?.status(), `expected 404 for ${url}`).toBe(404)

      await expect(
        page.getByRole('heading', { level: 1, name: NOT_FOUND_TITLE[locale] }),
        `${url} should visibly show the ${locale} title`,
      ).toBeVisible()
      // The OTHER locale's block may still exist in the DOM (global-not-found
      // server-renders both and hides one with CSS) — assert not VISIBLE,
      // not absent, so this passes whether the block is hidden or missing.
      await expect(
        page.getByRole('heading', { level: 1, name: NOT_FOUND_TITLE[other] }),
        `${url} must not visibly show the ${other} title`,
      ).not.toBeVisible()

      expect(
        await page.evaluate(() => document.documentElement.lang),
        `document.documentElement.lang should be "${locale}" for ${url}`,
      ).toBe(locale)

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

      const bodyText = (await page.locator('body').innerText()).toLowerCase()
      expect(bodyText).not.toContain('something went wrong')

      // MUST-FIX 2 (code review 2026-09-27): P-11 assertions. Plan step 6
      // required these; they were missing even though the behaviour was
      // already correct — nothing protected it from regressing.
      const primary = page.getByRole('link', { name: BROWSE_DEALS[locale] })
      await expect(
        primary,
        `${url} should have a visible "${BROWSE_DEALS[locale]}" link`,
      ).toBeVisible()
      await expect(primary).toHaveAttribute('href', DEALS_HREF[locale])

      const secondary = page.getByRole('link', { name: BACK_TO_HOME[locale] })
      await expect(
        secondary,
        `${url} should have a visible "${BACK_TO_HOME[locale]}" link`,
      ).toBeVisible()
      await expect(secondary).toHaveAttribute('href', HOME_HREF[locale])

      if (hasBrandBar) {
        const brandLink = page.getByRole('link', { name: 'basketch — home' })
        await expect(brandLink, `${url} should have a visible brand-bar home link`).toBeVisible()
        await expect(brandLink).toHaveAttribute('href', HOME_HREF[locale])
      }

      // No main-site chrome: the real <Header> renders a <nav aria-label
      //="Primary"> (Deals/About/My list) and <Footer> is a <footer>
      // (implicit "contentinfo" landmark). Neither exists on this minimal
      // brand-bar page (PM decision P-11).
      await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0)
      await expect(page.getByRole('contentinfo')).toHaveCount(0)
    })
  }

  // Client-side navigation to an unmatched path (architect cross-review § 4,
  // amendment A2: "soft navigation takes a separate RSC path"). There is no
  // in-app link to an unknown page to click, so this uses the browser back
  // button, which Next's App Router normally intercepts via its own
  // popstate listener and resolves client-side.
  //
  // FINDING, recorded rather than asserted as fact: a `window.__softNav`
  // marker set before `page.goBack()` here does NOT survive — evidence that
  // Next falls back to a full document navigation for this specific case.
  // That is consistent with how global-not-found is documented to work
  // ("handled at the routing level... Next.js skips rendering" — it never
  // enters the client-side route tree at all, unlike an in-segment
  // `notFound()`), so a client transition to a WHOLLY unmatched path
  // arguably cannot be soft by construction. This app has no dynamic segment
  // that can 404 from within a matched route today (architect cross-review
  // § 3) to test the alternative, in-tree case. What this test DOES prove,
  // and what actually matters for the user: a client-side history
  // transition to an unknown URL still lands on the correct localized 404,
  // not a crash or a blank screen, regardless of which navigation mechanism
  // Next chooses.
  test('browser-back navigation to /en/nope shows the not-found UI, not global-error', async ({
    page,
  }) => {
    await gotoStable(page, '/en/nope') // hard nav — establishes a real history entry
    await gotoStable(page, '/en/deals') // hard nav — pushes a second history entry
    await page.goBack({ waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_TITLE.en })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')

    const bodyText = (await page.locator('body').innerText()).toLowerCase()
    expect(bodyText).not.toContain('something went wrong')
  })
})

// ---------------------------------------------------------------------------
// AC5 — Mobile DealCard: title and price-block bounding rects don't intersect.
// ---------------------------------------------------------------------------
test.describe('AC5 — no overlap on mobile DealCard', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('title and price block are non-intersecting on /de/deals', async ({ page }) => {
    await gotoStable(page, '/de/deals')
    const articles = page.locator('main article')
    const count = await articles.count()
    test.skip(count === 0, 'no DealCards rendered')

    for (let i = 0; i < Math.min(count, 12); i++) {
      const article = articles.nth(i)
      // Match on the id, NOT on the tag. A deal whose retailer gives us no
      // product URL renders its title as a <p>, because an <a href="#"> that
      // goes nowhere is worse than plain text. This locator said `a[id^=...]`
      // and so hung for 30s the moment the first card was flyer-sourced —
      // the test was pinned to the markup, while what it actually checks is
      // that the two boxes do not overlap.
      const title = article.locator('[id^="dc-"]').first()
      await expect(title, `card #${i} has no title element`).toBeVisible()
      // PriceBlock uses tabular-nums and contains the price text. Pick the
      // first descendant containing a CHF currency string as the price box.
      const price = article.locator('text=/CHF|Fr\\./').first()
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
      // Match only Tag-style chips (have bg-positive-bg). The savings −% in
      // PriceBlock uses text-[var(--color-positive)] but no positive bg, so
      // it's text not a chip and shouldn't count.
      const positiveChips = await article.locator('[class*="bg-positive"]').count()
      expect(positiveChips, `card #${i} has too many positive chips`).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// AC8 — Every section <h2> in main has an <svg> child icon.
// ---------------------------------------------------------------------------
// DEFERRED: After Patch G stage 2 virtualization, h2 elements are only
// rendered after JS hydration + virtualizer initialization. The test counts
// h2s right after networkidle but the virtualizer may still be measuring.
// Needs an explicit wait for first h2 to be attached before counting.
test.describe
  .skip('AC8 — section icons in headings', () => {
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
      expect(blocking, `${path} a11y violations:\n${JSON.stringify(blocking, null, 2)}`).toEqual([])
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

// ---------------------------------------------------------------------------
// AC16 — Patch D HR12: mobile compact rows don't overlap pill / name / price
// at 320 / 360 / 390 / 414 px viewports.
// ---------------------------------------------------------------------------
test.describe('AC16 — no overlap on compact rows across mobile widths', () => {
  for (const width of [320, 360, 390, 414]) {
    test(`width ${width}: compact pill, name, price boxes are non-intersecting`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await gotoStable(page, '/de/deals')
      // Compact cards live inside the snap-rail under "OTHER STORES" — width
      // 280 px hard-coded on the article. Filter to those.
      const compacts = page.locator('main article.w-\\[280px\\]')
      const count = await compacts.count()
      test.skip(count === 0, 'no compact cards on this page snapshot')

      for (let i = 0; i < Math.min(count, 8); i++) {
        const article = compacts.nth(i)
        const pill = article.locator('span.uppercase').first()
        // Tag-agnostic for the same reason as AC5 above: a flyer-sourced deal
        // has no product URL and renders its title as a <p>.
        const name = article.locator('[id^="dc-"]').first()
        const price = article.locator('text=/CHF|Fr\\./').first()
        const [pBox, nBox, prBox] = await Promise.all([
          pill.boundingBox(),
          name.boundingBox(),
          price.boundingBox(),
        ])
        if (!pBox || !nBox || !prBox) continue
        // pairwise non-intersecting
        function overlap(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
          return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
          )
        }
        expect(overlap(pBox, prBox), `card #${i} pill overlaps price at ${width}px`).toBe(false)
        expect(overlap(nBox, prBox), `card #${i} name overlaps price at ${width}px`).toBe(false)
        // No horizontal overflow on the article itself.
        const widths = await article.evaluate((el) => ({
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        }))
        expect(widths.scrollW, `card #${i} horizontal overflow at ${width}px`).toBeLessThanOrEqual(
          widths.clientW + 1, // 1px subpixel tolerance
        )
      }
    })
  }
})

// ---------------------------------------------------------------------------
// AC17 — Patch D HR13: filter sheet contains no Type section. Sheet title
// reflects the active Type as a kicker (e.g. "Long-life · Filters").
// ---------------------------------------------------------------------------
test.describe('AC17 — Type is gone from FilterSheet, kicker shows scope', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('opening the sheet on /en/deals?type=longlife shows kicker, no Type heading', async ({
    page,
  }) => {
    // Today's URL contract uses ?type=longlife (one word). Patch E will rename
    // to ?type=long-life — when that lands, update this regex too.
    await gotoStable(page, '/en/deals?type=longlife')
    const filterTrigger = page.getByRole('button', { name: /^Filters/i }).first()
    test.skip(!(await filterTrigger.count()), 'no Filters trigger in BottomBar (desktop view?)')
    await filterTrigger.click()
    // Drawer renders into a portal; query its title via the vaul-injected element.
    const drawerTitle = page.locator('[data-vaul-drawer] >> text=/Filters/i').first()
    await drawerTitle.waitFor({ state: 'visible', timeout: 5000 })
    const titleText = (await drawerTitle.innerText()).toLowerCase()
    expect(titleText, 'drawer title should include the active Type as kicker').toMatch(/long.?life/)
    // No standalone "Type" section heading inside the drawer.
    const typeHeading = page.locator('[data-vaul-drawer] p.uppercase', {
      hasText: /^type/i,
    })
    expect(await typeHeading.count(), 'sheet must not contain a Type heading').toBe(0)
  })
})
