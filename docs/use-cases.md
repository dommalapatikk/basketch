# Product Specification: basketch

**Author:** Kiran Dommalapati
**Date:** 2 October 2026
**Version:** 3.0
**Previous version:** 2.1 (21 April 2026)
**Scope:** Switzerland-wide weekly promotions, seven retailers. Live at https://basketch.vercel.app (German default, English under `/en`).

> **Summary.** basketch answers one question for Swiss shoppers: which store has the stronger promotions this week, per category? It collects the weekly promotions of seven retailers, shows a per-category verdict, lets people browse and filter every deal, and lets them collect chosen deals into a list they can send to whoever is shopping. There is no account; the list stays in the browser. Thirteen use cases are live (one of them, UC-7, with known defects); five are parked or not started. Per-item cheapest-store routing was deliberately not built (decision P-8). Known defects are listed together in section 7.

---

## 1. Product goal

**Vision.** A Swiss shopper knows where this week's promotions are before leaving the house.

**What basketch does today.** It collects the weekly promotions of seven Swiss retailers, sorts them into categories, says which store has the stronger promotions per category, lets the visitor browse and filter every deal, and lets them collect chosen deals into a list that can be sent to whoever is shopping.

**What basketch is not.** It does not compare regular shelf prices, it does not claim to list every promotion, and it does not route each item to its cheapest store automatically (see UC-16, Not started). The About page says the same: "basketch compares weekly promotions, not regular shelf prices."

**Constraints that shape every use case**

| Constraint | Detail | Source |
|---|---|---|
| No login | Everything works without an account. The list is stored in the browser's localStorage only. | `about.privacy` in `messages/en.json`; `stores/list-store.ts` |
| Free to use, free to run | Personal project. Free tiers only, with one capped paid classification model on the pipeline side. | `CLAUDE.md` (Legal Constraints) |
| Honest prices | Price comparisons must be objectively correct (Art. 3(1)(e) UWG). Show the validity window, never imply the list is exhaustive, label member-only prices. | `CLAUDE.md` |
| No usage metrics | There is no analytics in production (`lib/observability.ts` is a no-op stub). Nothing in this document is measured usage. | `lib/observability.ts` |

---

## 2. Personas

Unchanged in intent from v2.1. They are working assumptions, not research findings.

**Sarah, the pragmatic weekend shopper.** 30-45, lives in or near a Swiss city, shops once a week, usually Saturday. Will split a trip across stores if the promotions are clear. Wants: "Just tell me which store this week, and for what?"

**Marco, the deal hunter.** 25-35, buys less often but stocks up on strong deals (coffee, chocolate, detergent). Wants the discount percentage visible and wants to send deals to flatmates.

**Anti-persona.** Someone who compares regular shelf prices across stores. basketch shows promotions only.

## 3. Jobs to be done

| # | When... | I want to... | So I can... |
|---|---|---|---|
| JTBD-1 | I plan this week's shopping | see which store has the stronger promotions per category | decide where to go |
| JTBD-2 | I look for something specific | search and filter all current promotions | find it and see which store has it |
| JTBD-3 | I find deals worth buying | collect them in a list with a total per store | go to each store with a clear list |
| JTBD-4 | someone else is shopping | send them the list | split the trip |
| JTBD-5 | I return next week | open the site and see fresh data without setting anything up | get the answer in seconds |

---

## 4. Status overview

| UC | Use case | Status |
|---|---|---|
| UC-1 | See this week's verdict (home) | Live |
| UC-2 | Browse, search and filter deals | Live |
| UC-3 | Read a deal card | Live |
| UC-4 | Add and remove deals on my list | Live |
| UC-5 | Review my list: where to buy and estimated total | Live |
| UC-6 | Share my list | Live |
| UC-7 | Open a list someone shared with me | Live, with known defects (section 7); separate view is Parked (UC-18) |
| UC-8 | Share this week's verdict | Live |
| UC-9 | Use basketch in German or English | Live (French and Italian are Parked) |
| UC-10 | Stay correct when data is old or a day rolls over | Live |
| UC-11 | Read how basketch works (About) | Live |
| UC-12 | Recover from a wrong URL or an error | Live |
| UC-13 | Weekly data refresh (system) | Live |
| UC-14 | Send feedback through a contact form | Not started |
| UC-15 | "Cheapest" tag means lowest price | Not started |
| UC-16 | Per-item cheapest-store routing | Not started (deferred, decision P-8) |
| UC-17 | Pick a product variant, see per-store availability, get notified | Parked (components built, not mounted anywhere) |
| UC-18 | Shared list as its own read-only page | Parked (designed, not built) |

---

## 5. Use cases

Terms used below. **In effect:** a deal whose start date is on or before today and whose end date is on or after today, using the Zurich calendar date (`web-next/src/lib/domain/validity.ts`). **Votes in the verdict:** a deal that is in effect, not member-only, not a "from N items" price, and not category-unverified (`lib/domain/votes-in-verdict.ts`). A deal that does not vote is still shown, with its own label. In plain words, "counts toward the verdict" means "votes in the verdict".

---

### UC-1: See this week's verdict (home)

**Status:** Live
**Actor:** Any visitor (Sarah, Marco)
**Job:** JTBD-1, JTBD-5
**Trigger:** Opens https://basketch.vercel.app or `/en`, from a link, a WhatsApp message or a search.
**Code:** `app/[locale]/page.tsx`, `components/landing/*`, `server/verdict/algorithm.ts`, `lib/category-rules.ts`

