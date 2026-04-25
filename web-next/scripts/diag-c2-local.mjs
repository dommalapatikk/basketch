// Diagnostic for Patch C2 — measures what actually happens on a sub-cat click
// against the LIVE production site basketch-redesign.vercel.app.
// Outputs: click→URL latency, RSC network calls, payload bytes, main-thread tasks.

import { chromium, devices } from 'playwright'

const TARGET = 'http://localhost:3000/en/deals?type=household'
const SUB_CAT_LABEL = /Cleaning/i
const VIEWPORTS = [
  { name: 'desktop', preset: { viewport: { width: 1440, height: 900 } } },
  { name: 'mobile', preset: devices['iPhone 13'] },
]

async function runOne({ name, preset }) {
  console.log(`\n━━━ ${name.toUpperCase()} ━━━`)
  const browser = await chromium.launch()
  const ctx = await browser.newContext(preset)
  const page = await ctx.newPage()

  // Throttle to mid-tier mobile if mobile preset
  if (name === 'mobile') {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // ~1.6 Mbps Slow 4G
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }

  const networkLog = []
  page.on('request', (r) => {
    networkLog.push({ url: r.url(), method: r.method(), startedAt: Date.now() })
  })
  page.on('response', async (r) => {
    const idx = networkLog.findIndex((e) => e.url === r.url() && !e.status)
    if (idx >= 0) {
      networkLog[idx].status = r.status()
      networkLog[idx].endedAt = Date.now()
      try {
        const body = await r.body()
        networkLog[idx].bytes = body.length
      } catch {
        networkLog[idx].bytes = null
      }
    }
  })

  console.log('Loading page...')
  const t0 = Date.now()
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60_000 })
  console.log(`Initial load: ${Date.now() - t0}ms`)

  // Take initial snapshot of network
  const beforeClickCount = networkLog.length

  // Find the sub-cat button. On desktop it's in FilterRail (single tap commits).
  // On mobile it's in FilterSheet — tap chip sets draft, then "Show n deals" commits.
  let clickStart
  if (name === 'desktop') {
    const subCat = page.getByRole('button', { name: SUB_CAT_LABEL }).first()
    if (!(await subCat.count())) {
      console.log(`  ⚠️  Sub-cat button not found.`)
      await browser.close()
      return null
    }
    console.log(`Clicking "${SUB_CAT_LABEL}" sub-cat (desktop, single tap commits)...`)
    clickStart = Date.now()
    await subCat.click()
  } else {
    const filterBtn = page.getByRole('button', { name: /Filter|filtern/i }).first()
    if (await filterBtn.isVisible()) {
      await filterBtn.click()
      await page.waitForTimeout(800)
    }
    const chip = page.getByRole('button', { name: SUB_CAT_LABEL }).first()
    if (!(await chip.count())) {
      console.log(`  ⚠️  Sub-cat chip not found in sheet.`)
      await browser.close()
      return null
    }
    await chip.click()
    await page.waitForTimeout(200)
    const showBtn = page.getByRole('button', { name: /Show \d+|deals zeigen|^\d+ Aktion/i }).first()
    if (!(await showBtn.count())) {
      console.log(`  ⚠️  "Show n deals" commit button not found.`)
      await browser.close()
      return null
    }
    console.log(`Tapping "Show n deals" (mobile, this is the commit)...`)
    clickStart = Date.now()
    await showBtn.click()
  }

  // Time to URL change
  await page.waitForFunction(
    () => window.location.search.includes('cat='),
    { timeout: 10_000 },
  ).catch(() => {})
  const urlChangedAt = Date.now()

  // Time until network goes idle
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  const networkIdleAt = Date.now()

  const clickToUrlMs = urlChangedAt - clickStart
  const clickToIdleMs = networkIdleAt - clickStart

  const newRequests = networkLog.slice(beforeClickCount)
  const rscRequests = newRequests.filter((r) => r.url.includes('_rsc=') || r.url.includes('?_rsc'))
  const rscBytes = rscRequests.reduce((sum, r) => sum + (r.bytes ?? 0), 0)

  console.log(`\nResults:`)
  console.log(`  click → URL change : ${clickToUrlMs}ms`)
  console.log(`  click → networkIdle: ${clickToIdleMs}ms`)
  console.log(`  network requests on click: ${newRequests.length}`)
  console.log(`  ?_rsc= requests          : ${rscRequests.length}`)
  console.log(`  ?_rsc= total bytes       : ${rscBytes.toLocaleString()}`)
  if (rscRequests.length) {
    console.log(`  ?_rsc= breakdown:`)
    for (const r of rscRequests) {
      console.log(`    [${r.status}] ${(r.bytes ?? 0).toLocaleString()}B — ${r.url.slice(0, 120)}`)
    }
  }
  // Top 5 largest non-image responses on click
  const heavies = newRequests
    .filter((r) => r.bytes && !/\.(png|jpe?g|webp|gif|svg)/.test(r.url))
    .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
    .slice(0, 5)
  if (heavies.length) {
    console.log(`  top 5 non-image responses:`)
    for (const r of heavies) {
      console.log(`    ${(r.bytes ?? 0).toLocaleString()}B — ${r.url.slice(0, 100)}`)
    }
  }

  await browser.close()
  return { name, clickToUrlMs, clickToIdleMs, rscRequests: rscRequests.length, rscBytes }
}

const results = []
for (const v of VIEWPORTS) {
  const r = await runOne(v)
  if (r) results.push(r)
}

console.log(`\n━━━ SUMMARY ━━━`)
console.table(results)
console.log(`\nVerdict guidance:`)
console.log(`  - If clickToUrlMs > 200ms AND rscRequests > 0 → HR10 client-island fix is needed`)
console.log(`  - If clickToUrlMs > 1000ms → matches the audit's "freeze" report`)
console.log(`  - If rscBytes > 100KB → server is re-streaming the deal list every click`)
console.log(`  - If clickToUrlMs < 100ms AND clickToIdleMs > 5000ms → bottleneck is image loading, not filter`)
