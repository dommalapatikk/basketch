# Shared-List Expiry & Pluralisation — Design Spec

**Date:** 2026-09-27
**Author:** Designer agent
**Status:** Draft — awaiting Design Challenger review before Builder starts (Universal Resolution Loop, CLAUDE.md)
**Scope:** Design only. No code, no push.

**Files this spec constrains** (Builder reads these before writing code):
- `web-next/src/app/[locale]/list/page.tsx`
- `web-next/src/components/list/HydrateAndRedirect.tsx`
- `web-next/src/components/list/ListDrawer.tsx`
- `web-next/src/lib/share-url.ts` (`parseListIds`)
- `web-next/src/stores/ui-store.ts`
- `web-next/src/messages/en.json`, `de.json` (and, for consistency, `fr.json`/`it.json` — not authored here, flagged at the end)

---

## Part A — Shared list link expiry

> **Superseded by 2026-09-27-shared-list-view-spec.md (PM P-14).** Part A below (root cause, case matrix, redirect-and-banner design, and the PM DECISION NEEDED item P1) is replaced by that spec, which implements the Architect's separate-view decision (`docs/design/2026-09-27-architect-shared-list-separate-view.md`). Part B (pluralisation, below) is unaffected — already built and live.

### A.0 Root cause (why this happens)

`/list?items=<id>,<id>` stores nothing server-side. `ListShareBody` (page.tsx) resolves each id against **this week's** snapshot only (`getWeeklySnapshot`), `.filter(Boolean)`s out anything not found, and hands the survivors to `HydrateAndRedirect`, which seeds the Zustand list store and calls `router.replace('/deals')` inside a `useEffect` — client-side, so it only fires once JS has hydrated. Two structural facts drive every case below:

1. **We only ever have IDs.** A dropped ID could mean "promotion ended," "never existed," or "URL got mangled in transit." We must not claim more certainty than we have (Rams #6, Honest).
2. **The redirect is real, not instant.** On a slow connection the SSR'd `/list` page is on screen for a moment before `useEffect` fires — long enough for a screen reader to start announcing it, then have the page vanish. A message that only lives on `/list` before redirect is not reliable feedback (Norman: Feedback must be dependable, not a flash). So the durable copy of the message lives on the post-redirect surface (the list drawer on `/deals`), not on the pre-redirect page.

### A.1 Case matrix

| # | Case | ids parsed (`parseListIds`) | items resolved | Redirect to `/deals`? | Where the message lives |
|---|---|---|---|---|---|
| 1 | All items current | N ≥ 1 | N | Yes | Drawer opens normally, no notice |
| 2 | Some ended, some current | N ≥ 2 | 1..N-1 | Yes | Persistent notice banner inside the opened drawer |
| 3 | **All** ended (or all IDs unrecognised) | N ≥ 1 | 0 | **No** | Stay on `/list`, show a dedicated "nothing available" state |
| 4 | Malformed / empty `items` param (no IDs at all) | 0 | 0 | **No** | Stay on `/list`, show a dedicated "no items in this link" state |
| 5 | Duplicate IDs | N (with dupes) | ≤ N unique | per case 1/2/3 above, using **deduped** counts | same as whichever case the deduped result falls into |
| 6 | Very long link (many IDs, or a truncated tail) | capped, see A.5 | per case 1/2/3 above | same | same |

Cases 3 and 4 look similar (both end with zero items and no redirect) but get **different copy**, because they are different facts: case 4 never had anything to look up; case 3 had IDs that didn't resolve. Don't blur them into one "empty" message — that would either overclaim ("these expired," when they might have been junk) or underclaim ("nothing here," when items really did age out).

### A.2 Case 1 — all current (baseline, unchanged)

No behaviour change. `HydrateAndRedirect` seeds the store, opens the drawer, redirects. No notice.

### A.3 Case 2 — some ended, some current

**Behaviour:**
- `ListShareBody` computes, server-side, after deduping ids: `endedCount = uniqueIds.length - resolvedItems.length`.
- `HydrateAndRedirect` receives `endedCount` as a new prop alongside `items`. In its existing `useEffect`, alongside `replaceAll(items)` and `setOpen(true)`, it also calls a new `ui-store` setter, e.g. `setListNotice({ type: 'expired', count: endedCount })`, before `router.replace('/deals')`.
- `ListDrawer` reads this notice from `ui-store` and renders it as a dismissible inline banner as the **first thing** inside the drawer's content area — above `ItemsByCategory`, below the header. It renders whether the drawer is opened via this flow or any other (harmless no-op when there's no notice).
- The notice is **not** persisted to `localStorage` — it's `ui-store` state, cleared on manual dismiss. Closing and reopening the drawer in the same session keeps showing it until dismissed; a full page reload naturally clears it (store isn't persisted).

**Banner design:**
- Container: full-width strip, `bg-[var(--color-page)]`, `border border-[var(--color-line)]`, `rounded-[var(--radius-md)]`, `px-4 py-3`, sits in the same `px-5` gutter as the rest of the drawer content, `mb-4` before the item list.
- Icon: a small info glyph (`lucide-react` `Info`, `h-4 w-4`, `text-[var(--color-ink-3)]`) — never a warning/red icon; this is informational, not an error (Swiss tone: calm, factual, no blame).
- Text: `text-sm text-[var(--color-ink-2)]`, the ICU string from A.6 below.
- Dismiss control: `X` icon button, `h-11 w-11` hit area (44px, WCAG 2.2), `aria-label` = `list.notice_dismiss` ("Dismiss" / "Ausblenden"), positioned top-right of the strip, `flex-shrink-0`.
- Redundant encoding: meaning carried by icon + text + position (top of list), never by colour alone — no colour is used at all here beyond the existing neutral tokens, which is itself the safest choice.