**Main flow**

| # | Visitor | System |
|---|---|---|
| 1 | Opens the home page | Reads the current snapshot at request time (never from a prerendered copy) and shows one headline sentence per category, for example "Migros wins Fresh." |
| 2 | Reads the stat line | "Based on N deals across M Swiss stores." plus the "updated" date. |
| 3 | Scans the three category cards | Each card shows the winning store (or "Tied", "Only store", "No data"), the average discount and the deal count for that category. The average is across all deals that count toward the verdict in that category, not the winner's own average. |
| 4 | Taps "Browse all deals" | Goes to `/deals`. |
| 5 | Scrolls down | Sees the three-step "How it works" strip. |

**How the verdict is decided** (`server/verdict/algorithm.ts`, `lib/category-rules.ts`)

- Three categories: Fresh, Long-life, Household.
- Per store and category: the average discount percent across deals that count toward the verdict.
- **Known defect (D-1):** a deal with no printed original price (for example many ALDI deals) is stored with a discount of 0% (`pipeline/categorize.ts:31-32`) and still counts toward the verdict, because `votesInVerdict` does not exclude it (`lib/domain/votes-in-verdict.ts:53-58`). Its 0% is averaged in. How much this moves any verdict has not been measured.
- Winner: the top store, if it has at least 5 voting deals in that category and leads the runner-up by at least 2 percentage points. Otherwise the state is "Tied".
- Only one store with voting deals: "Only one store offering {category} this week." No winner.
- No voting deals: "No data for {category}."

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Data is more than 9 days old | A status banner reads "Showing data from {date} - this week's update is delayed." (`components/landing/StaleBanner.tsx`, `lib/format.ts` `isStale`) |
| The deals query failed | Same banner. The snapshot is marked degraded and the banner shows regardless of age. |
| A category has fewer than 5 voting deals at the top store | "Tied" even if the average gap is large. |
| A category card is tapped | **Known defect (D-2):** opens `/deals` unfiltered. The card sends `?category=` (`CategoryVerdictCard.tsx:31`) but the deals page reads `type` (`lib/filters.ts`). The intended behaviour is a filter by that category; the correct parameter is `type`. |
| Visitor is on `/en` | All copy in English. Category names: Fresh, Long-life, Household. German names: Frische, Trockensortiment, Haushalt. |
| Tab left open past midnight (Zurich) | "It's a new day - today's deals may have changed." with a Refresh button (see UC-10). |

**Acceptance criteria**

```
GIVEN the pipeline has published deals
WHEN a visitor opens the home page
THEN one verdict sentence per category is shown (Fresh, Long-life, Household)
  AND the stat line shows the deal count and the number of stores that have deals
  AND each category card shows the winner or the tied / only-store / no-data state,
      the average discount and the deal count
  AND a deal that is member-only, "from N items", not yet started, expired or
      category-unverified does not count toward any verdict
  AND no account or setup is needed

GIVEN no store has 5 voting deals in a category, or the top two are within 2 points
THEN that category reads "tied" rather than naming a winner
```

---

### UC-2: Browse, search and filter deals

**Status:** Live
**Actor:** Any visitor
**Job:** JTBD-2
**Trigger:** Taps "Browse all deals" or "Deals" in the header, or opens `/deals` directly.
**Code:** `app/[locale]/deals/page.tsx`, `DealsClient.tsx`, `components/deals/FilterRail.tsx`, `FilterSheet.tsx`, `TypeSegmented.tsx`, `DealsSearch.tsx`, `lib/filters.ts`, `server/data/filter-deals.ts`

**Main flow**

