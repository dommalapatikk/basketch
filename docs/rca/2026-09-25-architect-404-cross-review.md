# Architect cross-review: unknown URLs return 404 but show the "500 Something went wrong" page

- **Date:** 2026-09-25
- **Reviewer:** Architect
- **Reviews:** `docs/rca/2026-09-25-tech-lead-404-shows-500.md` (the "TL RCA")
- **Scope:** Independent check of the mechanism, the fix design and the tests. No code changed, nothing pushed, no new `next build`. I read the Tech Lead's existing `web-next/.next` output and the installed `next@16.2.4` source and docs, all read-only.
- **Bottom line:** I **agree** with the root cause, and I **agree** that the fix goes through `global-not-found`. There are **three amendments** and **one open question for the PM**:
  - **A1:** the locale must be resolved without request data. Do not use `headers()`.
  - **A2:** T1 must check visible text, and the URL list needs three more cases.
  - **A3:** T4 must fail loudly when the build output has an unknown shape.
  - **PM question:** the global 404 cannot carry the real Header/Footer (see §2.4).

---

## 1. Mechanism: independent verification

| TL step | Verdict | My evidence (read from `web-next/.next`, the TL build) |
|---|---|---|
| 1. `[...rest]` + `cacheComponents` produces a PPR fallback shell | **Agree, confirmed** | `prerender-manifest.json` `dynamicRoutes["/en/[...rest]"]` and `["/de/[...rest]"]` both have `fallback: "/<l>/[...rest]"`, `fallbackRouteParams: [{rest, catchall}]` and `fallbackSourceRoute: "/[locale]/[...rest]"`. |
| 2. The shell render throws `notFound()`, and the error path emits `__next_error__` | **Agree, confirmed** | `server/app/en/[...rest].html` begins `<!DOCTYPE html><html id="__next_error__">`. It contains `%%drp:rest` once. The Next source comment calls this token "a bug in cache components" if it is ever found in static output. |
| 3. Cached as a finished 404 with **no postponed state** | **Agree, and I add a stronger proof** | `en/[...rest].meta` has `"status": 404` and **no `postponed` key**. Compare this with `en/deals.meta` and `[locale].meta`: both carry a `postponed` resume state. So Next itself stored the document as complete, and nothing will ever fill its holes. This is the decisive artifact-level fact behind step 3. |
| 4. The proxy funnels every unknown URL onto it | **Agree** | `src/proxy.ts` uses `localePrefix: 'as-needed'` and the `routeRegex` for `/en/[...rest]` is `^/en/(.+?)(?:/)?$`. **Exception the TL missed:** the proxy matcher skips any path containing a dot (`.*\\..*`), plus `api`, `card` and `_next`. So `/foo.bar` is not rewritten. It matches `/[locale]` with `locale="foo.bar"`, and `[locale]/layout.tsx:84` then calls `notFound()`. That is a **second, separate 404 path** (see §3). |
| 5. Client: `Connection closed.` goes to `global-error` | **Agree it is the only plausible path. Still inferred** | I cannot run a browser either, and I did not retry the denied commands. From static evidence, "500 Something went wrong" is produced only by `src/app/global-error.tsx`, so the client *must* have thrown a non-HTTP-fallback error above every segment boundary. The dangling `$L10` / `$@9` rows are the only unresolved references in the payload. The exact error text stays unconfirmed until T1 captures the `pageerror`. This does **not** change the fix: T2 kills the bug class whatever the exact client error string is. |

**Verdict:** the root cause is sound. Steps 1-4 are artifact-proven, and step 3 is now proven by the absence of `postponed`, not just by reasoning. Step 5 is the only inferred link, and it does not affect the design.

---

## 2. Fix design evaluation

### 2.1 Delete `[locale]/[...rest]`: **Agree**

- It is the only route whose shell prerender throws.
- Every "keep it" variant fails on evidence:
  - **`generateStaticParams` returning a sentinel:** under `cacheComponents` a dynamic segment still gets a fallback shell for unknown values. `/[locale]` has static params and still has `fallbackRouteParams`. So the sentinel only adds one more prerendered 404 and leaves the shell.
  - **`await params` before `notFound()`:** this moves the throw into the resumed stage, after a 200 shell has been committed. The result is a soft 404, which is the TL's correct objection.
  - **`dynamicParams = false`:** this sends `/en/asdf` to the root not-found, which is the original AC4 bug (German copy on `/en`).
  - **Allowlisting known paths in the proxy:** this creates a second hand-typed route table, which is exactly the drift pattern this repo has been burned by twice (see the `next.config.ts` image-host comment).