**Accessibility:**
- `role="status"` + `aria-live="polite"` on the banner container, so it's announced without stealing focus from whatever Vaul does with the drawer's own focus trap.
- Additionally, on mount (when a notice is present), move focus programmatically to the banner (`tabIndex={-1}`, `ref.current?.focus()` in a `useEffect` keyed on the notice appearing) — belt-and-braces, because relying solely on `aria-live` timing next to a drawer that's simultaneously entering a focus trap is exactly the kind of race that silently drops the announcement in some screen reader/browser combinations. This makes the notice something the user cannot miss, not something they might catch.
- Focus is visible via the existing focus-ring tokens; the banner itself is not a link/button, so it takes focus only for the announcement, not to imply interactivity.

**Copy (see A.6 for exact ICU strings):** `list.expired_notice`.

### A.4 Case 3 — all ended / all IDs unrecognised (no redirect)

**Behaviour:** `ListShareBody` does **not** render `HydrateAndRedirect` and does **not** redirect when `ids.length > 0 && items.length === 0`. It renders a dedicated state directly on `/list`, visually consistent with `ListDrawer`'s existing `EmptyState` (same icon, same structure) so a user who has seen the app before recognises the pattern (Nielsen: Consistency).

**Layout** (`ListShareBody` return, replacing the current heading+`HydrateAndRedirect`):
```
<ShoppingBag icon, h-12 w-12, text-[var(--color-ink-3)]>
<h1>  list.none_available_title
<p>   list.none_available_body
<Link href="/deals">  list.browse_deals   (reuse existing key — same label already used
                                            in ListDrawer's EmptyState; one label for the
                                            same job, not two — Rams #8, Thorough)
```
- The CTA is a real `<Link>`, `h-11` minimum, `bg-[var(--color-signal)]`, matching the existing `EmptyState` button exactly (same component visually, just reached from a different route).
- No drawer opens. No `useListStore` mutation happens at all — an empty share link should not blow away whatever the visitor already had in *their own* list from earlier browsing. (This is also why case 3/4 must not call `replaceAll([])` — that would silently wipe an unrelated, populated list. Flag this as a **correctness requirement**, not just a UX preference: today's code calls `replaceAll(items)` unconditionally even when `items` is empty, which already has this defect independent of this spec's notice work.)

### A.5 Case 4 — malformed / empty `items` param (no redirect)

Same layout as A.4, different copy (`list.link_empty_title` / `list.link_empty_body`) — this state must not say "no longer available," because nothing was ever identified. Say there's nothing to open.

### A.6 Duplicates and very long links (cases 5–6)

- **Duplicate IDs are a real, reachable bug today**, independent of this spec: `parseListIds` does not dedupe, and `useListStore.replaceAll` (unlike `add`) does not check for existing IDs — a link like `?items=abc,abc` produces two `ListItem`s with the same `id`, which (a) breaks React's `key={it.id}` uniqueness in `ItemsByCategory`, (b) double-counts the item in `split_summary`'s `{items}` count and in `WhereToBuy`'s totals, and (c) means `remove(id)` removes both at once (filter matches all). **Required fix:** dedupe the parsed ids by value (e.g. `Array.from(new Set(ids))`) once, in `ListShareBody`, before the `byId` lookup — upstream of everything else in this spec, so `endedCount` and the case-matrix branches above are all computed from the deduped set. This is a straightforward bug fix, not a design trade-off; flagging it here because the "some ended" counting logic (A.3) is wrong without it.
- **Very long links:** no visual redesign needed — the drawer already scrolls (`overflow-y-auto`) and `ItemsByCategory` already groups. The only new requirement: cap the number of ids `parseListIds` will act on (recommend **200**, well above any realistic shared list) so a pathological or corrupted link can't force an unbounded `Map` lookup or render pass. IDs beyond the cap are treated exactly like "not found" — they fall into `endedCount`/the "not available" bucket, they are never a crash. A link truncated mid-ID by a sharing app (e.g. a message client wrapping the URL) produces one malformed trailing id; `parseListIds` already `.filter(Boolean)`s and the lookup already no-ops on an unknown id, so this needs no special-case code, only a test proving it (see acceptance criteria).

### A.7 Exact copy — new keys

All new keys live under the `list` namespace (both `en.json` and `de.json`; see Part B note on `fr`/`it` parity).

| Key | EN | DE |
|---|---|---|
| `list.expired_notice` | `{count, plural, one {# item from this link is no longer on offer.} other {# items from this link are no longer on offer.}}` | `{count, plural, one {# Artikel aus diesem Link ist nicht mehr im Angebot.} other {# Artikel aus diesem Link sind nicht mehr im Angebot.}}` |
| `list.notice_dismiss` | `Dismiss` | `Ausblenden` |
| `list.none_available_title` | `These items are no longer available` | `Diese Artikel sind nicht mehr verfügbar` |
| `list.none_available_body` | `The promotions in this link have ended. Here's what's on offer this week.` | `Die Aktionen in diesem Link sind abgelaufen. Das gilt diese Woche.` |
| `list.link_empty_title` | `Nothing to show` | `Nichts zum Anzeigen` |
| `list.link_empty_body` | `This link doesn't point to any items. Here's what's on offer this week.` | `Dieser Link enthält keine Artikel. Das gilt diese Woche.` |

