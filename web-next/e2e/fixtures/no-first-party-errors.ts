import { expect, test as base } from '@playwright/test'

// T3 — global guard fixture (regression 2026-09-25: 404 served global-error
// (500), docs/rca/2026-09-25-tech-lead-404-shows-500.md § "Final plan" step
// 1). Protects every future route, not just 404 — any test that imports
// `test` from here automatically fails if the page throws a first-party
// runtime error, the exact symptom that let an uncaught RangeError (or the
// dangling-Flight-stream "Connection closed." error) escape all the way to
// the unstyled global-error 500 page.
//
// Scoped to first-party errors only (architect cross-review § 4): a blocked
// third-party script (an ad blocker, a failed analytics beacon) must not
// make CI flaky. `pageerror` only fires for errors thrown by the page's own
// script execution context, which already excludes cross-origin script
// errors browsers report as opaque "Script error." with no first-party
// stack — so no extra allowlist is needed.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    await use(page)
    expect(errors, `unexpected first-party pageerror(s): ${errors.join('; ')}`).toEqual([])
  },
})

export { expect }
