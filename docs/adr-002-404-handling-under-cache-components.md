# ADR-002: 404 handling under Cache Components

**Status:** Accepted
**Date:** 2026-09-27
**Decides:** the fix design in `docs/rca/2026-09-25-tech-lead-404-shows-500.md` and
`docs/rca/2026-09-25-architect-404-cross-review.md`
**Raised by:** production incident — every unmatched URL returned HTTP 404 but showed
"Something went wrong" (the unstyled global-error 500 page).

---

## Context

`web-next/src/app/[locale]/[...rest]/page.tsx` was a catch-all whose only job was
`notFound()`. Under `cacheComponents: true`, `next build` prerendered it as a PPR fallback
shell. The shell's error-document render inlined the main prerender's Flight stream, whose
streaming-metadata holes were halted as dynamic and never resumed — Next stored this as a
*finished* cached document with dangling rows. React's Flight client rejected those rows
client-side (`Error("Connection closed.")`), which is not an HTTP-fallback error, so it
escaped every boundary and reached `global-error.tsx`. Full mechanism: the two RCA files
above.

A second, unrelated defect surfaced on the way: `/foo.bar` (a dotted path the next-intl
proxy matcher skips) reached `[locale]/layout.tsx` with the raw, unvalidated path segment as
`locale`, and a downstream `Intl` call threw `RangeError: Invalid language tag`, a 500 for
what should be a 404.

## Decision

1. **Route unknown URLs at the routing level, not through a catch-all page.** Delete
   `[locale]/[...rest]/page.tsx`; enable `experimental.globalNotFound` in `next.config.ts`;
   add `src/app/global-not-found.tsx`. It is documented as the fix for exactly this app
   shape (a root layout defined by a top-level dynamic segment) in
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`.
2. **`global-not-found.tsx` stays fully static** — no `headers()`, `cookies()`, or
   `connection()`. Any of those would create a PPR hole in the 404 document, the same bug
   class. Both locale blocks render server-side from `messages/{de,en}.json` `errors.*`; a
   client island (`NotFoundLocale`) picks the visible one from `window.location.pathname`.
3. **Parse the locale once, at every `[locale]` entry point** (`layout.tsx`'s
   `generateMetadata` and body, and every `page.tsx` under it), via
   `src/i18n/parse-locale.ts`. Never trust the raw route param past that point — this is
   what fixes the `/foo.bar` `RangeError`.
4. **`app/not-found.tsx` renders a fragment**, not its own `<html>`/`<body>` — there is no
   root `app/layout.tsx`, so Next already supplies that shell. It remains reachable only for
   a `notFound()` thrown *by* `[locale]/layout.tsx` itself (a layout's own throw bubbles past
   the localized `[locale]/not-found.tsx` sibling to the parent segment's boundary).
5. **T2 (an HTTP-only structural test parsing served HTML, no browser) is the primary gate**,
   because it is version-independent; a build-artifact check (T4) is defence in depth and
   must fail loudly on an unrecognised Next build-output shape rather than pass vacuously.

## Binding rules going forward

- **A dynamic segment that can 404 must enumerate its valid values in
  `generateStaticParams`** and be covered by an equivalent of T2/T4 before merge. Under
  `cacheComponents`, an unenumerated value gets a fallback shell, and a synchronous
  `notFound()` thrown inside that shell reproduces this exact bug class.
- **Locales (or any route param an entry point trusts) are parsed once, at the boundary**,
  into a typed value — never carried downstream as a raw `string`.
- **Build-only behaviour (PPR, prerender caching, `cacheComponents`) is never verified
  against `next dev`.** `next dev` does not build PPR fallback shells, so this entire bug
  class is invisible there even with the test unskipped. Use `npm run e2e:prod` (forces
  `next build && next start`).
- **A skipped acceptance test needs an owner and an expiry**, recorded in the skip's own
  comment. `AC4` sat `.skip`-ped with a comment calling it a "REAL BUG (deferred)" for long
  enough that `cacheComponents` changed the underlying defect's symptom entirely (German
  copy on `/en/*` → global-error 500) without anyone re-testing it.

## Consequences

**Easier:** unknown URLs are one static, cacheable document per matching CDN edge. Locally,
`next start` serves `/_not-found` with `x-nextjs-prerender: 1` and no function invocation. On
Vercel specifically this is **unverified** (code review 2026-09-27 SHOULD-FIX 4) — step 11's
post-deploy check is what confirms it in production, not this ADR. The locale-parsing rule
makes any future entry point that skips it a type error at every downstream call site typed
`Locale`.

**Harder / accepted costs:** `global-not-found.tsx` cannot render the real `Header`/`Footer`
(no `NextIntlClientProvider`, no list store) — PM decision P-11 is a minimal brand bar
instead. An English visitor may see a brief German flash before the client island resolves
the locale; with JavaScript disabled, both language blocks show. The page is `noindex`
(Next injects this automatically for any 404), so neither costs anything in search.

**Known, evidence-documented residual:** `/foo.bar` specifically (and any dotted path
reaching `[locale]/layout.tsx` with an invalid locale) still renders through Next's
`__next_error__` ErrorApp path, because a layout's own thrown `notFound()` has no
root-layout-based boundary to render into cleanly. Verified fully resolved (zero dangling
Flight rows, single `<html>`, correct 404 status) — not a recurrence of the defect this ADR
fixes, just a client-rendered-only 404 for this one edge case. See
`web-next/e2e/404-structural.spec.ts` for the inline evidence and flag for Tech Lead review.

This class has real-world reach, confirmed by the reviewer's own probes: `/favicon.ico` (no
`public/` dir in this app), and the same shape applies to any dotted-path bot/scanner probe
such as `/wp-login.php` or `/apple-touch-icon.png`. All of them are now a correct 404 status
— the only residual cost is the SSR `<body>` for these specific URLs is empty, so a client
**with JavaScript disabled sees a blank page** instead of the 404 copy, until the Flight
payload is hydrated. Bots and browsers that only check the status code (the overwhelming
majority of this traffic) are unaffected. Accepted per the deviation ruling — the only
cheap structural fix (`generateStaticParams` + `dynamicParams = false` on `[locale]`) is
unavailable, because `dynamicParams` is documented as removed under Cache Components
(`node_modules/next/dist/docs/.../dynamicParams.md:22`).

## Follow-up (owner tracked, code review 2026-09-27 SHOULD-FIX 5)

Plan step 1 "Infra" and step 11 call for running T2 against production after deploy and
checking `x-matched-path` there (it is absent under local `next start` — confirmed — so it
can only be checked against the real Vercel edge). This is **not** a CI job; it is a manual,
post-deploy check. **Owner: the coordinator**, run once after this branch deploys to
`basketch.vercel.app`. Not blocking merge.
