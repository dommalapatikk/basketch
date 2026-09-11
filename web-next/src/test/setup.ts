/**
 * Test setup, shared by both environments.
 *
 * Guarded on `window` because most suites run in the `node` environment — the
 * pure domain and filter tests have no DOM and should stay fast. Only the
 * component suites opt into jsdom, via a `// @vitest-environment jsdom`
 * docblock at the top of the file.
 */

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  // jsdom does not implement matchMedia, and vaul (the mobile drawer) calls it
  // on mount. Without this the FilterSheet cannot be rendered in a test at all,
  // which would leave the mobile filter surface permanently untested — and the
  // mobile surface is the one that shipped without the storage facet.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
