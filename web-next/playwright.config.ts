import { defineConfig, devices } from '@playwright/test'

// v2.1 Patch 10: E2E acceptance suite. Two projects (desktop 1440x900 and
// mobile iPhone 13 390x844) cover AC1–AC12 + AC13–AC16. webServer prefers a
// pre-built `next start` in CI for deterministic timing; falls back to
// `next dev` locally so the suite is runnable without a build step.

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        // iPhone 13 device preset is 390x844 — set explicitly so the spec is
        // self-documenting and survives any future Playwright preset drift.
        viewport: { width: 390, height: 844 },
        // iPhone 13 preset bundles defaultBrowserType:'webkit'. Override to
        // chromium so CI doesn't need to install a second browser engine
        // (CI only installs chromium per .github/workflows/ci.yml).
        // The viewport + userAgent + touch flags are what we actually test
        // against; the underlying engine doesn't change layout assertions.
        defaultBrowserType: 'chromium',
      },
    },
  ],

  webServer: {
    command: isCI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
