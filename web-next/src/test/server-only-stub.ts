// Test-only stand-in for the `server-only` package.
//
// `server-only` is not a real npm package — Next.js aliases it to a compiled
// stub (node_modules/next/dist/compiled/server-only) inside its own webpack
// build, so `import 'server-only'` resolves there at build/runtime but is
// invisible to plain Node module resolution, which is what vitest uses. Any
// server-data module that guards itself with `import 'server-only'` (the
// correct thing for it to do) is therefore unimportable from a test without
// this alias (vitest.config.ts `resolve.alias['server-only']`). A no-op
// side-effect import is all `server-only` itself is at type-check time too.
export {}