Notes on tone: no "Sorry," no exclamation marks, no blame placed on the sender or the recipient — states a fact, then immediately offers the useful next step (Swiss understated tone, per project convention). `list.browse_deals` ("Browse deals" / "Aktionen ansehen") is reused verbatim as the CTA button label in both A.4 and A.5 — do not introduce a second "browse" label for the same action.

### A.8 Acceptance criteria (write these first — TDD)

1. **Given** a link with 2 ids, both matching current deals, **when** the page loads, **then** the drawer opens on `/deals` with both items, no notice banner is rendered.
2. **Given** a link with 2 ids, one matching a current deal and one matching no deal in this week's snapshot, **when** the page loads, **then** the drawer opens on `/deals` with exactly 1 item, and a notice banner reading the `one` form of `list.expired_notice` ("1 item...is no longer on offer.") is visible, focused, and announced (`role="status"`, `aria-live="polite"`).
3. **Given** a link with 3 ids where 2 don't match, **then** the notice uses the `other` ICU form with count 2.
4. **Given** a link with N ids where **none** match any current deal, **when** the page loads, **then** the page does **not** redirect, stays on `/list`, renders `list.none_available_title`/`body` and a `list.browse_deals` link to `/deals`, and does **not** call `useListStore.replaceAll` (an existing, unrelated list in the visitor's own storage must be untouched).
5. **Given** a link with an empty, missing, or purely-punctuation `items` param (e.g. `?items=` or `?items=,,,`), **when** the page loads, **then** the page stays on `/list` and renders `list.link_empty_title`/`body` (not the "no longer available" copy from case 4), with no store mutation.
6. **Given** a link with a repeated id (`?items=abc,abc`) where `abc` is current, **when** the page loads, **then** the resolved list contains exactly one item with id `abc` (not two), and `split_summary`'s `{items}` count is 1.
7. **Given** a link with a repeated id where the id does not match any current deal, **when** the page loads, **then** it is counted once (not twice) toward "all ended" / `endedCount`.
8. **Given** a link with more than the parse cap (200) of comma-separated ids, **when** the page loads, **then** the page does not hang or error; ids beyond the cap are treated as not-found.
9. **Given** the notice banner is showing and the user clicks its dismiss control, **when** they later close and reopen the drawer in the same session, **then** the notice does not reappear.
10. **Given** the notice banner's dismiss control, **then** it has a minimum 44×44px hit area and a visible focus ring.
11. **Given** slow network conditions (redirect delayed), **when** a screen reader user lands on `/list`, **then** no message is announced and then silently lost mid-utterance by the navigation — the durable notice only exists post-redirect, on `/deals`.

---

## Part B — Pluralisation (ICU) fixes

### B.0 Method

Every message key using a bare count was grepped from `en.json`/`de.json` (`grep -n '{' `). Each call site was checked in the `.tsx`/`.ts` file that calls `t(...)` to confirm the actual parameter name and to confirm whether the count can realistically be 0 or 1 in production, so the fix isn't guessed from the string alone (per the "verify before asserting" standard).

### B.1 Fixes required

| Key | Call site (verified) | Current | New EN (ICU) | New DE (ICU) |
|---|---|---|---|---|
| `home.stat` | `VerdictHero.tsx`: `t('stat', { deals: snapshot.totalDeals, stores: activeStores.length })` — `stores` **is** reachable at 1 (a week where only one retailer has any deals at all) | `Based on {deals} deals across {stores} Swiss stores.` | `Based on {deals, plural, one {# deal} other {# deals}} across {stores, plural, one {# Swiss store} other {# Swiss stores}}.` | `Basierend auf {deals, plural, one {# Aktion} other {# Aktionen}} aus {stores, plural, one {# Schweizer Laden} other {# Schweizer Läden}}.` |
| `category_card.avg_off` | `CategoryVerdictCard.tsx`: `t('avg_off', { pct, count: verdict.dealCount })` — `dealCount` is 1 whenever a category has exactly one deal (common) | `avg {pct}% off · {count} deals` | `avg {pct}% off · {count, plural, one {# deal} other {# deals}}` | `ø {pct}% Rabatt · {count, plural, one {# Aktion} other {# Aktionen}}` |
| `deals.subline` | `deals` page header: `t('subline', { date, count })` — filtered deal count, reachable at 0 or 1 after filters narrow the list | `Updated {date} · {count} deals` | `Updated {date} · {count, plural, =0 {no deals} one {# deal} other {# deals}}` | `Aktualisiert {date} · {count, plural, =0 {keine Aktionen} one {# Aktion} other {# Aktionen}}` |
| `list.split_summary` | `list/page.tsx` and `ListDrawer.tsx`: `t('split_summary', { items, stores })` — confirmed live bug, both counts reachable at 0 and 1 | `Your {items} items split best across {stores} stores:` | `{items, plural, =0 {No items} one {Your # item} other {Your # items}} split best across {stores, plural, one {# store} other {# stores}}:` | `{items, plural, =0 {Keine Artikel} one {Dein # Artikel} other {Deine # Artikel}} verteilen sich am besten auf {stores, plural, one {# Laden} other {# Läden}}:` |
| `variant_picker.stale_strip` | **No call site found** in any `.tsx` (grepped project-wide) — orphaned key, not currently rendered anywhere. Fix it anyway for whenever it's wired up; also flag for removal consideration (see B.3). | `Updated {n} days ago` | `{n, plural, one {Updated # day ago} other {Updated # days ago}}` | `{n, plural, one {Aktualisiert vor # Tag} other {Aktualisiert vor # Tagen}}` |
| `availability.aria_b_days` | `AvailabilityStrip.tsx`: `t('aria_b_days', { store, n: age.value })` — `ageFromTimestamp` guarantees `value = Math.max(1, days)`, so `n` is **never 0** here; still needs the `one`/`other` split (n=1 is common: "yesterday") | `{store}. Last on deal {n} days ago. Tap to see details.` | `{store}. Last on deal {n, plural, one {# day} other {# days}} ago. Tap to see details.` | `{store}. Vor {n, plural, one {# Tag} other {# Tagen}} im Angebot. Tippe für Details.` |
| `availability.aria_b_weeks` | same component, same call, `unit === 'weeks'` — `value = Math.floor(days/7)` for `days` 7–27, so `n` ranges **1–3**, never 0 | `{store}. Last on deal {n} weeks ago. Tap to see details.` | `{store}. Last on deal {n, plural, one {# week} other {# weeks}} ago. Tap to see details.` | `{store}. Vor {n, plural, one {# Woche} other {# Wochen}} im Angebot. Tippe für Details.` |
| `availability.aria_b_months` | same component, `unit === 'months'` — **see B.2, real bug found**, `n` CAN be 0 | `{store}. Last on deal {n} months ago. Tap to see details.` | `{store}. Last on deal {n, plural, =0 {this month} one {# month} other {# months}} ago. Tap to see details.` | `{store}. Vor {n, plural, =0 {kurzem} one {# Monat} other {# Monaten}} im Angebot. Tippe für Details.` |

### B.2 Related bug found while verifying `aria_b_months` (flag, not a copy fix alone)

`lib/freshness-format.ts`, `ageFromTimestamp`:
```
if (days <= 27) return { value: Math.floor(days / 7), unit: 'weeks' }
if (days <= 89) return { value: Math.floor(days / 30), unit: 'months' }
```
For `days === 28` or `29`, `Math.floor(days / 30) === 0`, producing `unit: 'months', value: 0` — today this renders as "Last on deal 0 months ago," an actual defect independent of pluralisation. The ICU fix above adds an `=0` form as a safety net ("this month" / "vor kurzem" — worded to still be true even if the off-by-few threshold is never touched), but the **real fix** is a Tech Lead / Builder call: either extend the weeks bucket to `days <= 29` (so months starts clean at `floor(30/30)=1`) or change the months calculation to `Math.floor(days / 30) || 1`. Escalating this as a technical finding rather than deciding it myself — Tech Lead decides technical (CLAUDE.md Universal Resolution Loop). Whichever fix lands, keep the `=0` ICU form regardless: it costs nothing and prevents a silent regression if the threshold ever drifts again.

### B.3 Flags — no fix needed / needs a decision

- **`list.item_one` / `list.item_other` — used correctly, no fix needed.** `ListDrawer.tsx` uses them as a manual ternary (`t(arr.length === 1 ? 'item_one' : 'item_other')`), not as ICU `{count, plural}` interpolation — the count itself is rendered separately (`{arr.length}`). Both EN and DE only need a one/other split with no embedded number, which is exactly what's there. This pattern is correct for a two-form language; leave as-is.
- **`deals.from_n_items` — verified NOT a pluralisation bug; do not touch.** `isMultiBuy` (`lib/domain/quantity-requirement.ts`) is a hard invariant enforced at the database CHECK-constraint level (`deals_min_quantity_at_least_two`): `minQuantity` is `null`/`undefined` (no label at all) or **always ≥ 2**. The string can never render with count 1 or 0 in production. Converting it to `{count, plural, ...}` would also require touching `lib/format.ts`'s independently-duplicated `MIN_QUANTITY_TEMPLATE` (kept separate on purpose, per that file's own comment, for bundle-size reasons) and would break `format.test.ts`'s `.replace('{count}', '2')` pinning, which does a literal substring match and would silently no-op against ICU syntax. Recommendation: leave both copies as plain templates. If a real need for the `one` form ever appears, update both `messages/*.json` and `lib/format.ts`'s template together and switch `format.test.ts` off literal `.replace` — but that day is not today.
- **`variant_picker.stale_strip` — orphaned key.** Not called from any component today (verified by project-wide grep). The ICU fix in B.1 future-proofs it, but flag to PM/Tech Lead: either wire it up somewhere (e.g. the variant picker sheet showing last-updated freshness) or remove it — an unused, unpluralised key sitting in the messages file is exactly the kind of drift this whole exercise is meant to catch.
- **`filters.reset` (`"Reset ({count})"`)** and **`filters` count generally** — not a plural bug. The number sits in parentheses as a raw counter (no noun inflected around it, in either language), so there is nothing to pluralise. Left out of the fix list deliberately.
- **The task brief refers to "`verdict.stat`."** No `verdict` namespace exists; the stat line living under `home.stat` (rendered by `VerdictHero.tsx`, which is the app's "verdict" section) is the intended target — treated as such throughout this spec.
- **`fr.json` / `it.json` parity.** These two locales carry the same `stale_strip`, `aria_b_days/weeks/months`, `from_n_items` keys (confirmed by grep) but were out of scope for this brief (EN/DE only, per instructions). Flag for the PM: once EN/DE ship, French and Italian have the identical "1 jours"/"1 giorni fa" bug and should get the equivalent ICU treatment in the same pass, not left to rot — not authored here since it wasn't asked for.

### B.4 Acceptance criteria (write these first — TDD)

1. **Given** `home.stat` rendered with `deals: 1, stores: 1`, **then** the output reads "Based on 1 deal across 1 Swiss store." (EN) / "Basierend auf 1 Aktion aus 1 Schweizer Laden." (DE) — never "1 deals"/"1 stores".
2. **Given** `category_card.avg_off` rendered with `count: 1`, **then** output reads "...· 1 deal" (EN) / "...· 1 Aktion" (DE).
3. **Given** `deals.subline` rendered with `count: 0`, **then** output reads "...no deals" (EN) / "...keine Aktionen" (DE); with `count: 1`, "...1 deal"/"...1 Aktion".
4. **Given** `list.split_summary` rendered with `items: 1, stores: 1`, **then** output reads "Your 1 item split best across 1 store:" (EN) / "Dein 1 Artikel verteilt sich am besten auf 1 Laden:" (DE) — this is the exact live-site bug from the PM's manual test; with `items: 0, stores: 0`, output reads "No items split best across 0 stores:" and this combination must never be reachable in the UI per Part A (case 3/4 don't render this string at all — regression test should assert `split_summary` is not called for an empty resolved list).
5. **Given** `availability.aria_b_days` with `n: 1`, output reads "...Last on deal 1 day ago..." (EN) / "...Vor 1 Tag im Angebot..." (DE); with `n: 3`, "...3 days ago"/"...3 Tagen".
6. **Given** `availability.aria_b_months` with `n: 0` (regression test named after the `ageFromTimestamp` day-28/29 defect, B.2), output reads "...Last on deal this month..." (EN) / "...vor kurzem im Angebot..." (DE), never "0 months ago" / "0 Monaten".
7. **Given** every `.json` message file in `messages/`, a lint/test step confirms every value containing a bare `{word}` placeholder that is also referenced as a `count`/`n`/plural-shaped variable at its call site is wrapped in `{var, plural, ...}` ICU syntax — codifies this whole exercise so a future key can't reintroduce the bug silently.

