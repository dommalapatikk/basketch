<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 404 / build-only behaviour (ADR-002, `docs/adr-002-404-handling-under-cache-components.md`)

- **Never verify build-only behaviour (PPR, prerender caching, `cacheComponents`) against
  `next dev`.** It doesn't build PPR fallback shells, so a whole bug class is invisible
  there. Use `npm run e2e:prod` (forces `next build && next start`).
- **A dynamic segment that can 404 must enumerate its valid values in
  `generateStaticParams`** and be covered by `e2e/404-structural.spec.ts` (T2) /
  `scripts/check-404-build-artifacts.mjs` (T4) before merge — an unenumerated value gets a
  fallback shell under `cacheComponents`, and a `notFound()` thrown inside it can cache a
  document with permanently dangling content.
- **Parse a route param once, at the boundary, into a typed value** (see
  `src/i18n/parse-locale.ts`) — never carry a raw `string` downstream and trust it later.
- **A skipped acceptance test needs an owner and an expiry** in the skip's own comment. An
  indefinitely-skipped test is not a guard.