### 2.2 `experimental.globalNotFound` + `app/global-not-found.tsx`: **Agree, with a stability note**

- The installed docs name our exact shape as the use case (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`: "root layout defined using top-level dynamic segments").
- **Stability:**
  - The flag is still `experimental` in 16.2.4.
  - The source carries `TODO(global-not-found): remove this flag … once global-not-found is stable` in `build/webpack/loaders/next-app-loader/index.js`, and `TODO … when global-not-found is stabilized` in `server/app-render/app-render.js`.
  - It has shipped since v15.4.0 and is wired into build, dev and render (`createNotFoundLoaderTree` uses `global-not-found` as the `layout` of `/_not-found`).
  - I verified only the webpack loader path. The build here is Turbopack (Rust, not greppable), so **the built output, checked by T2, is the proof, not my source reading.**
- **Why the risk is acceptable:**
  - This is a two-way door.
  - `next` is pinned exactly (`"next": "16.2.4"`).
  - T2 runs on every CI build and would catch a regression on upgrade.
- **Interaction with the proxy (next-intl):**
  1. The proxy still runs first and rewrites `/does-not-exist` to `/de/does-not-exist`.
  2. With `[...rest]` gone, that rewritten path matches no route, so the router serves `/_not-found`, which renders `global-not-found`.
  3. No next-intl change is needed.
- **Interaction with `cacheComponents` and the Vercel cache:**
  - `/_not-found` is already prerendered with `initialStatus: 404` and **zero dangling rows** (TL §2.8, and I confirmed that its `.html` has no `__next_error__`).
  - Provided the new page reads **no request data**, it stays one fully static 404 document served from the CDN. That means no function invocation per 404, which keeps us on the free tier.
  - A new deployment gets new cache keys, so the broken `[...rest]` HIT disappears on deploy.

### 2.3 Locale resolution: **Amendment A1 (disagree with leaving it open)**

The TL leaves "server `headers()` vs client `window.location`" to a spike. I rule out `headers()` now:

- Under `cacheComponents`, reading `headers()` must sit inside `<Suspense>`. That turns `/_not-found` into a PPR shell with a dynamic hole, which is **the same bug class we are removing** (a prerendered 404 that depends on a resume).
- Whether Vercel resumes a PPR `/_not-found` for unmatched URLs is unverified. We should not build on it.

**Design:**

- `global-not-found.tsx` stays **fully static**.
- It server-renders **both** locale blocks from `messages/{de,en}.json` `errors.*`, each wrapped in `lang="de"` / `lang="en"`. German is visible by default, which is the `as-needed` default locale.
- A tiny `'use client'` island `NotFoundLocale` runs `localeFromPathname(window.location.pathname)` and sets `document.documentElement.lang` and a `data-locale` attribute. CSS then shows only the matching block.
- `<html lang="de" suppressHydrationWarning>`.
- **Accepted costs:**
  - English users may see a very short German flash before hydration on a tiny page.
  - With no JavaScript, both languages show. That is an acceptable bilingual fallback for a `noindex` page.
- **Rejected alternative:** two separate static documents (one per locale). A single `/_not-found` cannot be split without request data.

**Where `localeFromPathname` lives (bounded context):**

- It belongs to the **Localization** supporting subdomain, not the deals domain.
- File: `web-next/src/i18n/locale-from-pathname.ts`, next to `routing.ts`.
- Signature: `localeFromPathname(pathname: string, routing: {locales, defaultLocale}): Locale`.
  - It is pure and has no Next or next-intl runtime imports.
  - Callers pass the `routing` object. That keeps it testable without mocks, and there is still exactly one locale list.
  - The return type is the locale union derived from `routing.locales`, not a bare `string`.
- Named export (the repo convention).

### 2.4 Header/footer on a localized 404: **Open, a PM decision**

- `global-not-found` has no layout. It cannot render the real `Header` / `Footer` / `ListDrawer`: they need `NextIntlClientProvider` with a server-known locale and the list store.
- **Recommendation:** a minimal static brand bar (logo linking to `/`) plus two localized CTAs (deals, home). A 404 needs a way out, not the full chrome.
- **This is a product/UX call** (CLAUDE.md: PM decides UX). The skipped AC4 only asserted status and language, not header/footer.
- `<html lang>` will be correct after hydration. The status will be a correct 404, set by the router before render, not by a thrown `notFound()`.

### 2.5 Fix nested `<html>` in `app/not-found.tsx`: **Agree, but do not delete it**

- `global-not-found` covers **unmatched URLs** only. `notFound()` thrown from `[locale]/layout.tsx` (reachable via `/foo.bar`, see §1 step 4) is still caught by the root-level `not-found` boundary, because Next wires `global-not-found` only into the `/_not-found` tree.
- So: **keep** `app/not-found.tsx` and make it render a fragment with no `<html>`/`<body>`, since Next supplies the default shell because there is no root layout.
- T1/T2 with `/foo.bar` prove the choice. The TL's "delete it if global-not-found covers it" branch should be dropped unless T2 on `/foo.bar` proves otherwise.

### 2.6 Add `[locale]/error.tsx`: **Agree, with two corrections to expectations**

- (a) It would **not** have caught today's bug: the error was thrown in the head `MetadataBoundary`, above every segment boundary.
- (b) It does **not** catch errors thrown by `[locale]/layout.tsx` itself, or by Header/Footer. Those still reach `global-error`.
- It is still worth adding, as a separate small commit, for ordinary page errors. It must be `'use client'` and uses `useTranslations`, which is available because it sits inside the layout's provider.

### 2.7 Options rejected by the TL: **Agree with all three**

I add one more: the proxy allowlist, rejected in §2.1.

---

## 3. Other routes on the same pattern (question 4)

`prerender-manifest.json` has **no other at-risk dynamic route today.**

- `/[locale]`, `/[locale]/about`, `/[locale]/deals` and `/[locale]/list` have `fallbackRootParams: ["locale"]` and **`fallback: null`**. No shell is served for an unknown root param: it renders on demand, and none of these pages throw in the shell.
- Only the `[...rest]` pair has a served `fallback`.
- The app has no other dynamic segments (`src/app/[locale]/deals/` has no `[id]`).

**Latent paths to guard, not fix now:**

1. **`/foo.bar` and other dotted single segments.** The proxy skips them, they hit `[locale]/layout.tsx`, and the layout calls `notFound()` at request time.
   - This is rendered dynamically, so there should be no dangling rows. But it produces `__next_error__`, and today it ends in the nested-`<html>` root not-found.
   - It goes into T1/T2.
2. **Any future dynamic segment (e.g. `/deals/[id]`).** Under `cacheComponents`, an unknown id is served from a fallback shell.
   - `notFound()` there is either a soft 404 (after `await params`) or this exact bug (thrown in the shell).
   - **Rule for the ADR:** a dynamic segment that can 404 must enumerate its valid values in `generateStaticParams` and must be covered by T2/T4 before merge.

---

## 4. Tests: cross-check (question 3)

| Test | Verdict | Amendment |
|---|---|---|
| **T1** e2e user contract | **Agree, amended (A2)** | **Add URLs:** `/foo.bar`, `/api/nope` and a trailing-slash `/en/nope/`. **Text checks:** with both locale blocks in the DOM (§2.3), "does not contain other locale's title" must use **visible text** (`innerText` / `toBeVisible`), not `textContent`, which is what the old AC4 used. **Also assert:** `document.documentElement.lang` matches the expected locale, there is exactly one `<html>` element, and a `robots noindex` meta is present. **Add a client-navigation case:** click a `<Link>` to `/en/nope` from `/en/deals` and assert the not-found UI, not global-error. Soft navigation takes a separate RSC path that the TL list does not exercise. |
| **T2** HTTP structural, no browser | **Agree: this is the primary gate** | Cheap (seconds) and version-independent, because it parses the served HTML, not internal files. Add the same extra URLs. Also assert `x-matched-path` is not `/[locale]/[...rest]` / `/en/[...rest]`; `next start` sets this header locally too. Verify that on the first run before relying on it. |
| **T3** global `pageerror` / global-error fixture | **Agree** | Scope it to first-party errors, so a blocked third-party script cannot make CI flaky. The test uses no allowlist beyond that. |
| **T4** build-artifact check | **Agree in intent, but fragile (A3)** | `.meta`, `fallbackSourceRoute`, `%%drp:` and `prerender-manifest.json` `version: 4` are **internal, undocumented formats**, and they can change on any minor bump. Make T4 **fail loudly on unknown shape**: assert the manifest `version === 4` and that the expected files exist, with a message telling the reader to update this check for the new Next version. Never let it pass vacuously. Generalise it: no `.html` without a `postponed` state may contain `%%drp:` or `id="__next_error__"`. It stays secondary to T2. |
| **T5** unit `localeFromPathname` | **Agree** | The function takes a pathname only (no query string), so document that. Add `'/EN/x'` giving `de`, because Next paths are case-sensitive and the proxy treats `/EN` as unprefixed. Pass `routing` in, with no mocks. |

**e2e:prod path.** Agree: build-only behaviour must be tested against `next start`.

**CI cost (free tier):**

- CI already runs `npm run build && npm run start` for Playwright (`.github/workflows/ci.yml`). T1-T3 add about 9 URLs × a few seconds, and T4 is a file scan. So there is **no new build**, and the extra time is under a minute on GitHub Actions free minutes.
- Locally, `e2e:prod` costs one build (minutes), which is acceptable.
- Add the post-deploy T2 run against production as a manual / `workflow_dispatch` step, not per push.

---

## 5. Agreed plan (ordered)

1. **Tests first (all must fail on current code).**
   - Write T5, then T2 (with the extra URLs), then T1 (unskip AC4 and replace it, using visible-text checks), then T3, then T4 (loud on unknown shape).
   - Name them `regression 2026-09-25: 404 served global-error (500)`.
   - Confirm they are red against `next build && next start`. T2 goes red on rows 9/10 and `%%drp:`.
2. **Domain:** `src/i18n/locale-from-pathname.ts` (pure; `routing` passed in), then run T5 green.
3. **Delete** `src/app/[locale]/[...rest]/page.tsx`.
4. **Enable** `experimental.globalNotFound: true` in `web-next/next.config.ts`, inside the existing `withNextIntl` wrapper.
5. **Add** `src/app/global-not-found.tsx`:
   - fully static;
   - imports `./globals.css` and the fonts;
   - static `metadata`;
   - both locale blocks from `messages/*.json`;
   - the `NotFoundLocale` client island;
   - the minimal brand bar (pending the PM decision in §2.4).
   - **No `headers()`, no `cookies()`, no `connection()`.**
6. **Fix** `src/app/not-found.tsx` to render a fragment, not `<html>`/`<body>`. Keep the file.
7. Run `next build && next start` and get T1-T5 green. Check the build output by hand once: `/_not-found.html` has no `__next_error__`, and there is no `[...rest]` in `prerender-manifest.json`.
8. **Separate commit:** `src/app/[locale]/error.tsx` (localized, `'use client'`), covered by a vitest component test. Do not add a test-only route that throws, because it would ship to production.
9. **Docs and process:**
   - Record an ADR: "404 handling under cacheComponents", including the dynamic-segment rule from §3.
   - Add to `web-next/CLAUDE.md` / `AGENTS.md`: never verify build-only behaviour against `next dev`.
   - Skipped acceptance tests need an owner and an expiry.
10. **After deploy:**
    - Run T2 against `https://basketch.vercel.app`.
    - Check that `x-matched-path` is `/_not-found` and not `/en/[...rest]`.
    - Separately spike a Next 16.3.x upgrade, gated by T1/T2.

## 6. Disagreements with the TL that need resolving

| # | Point | TL | Architect | Who decides |
|---|---|---|---|---|
| D1 | Locale source in global-not-found | Spike: `headers()` or client | Static page + client island. `headers()` is ruled out because it creates a PPR hole in the 404 (same bug class) | Tech Lead |
| D2 | `app/not-found.tsx` | Delete if global-not-found covers it | Keep it and make it a fragment. `/foo.bar` (dotted path, proxy-skipped) still reaches it through `[locale]/layout` `notFound()` | Tech Lead (T2 on `/foo.bar` settles it) |
| D3 | T4 robustness | Assert on internal build files | Keep, but make it fail loudly on unknown shape. T2 is the primary gate | Tech Lead |
| D4 | Header/footer on the 404 | Not addressed | Real Header/Footer is impossible in global-not-found. Proposal: minimal brand bar + CTAs | **PM** |