---

## Summary for the Builder

- **Part A** needs one new prop on `HydrateAndRedirect` (`endedCount`), one new `ui-store` field (dismissible list notice), one new banner component/block inside `ListDrawer`, a branch in `ListShareBody` that skips the redirect entirely for cases 3/4, and a dedupe fix in id parsing that case 5 depends on for correct counting.
- **Part B** is a messages-file-only change for the 7 keys in B.1, plus the `ageFromTimestamp` off-by-few fix flagged in B.2 (Tech Lead to pick the exact fix), plus the `stale_strip` disposition decision flagged in B.3.
- All new/changed copy is in the tables above, EN and DE, ready to paste into `messages/en.json` / `messages/de.json`.
- Zero open findings before Build, per the Universal Resolution Loop — this draft goes to the Design Challenger next.

---

## Tech Lead ruling (2026-09-27)

### TL.1 Freshness bucketing — RCA

`lib/freshness-format.ts` `ageFromTimestamp`: the weeks bucket ends at day 27 but the months bucket divides by 30, so days 28–29 fall into `months` with `floor(28/30) = 0`. The two buckets' edges were never aligned. Consumers: `AvailabilityStrip.tsx` (short label `age_short_*`, aria `aria_b_*`) and `AvailabilityCellSheet.tsx` (`b_header_*`). None re-derive the buckets — they only read `age.unit`/`age.value`, so fixing the function fixes all three surfaces. No test file exists for this function today (`lib/freshness-format.test.ts` is missing) — that is part of the root cause.