| # | Visitor | System |
|---|---|---|
| 1 | Opens `/deals` | Loads the full snapshot once. All later filtering happens in the browser with no server round trip. Header shows "This week's deals" and "Updated {date} - N deals". |
| 2 | Picks a type (All / Fresh / Long-life / Household) | Desktop: radio list in the left filter rail. Mobile: a tab strip at the top. Picking a type clears category and sub-category. |
| 3 | Narrows by category, sub-category, storage (fresh, chilled, frozen, ambient) and stores | Chips show counts. Category and storage chips stay visible and dim at zero. Store chips are disabled at zero. A "Reset (n)" control clears all filters. |
| 4 | Types in the search box | Matches product names (case-insensitive substring), applied 250 ms after typing stops. |
| 5 | Scrolls | Deals are grouped into one section per sub-category (largest first). Each section shows its top card in full and every other deal in that sub-category underneath (the block is labelled "Other stores", although it can include the same store's other deals); if there are more than 5 others the block starts collapsed with "Show all N". |
| 6 | Copies the URL | Filters are in the URL (`?type=&cat=&sub=&storage=&stores=&q=`), so a filtered view can be shared. |

On mobile a bottom bar offers My list, Filters and Share. The Filters sheet shows a live "Show N deals" count.

**Order inside a section.** Biggest discount first (decision P-10). The first card that votes in the verdict is the section's top card; if none votes, the biggest-discount deal is shown without a "Cheapest" tag.

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| No stores selected | "Select at least one store to see deals." with the list of seven stores. |
| Filters match nothing | "No deals match these filters. Try removing a filter." |
| A sub-category has a deal at only one tracked store | That store's top card carries "Only at {store}" together with the note "No other store we track has a {category} deal right now." Only shown if the card is itself in effect and from that store. |
| A deal has not started yet (retailer flyers publish 1-2 weeks ahead) | Shown, labelled "From {weekday date}". Excluded from verdicts and from "Cheapest". |
| An unrecognised `type` or `storage` value in the URL | Ignored; the page shows unfiltered results. Other parameters do not degrade this way: `?stores=xyz` gives an empty store list ("Select at least one store"), and an unknown `cat` or `sub` matches nothing ("No deals match"). |
| `?type=long-life` | Accepted as an alias for `longlife`. |
| Migros, ALDI and SPAR publish no per-product page | The product name links to the retailer's weekly flyer instead (`sourceUrl` in `pipeline/collection/infrastructure/{migros,aldi,spar}/*-flyer-source.ts`), so the price can be checked at its source. Coop links to aktionis.ch; Denner, LIDL and Volg link to product pages. |
| A deal has no link at all | The name is plain text, not a dead link. |
| Deal has no image | A crop of the retailer's flyer page is shown where available; otherwise a placeholder. |
| Tab open past Zurich midnight | Expired deals drop out of every count and filter and a refresh prompt appears (UC-10). |

**Acceptance criteria**

```
GIVEN a visitor opens /deals
WHEN the page loads
THEN deals from the seven retailers are listed, grouped by sub-category,
     biggest discount first within each group
  AND the header states the update date and the number of deals shown

GIVEN the visitor applies a type, category, sub-category, storage, store or search filter
THEN the list and the counts update in the browser without a page reload
  AND the URL reflects the filters (default values are omitted)
  AND the control states are exposed as pressed / selected for assistive technology

GIVEN every store is deselected
THEN an explanatory message is shown instead of an empty page

GIVEN a section has more than 5 other-store deals
THEN they start collapsed behind a button that states the count and toggles open and closed
```

---

### UC-3: Read a deal card

**Status:** Live
**Actor:** Any visitor
**Job:** JTBD-2
**Trigger:** Looks at any deal on `/deals` (or an item in the list drawer).
**Code:** `components/deals/DealCard.tsx`, `components/ui/price-block.tsx`, `lib/domain/price-basis.ts`, `lib/domain/quantity-requirement.ts`, `lib/format.ts`

**What a card shows**

- Store pill (store colour appears only as a dot), product name, pack format, up to three facts the retailer itself stated (never inferred).
- Sale price, original price and discount percent when an original price exists, and a price per unit where the unit can be derived.
- Product image, or a crop of the retailer's flyer page.
- A link to the retailer's product page or flyer, opening in a new tab, where one exists.

**Labels that protect price accuracy**

| Situation | Label | Effect |
|---|---|---|
| Member-only price (Lidl Plus, Supercard, Cumulus) | Names the programme in text | Never votes, never "Cheapest" |
| Price applies only from N items | "From N items" | Never votes, never "Cheapest" |
| Deal starts later | "From {date}" | Never votes, never "Cheapest" |
| Classifier was not confident | "Category unverified" | Never votes, never "Cheapest" |
| Top card of its section and it votes | "Cheapest" tag (see UC-15 for what it currently means) | |
| Only one tracked store has this sub-category | "Only at {store}" plus scope note | |

**Edge cases**

| Condition | Behaviour |
|---|---|
| No original price printed (for example ALDI) | The card shows no original price and no discount percent. The stored discount is 0, which the verdict still averages in (defect D-1). |
| Very long product name | Wraps within the card; layout tests guard against overlap with the price (`e2e/v2-acceptance.spec.ts`). |
| No link exists for the deal | Name shown as plain text, not a dead link. A repo-wide test forbids `href="#"` (`lib/no-dead-links.test.ts`). |

**Acceptance criteria**

```
GIVEN a deal is member-only, multi-buy, not yet started or category-unverified
THEN its card carries a text label saying so (never colour alone)
  AND it is not counted in the category verdict
  AND it cannot be tagged "Cheapest"

GIVEN a deal has no printed original price
THEN no discount percent is displayed for it
```

---

### UC-4: Add and remove deals on my list

**Status:** Live
**Actor:** Any visitor (Sarah, Marco)
**Job:** JTBD-3
**Trigger:** Taps the plus button on a deal card.
**Code:** `components/deals/AddToListButton.tsx`, `stores/list-store.ts`, `components/list/MyListButton.tsx`

**Main flow**

| # | Visitor | System |
|---|---|---|
| 1 | Taps the plus button on a deal | The deal is saved to the list and the button changes to a checkmark (pressed state, label "Remove from list"). |
| 2 | Keeps browsing | The "My list" button (header, and bottom bar on mobile) shows the running count. |
| 3 | Taps the checkmark again | The deal is removed and the button returns to the plus. |

The list is saved in the browser (localStorage key `basketch-list`). It survives reloads and is not sent anywhere. Each saved item keeps a snapshot of the deal (store, name, price, image, validity dates, price basis, minimum quantity), so it remains readable after next week's data replaces the deal.

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Same deal added twice | Ignored; one entry per deal id. |
| Visitor clears browser data or switches device | The list is gone. There is no account and no server copy. |
| Stored data is old or hand-edited | Malformed items are dropped when loading; a corrupted entry cannot crash the page. |
| Saved item's deal has since ended | Stays in the list, marked "Expired", and is left out of totals and shared text (UC-5, UC-6). |
| Very large list | No cap exists in the live code. A cap of 200 is part of the parked shared-list design (UC-18). |

**Acceptance criteria**

```
GIVEN a visitor taps the plus button on a deal
THEN the deal is added once, the control shows the pressed state,
     and the My list count increases by one

GIVEN the visitor taps the same control again
THEN the deal is removed and the count decreases by one

GIVEN the visitor reloads the page
THEN the list is restored from the browser

GIVEN the touch target is measured
THEN it is at least 44 x 44 px on mobile
```

---

### UC-5: Review my list: where to buy and estimated total

**Status:** Live
**Actor:** Any visitor with at least one saved deal, or none
**Job:** JTBD-3
**Trigger:** Taps "My list" in the header or bottom bar.
**Code:** `components/list/ListDrawer.tsx`, `components/list/ItemNote.tsx`, `lib/share.ts` (`groupByStore`)

**Main flow**

| # | Visitor | System |
|---|---|---|
| 1 | Opens My list | A drawer opens: a right-hand panel (420 px) on desktop, a bottom sheet (up to 90% of screen height) on mobile. The title shows the item count. |
| 2 | Reads the items | Items are grouped by category with a count per group. Each row shows image, name, store, sale price and any labels (member price, "From N items", "From {date}", "Expired"). |
| 3 | Reads "Where to buy" | One line per store with item count and subtotal, then "Estimated total". The summary sentence reads like "Your 5 items split best across 3 stores:". |
| 4 | Removes an item with the X button, or clears the list with "Clear list" | List and totals update. |
| 5 | Taps Done (or outside the drawer) | Drawer closes. |

How the grouping works: each saved item is already a specific deal at a specific store, so "Where to buy" groups the visitor's own choices by store and adds up their sale prices. It does not look for a cheaper store for an item (see UC-16).

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Empty list | "Your list is empty. Add items from the Deals page and share them with a shopping buddy." with a "Browse deals" button. |
| One item | Singular wording ("Your item is cheapest here:"). |
| Item expired since it was added | Row is kept and marked "Expired" so the visitor can remove it; it is excluded from store subtotals, the estimated total and share text. |
| Item has a member-only or multi-buy price | Row carries the label, so the price is never shown unconditionally. |
| Items from only one store | Summary says the items are cheapest at one store. |
| Language | Wording follows the page language; totals use Swiss number formatting. |

**Acceptance criteria**

```
GIVEN the list has items
WHEN the visitor opens My list
THEN items are grouped by category with counts
  AND a per-store subtotal and an estimated total are shown for items still in effect
  AND each item shows its store, price and any member / not-yet-started / expired label
  AND a multi-buy ("From N items") label is shown for items added on /deals,
      but not for items that arrived through a shared link (defect D-3)

GIVEN an item's validity has ended
THEN it stays visible with an "Expired" label
  AND it is not included in totals or in shared text

GIVEN the list is empty
THEN the drawer shows an empty state with a link to the deals page
```

---

### UC-6: Share my list

**Status:** Live
**Actor:** Sarah (shares with partner), Marco (shares with flatmates)
**Job:** JTBD-4
**Trigger:** Taps a share control in the My list drawer, or "Share" in the mobile bottom bar.
**Code:** `lib/share.ts`, `lib/share-target.ts`, `lib/share-url.ts`, `components/list/ListDrawer.tsx`, `components/deals/BottomBar.tsx`

**Main flow**

| # | Visitor | System |
|---|---|---|
| 1 | Opens My list | Footer offers "Share on WhatsApp", "Copy link" and "Email". |
| 2 | Taps one | WhatsApp or the mail client opens with a prepared message; Copy link puts the link on the clipboard and shows "Copied" for 1.5 seconds. |

**What the message contains** (`buildShareText`): a header ("My basketch list:" / "Meine basketch-Liste:"), one line per store with item count and subtotal, a total line, then the link. A store line adds a note when relevant, for example "(1 x Lidl Plus members only)", "(2 x From 2 items)" or "(1 not started yet)", because the recipient may never open basketch and must not see a conditional price without its condition.

**The link** is `/list?items=<id>,<id>,...` (`/en/list?...` for English). It carries deal ids only, nothing is stored on a server.

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Empty list | No share footer in the drawer; on mobile the Share slot is a disabled button. |
| Items present but all expired | The share footer is still shown (it depends on the item count, not on active items). WhatsApp and Email are disabled buttons; **Copy link stays enabled and does nothing** (defect D-7, `ListDrawer.tsx:133, 70-71`). |
| Page not yet hydrated (origin unknown) | WhatsApp and Email render as disabled buttons for that moment, never as a link to `#`; Copy link also does nothing until the origin is known. |
| Clipboard permission denied | Copy falls back to copying the full text; if that also fails nothing is shown (no error toast). |
| Middle-click, Cmd-click, "Copy link address" on a share control | Works, because the destination is in the link itself and not assigned in a click handler. |
| Expired items | Left out of the message and the total. |

**Acceptance criteria**

```
GIVEN the list has at least one item in effect
WHEN the visitor taps Share on WhatsApp or Email
THEN a message opens containing per-store counts and subtotals, a total and the link
  AND any member-only, "from N items" or not-started item in a store group is noted in that group's line
  AND expired items are not included

GIVEN the list has no item in effect
THEN WhatsApp and Email are disabled (Copy link is also inert, defect D-7)

GIVEN a share control is rendered
THEN it is a real link (never href="#") or a disabled button
```

---

### UC-7: Open a list someone shared with me

**Status:** Live, with known defects D-3, D-4 and D-8 (section 7)
**Actor:** The recipient (partner, flatmate)
**Job:** JTBD-4
**Trigger:** Taps a `/list?items=...` link.
**Code:** `app/[locale]/list/page.tsx`, `components/list/HydrateAndRedirect.tsx`, `lib/share-url.ts`

**Main flow (as built today)**

| # | Recipient | System |
|---|---|---|
| 1 | Opens the link | Looks up each id in the current week's data on the server. |
| 2 | — | A short page states what was found ("Your 4 items split best across 2 stores:"). |
| 3 | — | In the browser, the recipient's list is replaced with the shared items, the My list drawer opens, and the page moves to `/deals`. |

The page is marked `noindex`.

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Some ids are no longer in this week's data | Those items are dropped silently; the recipient sees only the items that are current. |
| Duplicate ids | Kept as separate rows; both are counted in the heading and the totals (`lib/share-url.ts`, `stores/list-store.ts` `replaceAll`). |
| **Multi-buy item** | **Loses its "From N items" label** (defect D-3): `list/page.tsx:65-76` does not copy `minQuantity`, so in the recipient's drawer and in anything they share on it reads as an open price. |
| Malformed link (for example a truncated `%` sequence) | `decodeURIComponent` throws and the recipient gets the error page instead of a list (`lib/share-url.ts:15`). Read from code, not reproduced. |
| **Recipient already has their own list** | **Known defect (D-4):** it is overwritten by the shared one. Decision P-14 (25 Sep 2026) says a shared link must never replace or merge; the fix is parked (UC-18). |
| No id resolves, or the link has no ids | **Known defect (D-5, confirmed in code):** the same replace step runs with an empty set, so the recipient's list is emptied and an empty drawer opens (`list/page.tsx:62-64`, `HydrateAndRedirect.tsx:24`). |
| The sender added a not-yet-started deal | Resolved normally and shown with its "From {date}" label. |
| English link (`/en/list`) | Page and drawer in English. |

**Acceptance criteria (today's behaviour)**

```
GIVEN a recipient opens a valid /list?items=... link
THEN the items that exist in this week's data appear in their My list
  AND the My list drawer is open on /deals
  AND no account is required

GIVEN some ids are not in this week's data
THEN those are left out without an error page
```

The acceptance criteria for the intended behaviour (never overwrite, show the shared list on its own page) are in UC-18.

---

### UC-8: Share this week's verdict

**Status:** Live
**Actor:** Sarah or Marco
**Job:** JTBD-4
**Trigger:** On the home page, uses the "Share this week's verdict" block.
**Code:** `components/landing/ShareVerdictButton.tsx`, `app/card/route.tsx`, `proxy.ts`

**Main flow:** The block offers WhatsApp, Email and Copy, plus a "Preview the share card" link. The message is a short fixed sentence ("This week's grocery deals across 7 Swiss stores, side by side.") and the home-page link. The preview card is a generated 1200 x 630 image of the verdict for the chosen language at `/card?locale=de|en` (also reachable as `/en/card` and `/de/card`).

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Native share is available | The Copy button uses the device's share sheet and falls back to copying. |
| Page not yet hydrated | The share block is not rendered until the origin is known. |
| Preview link and email body | The card URL includes the day (`d=`). The image itself is always recomputed from current data. The Open Graph image that WhatsApp fetches for the shared home link has no `d=` (`app/[locale]/layout.tsx:56`); the card is cached for 15 minutes (`app/card/route.tsx`), so the exposure is small. |
| Shared link previewed in WhatsApp or social apps | Uses Open Graph tags: the `/card` image, title and description for the page language (`app/[locale]/layout.tsx`). |

**Acceptance criteria**

```
GIVEN the home page has loaded
WHEN the visitor taps WhatsApp, Email or Copy
THEN the message contains the home-page link in the visitor's language
  AND the preview-card link opens the verdict image for that day and language
```

---

### UC-9: Use basketch in German or English

**Status:** Live for German and English. French and Italian: Parked.
**Actor:** Any visitor
**Trigger:** Opens a link with or without the `/en` prefix.
**Code:** `i18n/routing.ts`, `i18n/navigation.ts`, `messages/de.json`, `messages/en.json`

**Main flow:** German is the default and has no prefix (`/`, `/deals`, `/about`, `/list`). English lives under `/en`. Navigation links, the list drawer, share text, 404 page, metadata and the generated share card all follow the language of the URL. Alternate-language links (`hreflang`) are declared for the home and About pages.

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| Unknown locale in the URL | Falls back to German (`parseLocale`). |
| Visitor on a share link in the other language | The shared text and the destination page follow the sender's language. |
| Product names | Come from the retailers and stay as published (mostly German). |
| French or Italian | Message files `fr.json` and `it.json` exist but the locales are not enabled (`i18n/routing.ts`). Each defines 75 of the 183 keys in `en.json`; `de.json` is complete. |
| Switching language | There is no language switcher; the URL sets the language. See section 7, next decision 7. |

**Acceptance criteria**

```
GIVEN a visitor opens /en/deals
THEN all interface text is English and links stay within /en

GIVEN a visitor opens /deals
THEN all interface text is German

GIVEN every message key
THEN German and English both define it (messages.test.ts, message-lint.test.ts)
```

---

### UC-10: Stay correct when data is old or a day rolls over

**Status:** Live
**Actor:** Any visitor; the system
**Trigger:** Pipeline late or failing; a deal's last day passes; a tab stays open overnight.
**Code:** `server/data/snapshot.ts`, `components/shared/MidnightGuard.tsx`, `lib/use-today-in-zurich.ts`, `stores/list-store.ts` (`useActiveListItems`), `docs/decisions/2026-09-27-deals-cache-keyed-by-zurich-date.md`

**Behaviour**

| Situation | What the visitor sees |
|---|---|
| Normal | Deals in effect today. Deal data is cached per Zurich date, so a new day can never be answered from the previous day's cache. |
| Data more than 9 days old, or the deals query failed | Banner on the home page: "Showing data from {date} - this week's update is delayed." |
| A deal's last day has passed | It no longer appears (the query only returns deals ending today or later, and the in-effect rule is applied on top). |
| A deal has not started | Shown with "From {date}", never counted in verdicts or tagged "Cheapest". |
| Tab open across midnight (Zurich) | Home and `/deals` show "It's a new day - today's deals may have changed." with a Refresh button. On `/deals`, ended deals disappear from counts and filters; in the list, ended items become "Expired" and leave the totals. The clock is checked once a minute in the browser. |
| Pipeline run finishes | The pipeline calls a revalidate hook so the site drops its cached data (`app/api/revalidate/route.ts`). |

**Acceptance criteria**

```
GIVEN the Zurich date changes while a page is open
THEN within about a minute a refresh prompt appears
  AND deals whose last day has passed are no longer counted or addable on /deals
  AND saved items that have ended are excluded from totals and shared text

GIVEN the data is older than 9 days or could not be loaded
THEN the home page shows a notice with the date of the data shown
```

---

### UC-11: Read how basketch works (About)

**Status:** Live
**Actor:** Any visitor
**Trigger:** Taps "About basketch" in the header. The link is hidden below 640 px wide, so on a phone in portrait there is no link to this page from the header, and the footer does not link to it either (defect D-6).
**Code:** `app/[locale]/about/page.tsx`

**Content:** What basketch compares; how it works (collection up to three times a week, AI sorting into Fresh / Long-life / Household with a second AI check and a "Category unverified" mark where the two disagree); one line per retailer saying where its data comes from; what is and is not compared; privacy (no account, no tracking cookies, list stored only in the browser); a contact section.

**Edge cases**

| Condition | Behaviour |
|---|---|
| Coop | Described as read through aktionis.ch because coop.ch blocks automated access. |
| English / German | Separate pages with their own titles and canonical links. |
| Contact section | Still shows an email address in the copy. Decision P-9 (25 Sep 2026) is that this address is not used and a contact form replaces it, so the page may point visitors to an unread address (defect D-9, UC-14). |

**Acceptance criteria**

```
GIVEN a visitor opens /about or /en/about
THEN the page states the data source for each of the seven retailers
  AND states that no account is needed and the list stays in the browser
```

---

### UC-12: Recover from a wrong URL or an error

**Status:** Live
**Actor:** Any visitor
**Trigger:** Opens an unknown URL; a page fails to render.
**Code:** `app/global-not-found.tsx`, `app/NotFoundLocale.tsx`, `app/[locale]/not-found.tsx`, `app/[locale]/error.tsx`, `app/global-error.tsx`, `e2e/404-structural.spec.ts`

**Behaviour**

| Condition | Behaviour |
|---|---|
| Unknown URL, such as `/en/nope` or `/foo.bar` | A real 404 response with a simple page: basketch brand bar, "Page not found", and two buttons ("Browse deals", "Back to home"). German or English, matched to the link. |
| Error while rendering a page | A page with "Something went wrong", a "Try again" button, a link home and, where available, a reference code. The copy says "We've logged the error", but production error logging is a no-op (`lib/observability.ts`; defect D-10). |
| Error in the layout itself | Falls through to the global error page. |
| English visitor on a 404 | May see German for a moment before the language is applied; with JavaScript off both languages are visible. Recorded as an accepted cost in `NotFoundLocale.tsx`. |

**Acceptance criteria**

```
GIVEN a visitor opens an unmatched URL
THEN the response status is 404
  AND the page offers a way to this week's deals and a way home, in the language of the URL
```

---

### UC-13: Weekly data refresh (system)

**Status:** Live
**Actor:** System (GitHub Actions)
**Trigger:** Scheduled Monday, Tuesday and Thursday at 05:00 UTC (`.github/workflows/pipeline.yml`). GitHub may start a run hours late.
**Code:** `pipeline/` (collection, transformation, storage); details in `docs/collection-module-design.md`, `docs/data-source-research-2026-09-07.md`

**Main flow**

| # | Step | Detail |
|---|---|---|
| 1 | Collect | One fetch per store per run. Six retailers directly (Migros flyer, LIDL flyer, ALDI flyer, SPAR flyer, Denner site, Volg site); Coop through aktionis.ch. |
| 2 | Normalise and extract | Prices, validity dates, pack size, brand, storage state, member-only flag, minimum quantity. |
| 3 | Categorise | An AI model assigns category and sub-category; a second model double-checks; disagreement is stored as "uncertain". |
| 4 | Store | Upsert to the database, then mark expired deals. |
| 5 | Publish | Calls the site's revalidate hook so the new data shows up. |

**Rules that matter to the use cases above**

- An empty result, or one below that store's expected minimum, from a store counts as a failure, not a success.
- If a store prints no original price (ALDI), the card shows none and no discount is computed from one; the stored discount is 0 (defect D-1).
- Member-only (Lidl Plus) prices are flagged, not published as open prices.
- Legal line: no circumvention of access protection. coop.ch is behind such protection, which is why Coop stays on aktionis.ch.
- Spending cap on the paid classification model: USD 5 per month.

**Self-running state (2 Oct 2026).** Runs on 28 Sep, 29 Sep and 1 Oct finished successfully unattended and the schedule is active. A keep-alive job re-enables the workflow on every run, because GitHub disables scheduled workflows after 60 days without repository activity. The next planned check is on 26 Nov 2026.

**Alternatives and edge cases**

| Condition | Behaviour |
|---|---|
| One store fails | The other stores still publish. Whether a failed store's older deals are kept until their own end date or swept is not yet confirmed; the site never shows a deal past its end date. |
| Pictures missing | ALDI, SPAR and Volg pictures are not complete yet (Not started). |
| Migros names | Full-title names are built and reviewed but parked pending a decision on labels (section 7, next decision 8). |

**Acceptance criteria**

```
GIVEN the schedule fires
THEN every reachable store is fetched once
  AND each deal is stored with store, name, category, sale price, validity dates and price basis
  AND a store that returns fewer offers than that store's expected minimum is reported as failed
  AND the website is told to refresh its cache when the run completes
```

---

### UC-14: Send feedback through a contact form

**Status:** Not started
**Actor:** Any visitor
**Trigger:** Wants to report a wrong price or suggest something.
**What exists:** only the About page contact section with a plain email address in the copy.
**Decided (P-9, 25 Sep 2026):** replace the address with a contact form that sends to me, with the destination held as a secret and never in the page or the repository. Needs a mail service on a free tier and a one-time setup step.
**Acceptance criteria:** not defined yet.

---

### UC-15: "Cheapest" tag means lowest price

**Status:** Not started
**Actor:** Any visitor
**Today:** the "Cheapest" tag marks the first card in a section that votes in the verdict, and cards are ordered by biggest discount percent. In practice it means the biggest discount among comparable offers, not the lowest price.
**Decided (P-7, P-10, 25 Sep 2026):** make "Cheapest" mean the lowest price (per kg, per litre or per piece among comparable offers) while keeping biggest discount first in the ordering. Not built.
**Acceptance criteria:** not defined yet. Until it is built, the wording gap is defect D-11.

---

### UC-16: Per-item cheapest-store routing

**Status:** Not started (deferred)
**Actor:** Sarah
**Intended:** for each item on her list, show which store has it cheapest and produce a forwardable shopping list per store.
**Today:** the visitor chooses specific deals; the list groups those choices by store (UC-5). No search for a better store per item exists. Decided 25 Sep 2026 (P-8): keep today's category comparison and do not build routing now.
**Acceptance criteria:** not defined.

---

### UC-17: Pick a product variant, see per-store availability, get notified

**Status:** Parked (components built, unreachable)
**What exists:** a variant picker sheet, an availability strip with "on deal / off deal / not yet seen" states per store, and a "Notify me when this drops" email form (`components/list/VariantPickerSheet.tsx`, `AvailabilityStrip.tsx`, `AvailabilityCellSheet.tsx`, `lib/concept-family-defaults.ts`). They are only used by `components/landing/V3PreviewSection.tsx`, which no page imports, so none of this appears on the live site. The email form has no sending or storage behind it. English copy for these screens still sits in `messages/en.json`.
**Pending decision:** keep or retire (section 7, next decision 9).

---

### UC-18: Shared list as its own read-only page

**Status:** Parked (designed, challenged with zero findings, not built)
**Actor:** The recipient of a shared list
**Spec:** `docs/design/2026-09-27-shared-list-view-spec.md`, `docs/design/2026-09-27-architect-shared-list-separate-view.md`; decision P-14.

**Intended flow:** `/list?items=...` shows the shared list on its own page, read-only, labelled "Shared list", with the same "Where to buy" grouping and wording that says "These items" rather than "Your items". The recipient's own list is never touched until they choose: "Add all to my list", "Save as my list" (if theirs is empty) or "Replace my list with this one" (with Undo). Items no longer on offer are reported as a count; a 200-item limit is declared with its own notice; empty and nothing-available links get their own empty states.

**Acceptance criteria (from the spec, abbreviated)**

```
GIVEN a recipient opens a shared link and has their own list
THEN their list is unchanged until they tap an action
  AND the shared items are visible without any redirect

GIVEN none of the shared items are on offer this week
THEN the page says so and offers "Browse deals", and the recipient's list is unchanged
```

---

## 6. Current alternatives

The v2.1 competitor table (aktionis.ch, Rappn, Profital, Bring!, manual checking) is kept in `docs/competitive-analysis.md`. It is not repeated here because its wording described the old personalised-comparison product.

## 7. Known defects, gaps and next decisions

### Known defects (confirmed by reading the code; none reproduced in a browser unless stated)

| # | Defect | Where | Related |
|---|---|---|---|
| D-1 | Deals with no printed original price are stored at 0% discount and still count toward the category verdict. Effect on verdicts not measured. | `pipeline/categorize.ts:31-32`; `web-next/src/lib/domain/votes-in-verdict.ts:53-58`; `server/verdict/algorithm.ts:22-27` | UC-1, UC-3 |
| D-2 | Home category cards open an unfiltered `/deals`. They send `?category=`; the deals page reads `type` (not `cat`, which is a sub-category slug). | `components/landing/CategoryVerdictCard.tsx:31`; `lib/filters.ts:52-74` | UC-1 |
| D-3 | A shared link drops `minQuantity`, so "From N items" prices lose their label for the recipient and in anything they share on. | `app/[locale]/list/page.tsx:65-76` | UC-7, UC-5 |
| D-4 | Opening a shared link overwrites the recipient's own list (decision P-14 says never). Fix designed, not built. | `components/list/HydrateAndRedirect.tsx:24`; `stores/list-store.ts:145` | UC-7, UC-18 |
| D-5 | A shared link with no resolvable ids empties the recipient's list. | `app/[locale]/list/page.tsx:62-64`; `HydrateAndRedirect.tsx:24` | UC-7 |
| D-6 | About page has no link on phones below 640 px, and none in the footer. | `components/Header.tsx:38`; `components/Footer.tsx` | UC-11 |
| D-7 | With items present but all expired, Copy link stays enabled and does nothing. | `components/list/ListDrawer.tsx:133, 70-71` | UC-6 |
| D-8 | A malformed `%` sequence in a shared link produces the error page. | `lib/share-url.ts:15` | UC-7 |
| D-9 | About page still shows a contact email address that decision P-9 says is not used. | `messages/en.json` (`about.contact`) | UC-11, UC-14 |
| D-10 | Error page says "We've logged the error", but production logging is a no-op. | `messages/en.json` (`errors.server_error_body`); `lib/observability.ts:21-27` | UC-12 |
| D-11 | "Cheapest" and the list summary "cheapest at..." wording describe more than the logic does (biggest discount; chosen deals grouped by store). | `server/data/filter-deals.ts:297-301`; `messages/en.json` (`list.split_summary`) | UC-15, UC-5 |
| D-12 | Copy inconsistencies: German category name "Frische" and "Trockensortiment" in the interface vs "Frisch" and "Lange haltbar" in the German About text. (Separately, the French and Italian message files are incomplete, 75 of 183 keys; those locales are not routed.) | `lib/category-rules.ts:15-17`; `messages/de.json:13` | UC-9 |

### Next decisions

1. Fix D-1: exclude no-original-price deals from the verdict (as member-only deals are), or keep them.
2. Build the separate shared-list page (UC-18), or guard the current behaviour until then (D-4, D-5).
3. Fix D-2 and D-3, which are small code changes.
4. Link About from the mobile header or footer (D-6).
5. Replace the About contact address with the planned form (UC-14), or remove the address meanwhile.
6. Soften the "cheapest" wording now, or build UC-15.
7. Language switcher: none exists, the language follows the URL; the browser-language redirect (next-intl default) is likely on but not tested.
8. Migros full-title names: waiting on the label decision (persist IP-SUISSE / AOP / Fairtrade labels, keep them in the name, or accept the loss).
9. UC-17 (variants, availability, notify-me): keep or retire the unreachable code and its copy.
10. Not-started items without a use case here: ALDI, SPAR and Volg pictures, a Volg daily refresh, health-check alert tuning, a database index migration.
11. `docs/human-tester-guide.md` still describes the April product and needs updating or retiring.

## 8. Validation and unverified points

This specification is derived from the code, the message files and the design and decision documents in `docs/`, and was reviewed against the code. Points that are genuinely unverified:

- Browser-language redirect to `/en`.
- The state of ALDI, SPAR and Volg pictures on the live site.
- Whether a failed store's older deals are kept until their end date or swept; the site never shows a deal past its end date.
- Weekly figures (1,537 deals in effect, counted after the 28 Sep 2026 deploy; three unattended runs on 28 Sep, 29 Sep and 1 Oct 2026) change every week.

## Appendix: What changed since v2.1 (21 Apr 2026)

- **No account, no email, no server-side list.** The email lookup, email notifications, starter packs, onboarding form and the `/compare/:id` page are gone. The list now lives only in the visitor's browser (`web-next/src/stores/list-store.ts`) and is shared as a link that carries deal ids.
- **Seven retailers, not two.** Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg are all live. Six are collected directly from the retailer (own site or public flyer); Coop is collected through aktionis.ch, on purpose (see UC-13).
- **The product is a verdict plus a browsable deal list.** Home shows a per-category verdict (Fresh / Long-life / Household). `/deals` has search and filters. A "My list" drawer replaces the old comparison page.
- **Correctness rules added.** Deals are only "in effect" between their start and end dates (Zurich calendar date). Member-only prices, "from N items" prices, not-yet-started deals and unverified categories are labelled, and none of them can decide a verdict or wear the "Cheapest" tag.
- **Two languages are live (German, English).** French and Italian message files exist but are not routed.
- **Each use case now carries a status** (Live / Parked / Not started) taken from the code and the decision records.
- **Unmeasured targets removed.** v2.1 listed activation, retention and PMF targets. No usage metrics exist for this project, so none are claimed here.
- `docs/human-tester-guide.md` still describes the April flow and is out of date.

Removed from v2.1 because the code no longer has them: email lookup, email notifications, starter packs, the onboarding form, `/compare/:id`, server-side baskets, "Track your items", the favourites-based comparison and the 3-bucket onboarding. The growth-engine, milestone and PMF-survey sections are removed because they described plans and targets rather than behaviour.
