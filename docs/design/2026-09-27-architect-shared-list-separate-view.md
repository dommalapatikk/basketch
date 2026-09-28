# Shared list as a separate view — Architecture

- **Date:** 2026-09-27
- **Author:** Solution Architect
- **Status:** Proposed. Design only. No code has been written.
- **Input:** `docs/design/2026-09-27-shared-list-expiry-and-plurals.md` (Part A, TL.4, Design Challenger review P1)
- **PM decision (in principle, 2026-09-27):** opening a shared link must **not** replace or merge into the recipient's own list. The two lists stay separate.

## 1. Problem today (verified in code)

`/list?items=…` → `ListShareBody` (`web-next/src/app/[locale]/list/page.tsx`) resolves the ids against the snapshot. It then renders `HydrateAndRedirect`, which calls `useListStore.replaceAll(items)` (`stores/list-store.ts:126`, `set({ items })`). That store is persisted to localStorage. The component then opens the drawer and calls `router.replace('/deals')`. Result: the recipient's own saved list is overwritten, with no warning and no undo. Most of the spec's hard problems come from this redirect-and-hydrate shape:
- the notice has to survive a redirect (A.0 point 2, A.8 #11);
- the focus race with Vaul (M5);
- the `split_summary` h1 read out and then lost (S4);
- the rule "don't `replaceAll([])`" (A.4).

## 2. Decision

**The shared link renders the shared list itself, read-only, on `/list`. Loading the link writes nothing. The URL is the only state. Copying into your own list happens only through an explicit action.**

This is the "send a copy" model. A live shared list, where both people edit one list, needs server storage and accounts. basketch has neither, and that is right for the free tier and the no-accounts product. So we do not imitate live collaboration. We give the recipient a view of the sender's list, plus clear ways to take items from it.

### Benchmark (publicly known product behaviour; not re-tested today)

| Product | What a shared link does to the recipient's own data | What we take from it |
|---|---|---|
| Google Keep | The shared note appears **alongside** the recipient's own notes. It never replaces one. (Live collaboration, needs a Google account.) | Never touch the recipient's existing content. |
| Amazon shared lists | Opens the sender's list as a **separate list**. Per-item actions such as "Add to Cart" let the viewer take items. | Separate view plus per-item and all-items actions. |
| Apple Reminders | A shared list is joined by **invitation** and shows as a separate list. Own lists are untouched. (Live, needs Apple ID.) | Clear ownership labels: "shared" vs "mine". |
| Google Docs `/copy` links | The link opens a preview, and the user chooses **"Make a copy"**. | Copying is an explicit, named action, never a side effect of opening. |

None of these products writes into the recipient's own data just because a link was opened. That is the invariant below.

## 3. Invariants

- **I1:** Rendering `/list` never writes to `useListStore` or to localStorage. This is enforced by construction: the shared view does not import the store's write actions. An architecture test (§9) checks it.
- **I2:** The recipient's list changes only through an explicit user action on `/list`, and every such action can be undone for the session.
- **I3:** The shared view is a pure function of `(ids from URL, today's snapshot, locale)`. Reload, back/forward and re-sharing all reproduce it exactly.
- **I4:** Both lists hold unique ids and at most `MAX_LIST_ITEMS = 200` items. This is one shared constant (Challenger M4, TL.4).

## 4. Components and data flow

```
URL /list?items=a,b,c   (or /en/list?items=…)
  └─ page.tsx (server, dynamic hole because it reads searchParams; noindex stays)
       today = todayInZurich()  → getWeeklySnapshot({ locale, today })   [RCA D1]
       parsed   = parseListIdsDetailed(raw)            lib/share-url.ts   {ids, overflow}  (TL.4)
       resolved = resolveSharedList(parsed, snapshot)  NEW, pure          {available: ListItem[], unavailableCount, state}
       └─ <SharedListView resolved locale today>   server-rendered, read-only
             ├─ header: "Shared list" / "Geteilte Liste" + summary (split_summary, fixed per M2)
             ├─ <UnavailableNotice count>            static text, no live region needed (no redirect)
             ├─ <ItemsByCategory items readOnly>     extracted from ListDrawer, pure props
             ├─ <WhereToBuy items>                   extracted from ListDrawer, pure props
             └─ <SharedListActions items>  (client island; the ONLY code that touches the store)
                   "Add all to my list" · per-item "Add" · "Replace my list" (conditional) · "Open my list"
Header MyListButton / ListDrawer: unchanged. They always show the visitor's OWN list.
```

- **`resolveSharedList`** is a pure domain function. It returns `state: 'ok' | 'partial' | 'none-available' | 'link-empty'`, which are the spec's cases 1–4. This replaces the branching that A.1 scattered across the page, the redirect and the drawer.
- **Presentational reuse.** `ItemsByCategory` and `WhereToBuy` currently live inside `ListDrawer.tsx` (l.184, l.264). Move them to their own files (one component per file, per CLAUDE.md), taking `items` as props and a `readOnly` flag that hides the remove buttons. The drawer and the shared view then render items the same way.
- **Delete** `HydrateAndRedirect`, and the `ui-store` `listNotice` the spec proposed. There is no redirect left to survive.

## 5. Actions (the only writes)

A new pure function in the store's domain module:

`mergeLists(own, incoming, cap) → { items, added, alreadyPresent, rejectedByCap }`

It dedupes by id (first wins), keeps the existing order, and appends new items. It is unit-tested without React.

| Action | When shown | Effect | Feedback |
|---|---|---|---|
| **Add all to my list** (primary) | Always, when at least 1 item is available | `mergeLists(own, available, 200)` | Inline status: "3 added · 2 already in your list" / "3 hinzugefügt · 2 schon in deiner Liste". If some were rejected: "Your list is full (200)". Button: **Open my list** (opens the drawer, no navigation). **Undo** is available for the session. |
| **Add** (per item) | Each row. Becomes "In your list ✓" (disabled) when the id is already in the own list. | Merge one item. | Row state changes. Undo is not needed, because remove exists in the drawer. |
| **Replace my list with this** (secondary, text-style) | Only when the own list is **non-empty and differs** from the shared ids | `replaceAll(available)` after keeping the old list in session state | "Your list was replaced. **Undo**". Undo restores the previous items (Challenger P1 option b, now opt-in instead of silent). |
| **Browse deals** | Cases `none-available` / `link-empty` (and as a footer link) | Navigate to `/deals` | — |

If the own list is empty, show only one primary button, labelled "Save as my list" / "Als meine Liste speichern". Merge and replace give the same result in that case, so offering both would be a pointless choice.

**Hydration.** The zustand `persist` store rehydrates on the client, so the server cannot know the recipient's own list. `SharedListActions` renders its buttons as neutral and disabled until the store reports it has hydrated (`persist.hasHydrated()` / `onFinishHydration`). Only then does it show "already in your list" states and the conditional Replace button. This avoids a hydration mismatch, and it avoids offering Replace to someone whose list is still loading. Everything else on the page renders on the server and needs no JavaScript.

## 6. Interaction with the rest of Part A

| Spec item | With the separate view |
|---|---|
| Case 1 (all current) | Shows the list. No notice. |
| Case 2 (some not on offer) | Static notice above the list, using the Challenger M3 wording ("isn't on offer this week"). It is part of the page content, so a screen reader reads it in order. It needs no `aria-live` and no focus handling. **M5 is gone, and so are A.8 #9 and #11** (no drawer, no redirect). There is no dismiss button either, so the **S1** two-X problem also goes away. |
| Case 3 / 4 | Same page, with `state` choosing the copy. No store mutation, by construction (I1), not by a special-case `if`. |
| Dedupe, 200 cap, `%` decode hardening | Unchanged: owned by `parseListIdsDetailed` (TL.4). Over-cap ids from a hand-made link are dropped silently (M4). The same cap governs `mergeLists`. |
| S2 (which items are gone) | Still a known limit, because the link carries ids only. The notice gives a count. Unchanged. |
| S3 (locale) | The page renders in the URL's locale. `ListItem.productName` comes from the snapshot in that locale, so items the recipient adds are stored in the language they were viewing. Tests: the `?items=` query survives the next-intl `as-needed` locale redirect (`proxy.ts`), and a DE link opened in an EN browser resolves the same ids. |
| S4 (h1 read then lost) | Gone. The summary *is* the page. |
| Expiry (RCA 2026-09-27) | `/list` stays a per-request dynamic hole, and with RCA D1 it resolves against the current Zurich day. A link opened a week later shows the honest "not on offer this week" state and never a stale price. Items already copied into the own list should carry `validTo` (RCA D5), so the drawer can mark them once they end. |
| New tab / window | We cannot control how a messenger opens a link, and we should not depend on it. The two lists stay separate because of the design, not because of the window. |

## 7. Copy keys (for the Designer to author; EN/DE, du-form, no "Sorry")

New keys needed:
- `list.shared_title` ("Shared list" / "Geteilte Liste")
- `list.add_all`
- `list.save_as_mine`
- `list.add_one`
- `list.in_your_list`
- `list.replace_mine`
- `list.replaced_notice` (+ `list.undo`)
- `list.added_summary`, an ICU plural with `{added}` and `{present}` (follow the M2 nested-plural rule)
- `list.full`
- `list.open_mine`

The drawer title must say "My list" / "Meine Liste", so the two lists are never confused. The Designer should check the current `list.title`.

## 8. Trade-offs

| For | Against / cost |
|---|---|
| No data loss, ever. Opening a link is safe to do at any time. | One extra tap to copy items (world-class products make the same choice). |
| Removes a whole class of races: redirect timing, the Vaul focus race, notice persistence. The spec shrinks. | Two components move out of `ListDrawer.tsx` (a mechanical refactor with tests). |
| The shared view is server-rendered and works without JavaScript. Only the action buttons need it. | The buttons show a brief disabled state until hydration. |
| The URL is the state, so it can be re-shared, bookmarked and tested as a pure function. | No live co-editing. Recorded as out of scope: it would need storage and accounts. |

## 9. Tests to write first (TDD)

1. `resolveSharedList`: cases ok / partial / none-available / link-empty. Duplicates are counted once. Overflow is not counted as unavailable (M4).
2. `mergeLists`: empty own list; overlap (reports `alreadyPresent`); own order kept; cap reached (`rejectedByCap`); `replaceAll` dedupes (TL.4 point 2).
3. Page, integration: rendering `/list?items=a,b` with a pre-populated own list leaves localStorage **byte-identical** (I1). This is the regression test for PM decision P1.
4. Architecture test: no file under `app/[locale]/list/` except `SharedListActions` imports `useListStore`.
5. Actions: "Add all" then "Undo" restores the exact previous list. Replace is hidden when the own list is empty or has the same ids.
6. Locale: DE link in an EN browser keeps `?items=` and resolves the same ids. Added items carry the rendered locale's `productName`.
7. The unavailable-count notice uses the M3 wording at count 1 and count 2, in both locales.

## 10. What this changes in the existing spec

Part A.2–A.4 are superseded where they say "redirect" and "drawer banner". The case matrix, the copy (with M1–M4 applied), dedupe, the cap and TL.4 all stay. Challenger P1 is resolved by the PM decision above. M5, S1, S4, A.8 #9 and #11 become not applicable. S2, S3, S5, S6 (now "notice visible at 320px on the page") and S7 still apply. The Designer updates the spec, and it goes back to the Challenger for a zero-findings pass (CLAUDE.md resolution loop).