Second latent defect found: an unparseable `iso` string makes `days = NaN`; every `<=` check is false, so it falls through to `{ unit: '3plus' }` — it silently says "not on deal for 3+ months" for bad data. It must return `null` (the same as a missing timestamp).

### TL.2 Decision — extend the weeks bucket to day 29

| days | unit | value |
|---|---|---|
| < 0 (clock skew / future timestamp) | days | 1 |
| 0–6 | days | max(1, days) |
| 7–29 | weeks | floor(days / 7) → 1–4 |
| 30–89 | months | floor(days / 30) → 1–2 |
| ≥ 90 | 3plus | 3 |
| invalid ISO / null | — | `null` |

Why this and not `floor(days/30) || 1`: 28–29 days is exactly or just over 4 weeks, so "4 weeks" is true, while "1 month" at day 28 rounds up, which breaks the "honest, low-precision, never overstate" rule in the file's own header. It also keeps the function readable: every bucket's lower edge produces value ≥ 1 by construction, with no `|| 1` patch.

Invariant to assert: for every unit except `3plus`, `value >= 1` — no input can produce 0. Day 0 stays at "1 day" (no new "today" copy key; with the ICU `one` form from B.1 it renders "1 day", which is grammatical). Keep the Designer's `=0` ICU safety form in `aria_b_months` as recommended — it costs nothing.

### TL.3 Tests the Builder writes FIRST (`lib/freshness-format.test.ts`, table-driven, fixed `now`)

One `it.each` row per boundary day, where `iso = now − days × 86 400 000 ms`:

| days | expected |
|---|---|
| -1 | `{days, 1}` |
| 0 | `{days, 1}` |
| 1 | `{days, 1}` |
| 6 | `{days, 6}` |
| 7 | `{weeks, 1}` |
| 13 | `{weeks, 1}` |
| 14 | `{weeks, 2}` |
| 27 | `{weeks, 3}` |
| 28 | `{weeks, 4}` ← regression (was months 0) |
| 29 | `{weeks, 4}` ← regression (was months 0) |
| 30 | `{months, 1}` |
| 59 | `{months, 1}` |
| 60 | `{months, 2}` |
| 89 | `{months, 2}` |
| 90 | `{3plus, 3}` |
| 365 | `{3plus, 3}` |

Plus:
- `null` → `null`; `'not-a-date'` → `null` (NaN regression).
- Partial-day flooring: `now − (6 days + 23 h)` → `{days, 6}`; `now − (29 days + 23 h)` → `{weeks, 4}`.
- Property sweep: for every days in 0..400, `unit === '3plus' || value >= 1`.
- One render test in `AvailabilityStrip` at day 28: the aria-label/short label contains "4" + weeks copy and never "0".

### TL.4 Duplicate IDs and the 200-id cap — where they belong

> **Superseded in part (coordinator note, 2026-09-27):** the rule that over-cap ids are counted as "not found" / ended is replaced by Design Challenger M4 and the Architect's `2026-09-27-architect-shared-list-separate-view.md` (test 1: "Overflow is not counted as unavailable"). The mechanism below — `parseListIdsDetailed` returning `{ ids, overflow }` — stands. The binding spec is `2026-09-27-shared-list-view-spec.md`.

**Ruling: dedupe + cap in the parser (`lib/share-url.ts`), plus a defensive dedupe in the store. Not in the page.**

1. **`parseListIds` owns the URL contract** (§13.2 lives in that file). Every caller should get clean, unique, bounded ids, and the pure function is the cheapest place to test it. Putting it in `ListShareBody` / `page.tsx` would mean any future caller (share-target, previews) re-implements it.
   - Order: split → trim → safe-decode → drop empty → dedupe (first wins, keeps original order) → cap at `MAX_SHARED_LIST_IDS = 200` (exported constant).
   - The spec (A.6) wants over-cap ids counted as "not found" in `endedCount`. A plain `string[]` return loses that count, so add `parseListIdsDetailed(raw): { ids: string[]; overflow: number }` (overflow = unique ids dropped by the cap), and keep `parseListIds(raw)` as a thin wrapper returning `.ids`, so existing callers and tests don't change. The page computes `endedCount = (ids.length − resolved.length) + overflow`.
   - **New hardening found (same function):** `decodeURIComponent` throws `URIError` on a malformed escape such as a link cut off mid-`%E2%8`. Next.js already decodes `searchParams` once, so any id containing a literal `%` also throws. That crashes the server render instead of falling into case 3/4. Wrap the decode per id in try/catch and drop the id on failure. This is exactly the "truncated tail" case A.6 assumed was already safe; it is only safe while the tail doesn't end in `%`.
2. **`list-store.replaceAll` must also dedupe by `id`** (first wins). `add` already guards duplicates; `replaceAll` is the only write path that can break the store invariant "ids are unique", and the store should own that invariant rather than trust every caller. It also cleans up any duplicate lists already persisted in visitors' localStorage from earlier links. It stays a cheap O(n) Set pass. No cap in the store — the cap is a URL-input concern.
3. The page (`ListShareBody`) does not dedupe itself; it relies on (1). Keep the Designer's correctness requirement: no `replaceAll` when zero items resolve (cases 3/4).

**Tests first:**
- `share-url.test.ts`: `'a,a,b'` → `['a','b']`; `'b,a,b'` → `['b','a']` (order kept); 250 unique ids → 200 ids, overflow 50; 250 entries with 60 dupes → dedupe **before** cap (190 unique → overflow 0); `'a,%E2%8'` → `['a']` with no throw; `'a,100%'` → `['a']`; `''` / `null` / `',,,'` → `[]`.
- `list-store` test: `replaceAll([x, x, y])` → items `[x, y]`; `remove(x.id)` afterwards leaves `[y]`.
- Page/integration (A.8 #8): 250 ids with 10 matching → `endedCount` includes the 50 over-cap ids and it renders without error.

---

## Design Challenger review (2026-09-27)

**Verdict: NOT ready for Build.** Case matrix and root-cause framing are strong; the dedupe and "don't `replaceAll([])`" catches are correct. But 5 MUST-CHANGE items — two ICU strings are grammatically broken, one copy line contradicts the spec's own honesty rule, the 200-cap rule mislabels items, and the proposed focus mechanism will race Vaul/Radix. One PM decision blocks Part A (overwriting the recipient's own list).

Evidence read: `list/page.tsx`, `share-url.ts`, `list-store.ts` (l.126 `replaceAll: (items) => set({ items })`, persisted via `persist` to localStorage), `HydrateAndRedirect.tsx`, `ListDrawer.tsx` (Vaul, `direction` right/bottom, `Vaul.Close` in header), `ui-store.ts` (not persisted), `messages/de.json`, `i18n/routing.ts` (`localePrefix: 'as-needed'`), `app/robots.ts` (`/list` only reachable via shared link — so case-4 copy "This link…" is safe).

### MUST-CHANGE

**M1 — `availability.aria_b_months` EN renders "this month ago".** `Last on deal {n, plural, =0 {this month} …} ago` → n=0 reads "Last on deal this month ago." Move "ago" inside every branch:
EN `{store}. Last on deal {n, plural, =0 {recently} one {# month ago} other {# months ago}}. Tap to see details.`
DE is fine grammatically (`Vor kurzem im Angebot`) but align wording: `{store}. {n, plural, =0 {Vor kurzem} one {Vor # Monat} other {Vor # Monaten}} im Angebot. Tippe für Details.`
Also: "this month" is not true for day 28/29 (can be the previous calendar month) — "recently"/"vor kurzem" is honest in both. B.4 #6 must be updated to the new EN text. Root-cause fix in `ageFromTimestamp` stays mandatory (Tech Lead picks; recommend weeks bucket `days <= 29` so months starts at 1).

**M2 — `list.split_summary` subject/verb agreement is broken in both languages.**
- EN `one {Your # item} … split best across` → "Your 1 item split best…" (needs "splits"; and "1 item split across 1 store" is meaningless).
- DE `one {Dein # Artikel} … verteilen sich` → "Dein 1 Artikel verteilen sich" (singular subject, plural verb). B.4 #4 even expects "verteilt sich" — the table and the test disagree.
- Also "Your 3 items split best across 1 store" reads oddly when stores=1.
Use a nested select so the verb lives inside each branch. **ICU gotcha for the Builder:** inside a nested plural, `#` refers to the *innermost* argument, so the outer count must be written as `{items}` explicitly:
EN `{items, plural, =0 {No items yet} one {Your item is cheapest here:} other {{stores, plural, one {Your {items} items are cheapest at one store:} other {Your {items} items split best across # stores:}}}}`
DE `{items, plural, =0 {Noch keine Artikel} one {Dein Artikel ist hier am günstigsten:} other {{stores, plural, one {Deine {items} Artikel sind in einem Laden am günstigsten:} other {Deine {items} Artikel verteilen sich am besten auf # Läden:}}}}`
Add B.4 tests for (1,1), (3,1), (3,2) in both locales.

**M3 — "Ended"/"expired" copy overclaims — contradicts A.0 point 1 (Rams #6).** `endedCount` includes unrecognised/mangled ids (A.6 truncated tail) and beyond-cap ids, yet the copy says "have ended" / "abgelaufen" / "no longer available" / "nicht mehr verfügbar" ("verfügbar" also implies stock, which we don't know). Say only what we know: *not in this week's offers.*
| Key | EN | DE |
|---|---|---|
| `list.expired_notice` | `{count, plural, one {# item from this link isn't on offer this week.} other {# items from this link aren't on offer this week.}}` | `{count, plural, one {# Artikel aus diesem Link ist diese Woche nicht im Angebot.} other {# Artikel aus diesem Link sind diese Woche nicht im Angebot.}}` |
| `list.none_available_title` | `None of these items are on offer this week` | `Keiner dieser Artikel ist diese Woche im Angebot` |
| `list.none_available_body` | `Offers change every week. Here's what's on offer now.` | `Die Aktionen wechseln jede Woche. Das ist aktuell im Angebot.` |
| `list.link_empty_body` | (EN ok) | `Dieser Link enthält keine Artikel. Das ist aktuell im Angebot.` |
DE "Das gilt diese Woche." (current draft) is unclear — "what applies?" — replace as above. Consider renaming the key `expired_notice` → `unavailable_notice` so code doesn't encode the overclaim either.

**M4 — 200-id cap misreports real items as unavailable.** `list-store.add` has **no size cap**, so a real sender list can exceed 200; items 201+ would be *current* deals shown to the recipient as "not on offer" — a false statement. Fix: one shared constant `MAX_LIST_ITEMS = 200` enforced in both `list-store.add` (sender side — can't build a list the link can't carry) and `parseListIds` (recipient side, guards hand-made links). Beyond-cap ids from a hand-made link are then pathological and may be dropped silently (not counted into `endedCount`). Add acceptance test: store refuses the 201st add (with a visible message key, e.g. `list.full` — Designer to author). URL length sanity: check id length × 200 stays under Vercel's URL limit and WhatsApp/SMS link-wrapping — Tech Lead to verify with the real id format.

**M5 — Focus mechanism will race Vaul (Radix Dialog) autofocus.** A `useEffect` calling `ref.current?.focus()` runs when the banner mounts, then Radix's `onOpenAutoFocus` moves focus to the first focusable element (the header Close button) — or the effect fires before the portal content exists. Result: focus lands on Close, and the banner's `role="status"` rendered *with* content on mount is often **not** announced (live regions announce *changes* to an existing region, not initial content). So neither mechanism is reliable as specified. Replace with: on `Vaul.Content`, `onOpenAutoFocus={(e) => { if (notice) { e.preventDefault(); bannerRef.current?.focus() } }}`; banner `tabIndex={-1}`, **no** `aria-live` (focus announcement is sufficient; live + focus double-announces). Alternatively reference the banner from `Vaul.Description`'s `aria-describedby` so it's read with the dialog title. Test: with notice present, `document.activeElement` is the banner after open (not the Close button).

### SHOULD-CHANGE

**S1 — Two "X" buttons stacked in the top-right** (drawer `Vaul.Close` in header, banner dismiss directly below). Norman mapping: users will tap the wrong one and close the whole drawer. Make the banner dismiss a text button ("OK" / "OK", or `list.notice_dismiss` "Got it" / "Verstanden") on the right, still `min-h-11`. Text is less ambiguous than a second X.

**S2 — Tell the recipient *which* items are gone? (benchmark).** Google Keep and Amazon shared lists keep unavailable items **in place, greyed, with name** ("Currently unavailable"), so the recipient can act ("buy the milk elsewhere"). We can't: the URL carries ids only, so the notice can only give a count. That's acceptable for v1 and the spec is honest about it — but record it as a known limit. Future option (PM, not now): carry a short name per id in the link, or keep an id→name archive of past snapshots, so ended items render struck-through with "not on offer this week". Relevant to the product goal (forwardable shopping list) — the recipient still needs to buy those items.

**S3 — Locale of link vs recipient.** `buildShareUrl` bakes the sender's locale into the path (`/list` = DE, `/en/list` = EN); `localePrefix: 'as-needed'` with default locale detection may redirect a recipient. Add acceptance tests: (a) DE link opened by an EN-preference browser keeps `?items=` through any middleware redirect and resolves the same items; (b) notice/empty-state copy renders in whichever locale the page finally renders in; (c) `productName` stored in the recipient's list is in the rendered locale (snapshot is fetched with `locale`).

**S4 — Case 2 with zero resolved but also `stores` count:** after M2, confirm `split_summary` is never rendered on `/list` at all — the current pre-redirect `<h1>` shows it on `/list` before `useEffect` fires (and screen readers start reading it, exactly the A.0 point 2 problem). Replace that h1 with a neutral "Opening your list…" / "Liste wird geöffnet…" (new key), not the summary.

**S5 — `aria_b_days` n=1:** "1 day ago" / "Vor 1 Tag" is correct but "yesterday" / "gestern" is what a person says. Optional: `one {yesterday}` / `one {Gestern}`. Low cost, better tone.

**S6 — Banner in drawer: is it seen?** Yes — verified: drawer opens on `/deals` via global (non-persisted) `ui-store`, banner sits at top of content under the header on both bottom-sheet (max-h 90vh) and right panel. No change needed, but add one acceptance test that the banner is inside the viewport on 320px without scrolling the drawer.

**S7 — Meta-test (B.4 #7) as written is not implementable and will false-positive.** "Referenced as a count at its call site" requires parsing TSX call sites — nobody will build that. And a naive `{word}` lint flags `{store}`, `{price}`, `{pct}`, `{date}`, plus the deliberately-bare `filters.reset` `{count}` and `deals.from_n_items` `{count}`. Specify instead:
1. Parse every message with `@formatjs/icu-messageformat-parser` (already in `node_modules`) — not regex; it handles nesting and `#`.
2. Walk the AST; any `argument`/`number` element whose **name** is in a count-name set (`count, n, items, stores, deals, days, weeks, months`) and is **not** inside a `plural` ancestor → fail.
3. Explicit exemption list with reason, in the test file: `filters.reset` (raw counter in parentheses), `deals.from_n_items` (min 2, DB CHECK constraint; mirrored in `lib/format.ts`). Any new exemption needs a reason string.
4. Every `plural` must have an `other` branch; EN/DE (and fr/it) must have identical key sets and identical argument names per key.
5. Complement with a render test: every plural key formatted with 0, 1, 2 in each locale via `next-intl`'s formatter, asserting no output contains `" 1 "` followed by a plural noun from a small list (`deals|items|stores|days|Tagen|Aktionen|Läden|Monaten|Wochen`). Catches M1/M2-type grammar bugs the AST lint can't.
Non-count placeholders are never flagged because the set is name-based.

### PM DECISION NEEDED (blocks Part A)

**P1 — A shared link silently replaces the recipient's own saved list.** `replaceAll: (items) => set({ items })` + `persist` → if Sarah has 8 items saved and taps a link from her partner, her 8 items are gone from localStorage with no warning and no undo. This happens in the **normal** case 1, not just the edge cases — the spec only protects cases 3/4. No world-class product does this: Google Keep adds a shared note *alongside* yours; Amazon opens a shared list as a *separate* list with "Add to cart / Add to my list". Options:
- **(a) Ask when it matters** — if recipient's list is non-empty and differs from the incoming ids, show a choice in the drawer: "Replace my list" / "Add to my list" (merge by id). Empty list or same ids → no prompt. Most honest; one extra tap only when there's a conflict.
- **(b) Replace + Undo** — keep replacing, show "Your previous list was replaced. Undo" in the same banner slot (keep the old items in `ui-store` for the session). Zero extra taps; recoverable.
- **(c) Always merge** by id. Never destructive, but mixes two people's lists without telling anyone.
- **(d) Keep as-is** (silent replace) — not recommended; data loss.
Challenger recommendation: **(b)** for v1 (smallest change, reuses this spec's banner, non-destructive), (a) if the PM expects frequent two-way sharing in households. Either way the spec must add acceptance tests for "recipient already has a list".

### OK (no change)

- Case matrix structure; separating case 3 vs 4 copy; not redirecting on zero items; not calling `replaceAll([])` (correctness requirement, correctly flagged).
- Dedupe with `new Set` before lookup, upstream of `endedCount` (verified: `replaceAll` has no id check, `add` does).
- Banner visual: neutral tokens, `Info` icon, no red, no colour-only meaning, 44px target. Swiss tone of the rest of the copy: no "Sorry", no exclamation marks.
- Notice in non-persisted `ui-store`, dismiss persists for the session.
- ICU strings verified correct: `home.stat` EN/DE (`aus 1 Schweizer Laden` / `aus 3 Schweizer Läden` — dative correct), `category_card.avg_off`, `deals.subline` (=0/one/other), `variant_picker.stale_strip` (`vor # Tag` / `vor # Tagen`), `aria_b_days` (`Vor # Tag` / `Vor # Tagen`), `aria_b_weeks` (`Vor # Woche` / `Vor # Wochen`), DE `aria_b_months` one/other (`Vor # Monat` / `Vor # Monaten`). Dative after "vor" correct throughout. `Artikel` invariant sg/pl — correct. No `ß` (Swiss convention) — correct. Du-form consistent with existing `de.json` (0 "Sie/Ihr" occurrences).
- B.3 flags (`item_one/other`, `from_n_items`, `filters.reset`, `stale_strip` orphan, fr/it parity) — correct and well-evidenced.

### Resolution checklist for the Designer
M1, M2, M3, M4, M5 fixed in the spec tables + B.4/A.8 tests updated → P1 decided by PM → S1–S7 accepted or rejected with reason → back to Challenger for a zero-findings pass.
