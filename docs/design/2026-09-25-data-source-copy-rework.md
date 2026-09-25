# Design spec: data-source / how-it-works copy rework

**Status:** Ready for Design Challenger review
**Author:** Product Designer
**Source of truth:** `docs/design/2026-09-25-data-source-facts.md` — nothing here contradicts it; anything the fact sheet marks UNVERIFIED is either omitted or turned into an open PM question, never asserted.
**Adjacent, already-scoped-elsewhere:** `docs/design/2026-09-25-remove-worth-a-look.md` removes the homepage "Worth a look this week" section and `MethodologyStrip`'s link to `/settings/hidden`. This spec assumes that removal has already landed — the `MethodologyStrip` redesign below has no such link, and `worth_picking_up` / `hidden_suggestions` locale keys are that spec's responsibility, not repeated here.
**Explicitly out of scope:** the "Cheapest" tag's underlying meaning (biggest % off, not lowest price), photo-hosting claims (Vercel image-copy legal question pending with PM), and per-item cheapest-store routing as a *feature* — these are flagged as open questions (§5), not designed around.

---

## 1. Where this copy lives today, and the redesigned structure

Four surfaces carry data-source / how-it-works claims. All four are edited; none are restructured into new pages or new nav — this is a copy-accuracy pass, not an IA change (subtraction test: don't add surfaces to fix wording).

### 1a. About page (`app/[locale]/about/page.tsx`)

**Today's section order:** How it works (3 steps) → Data sources (heading, one-line body, stores list, note) → What we compare → Privacy (3 bullets) → Contact.

**Redesigned, same order, same section shells (no new headings, no new routes):**

| Section | Change |
|---|---|
| How it works | All 3 steps rewritten for accuracy (cadence, AI categorisation, no "track regular items"). Still 3 numbered steps, same layout (`<ol>` with mono step numbers) — no visual change. |
| Data sources | **Restructured.** One intro sentence (six direct / Coop via aktionis) replaces the single false sentence. Below it, a **per-retailer source list** — 7 rows, one per store, each with its brand dot (reuse `STORE_BRAND` per CLAUDE.md's "brand colour is data, dot/pill/rail only" rule) and a plain-language source description. Below that, the freshness line (repurposes the existing `note` slot). `stores_label` is **deleted** — the per-retailer list now does that job better (subtraction test: a flat "stores tracked" sentence is redundant once each store's source is listed). |
| What we compare | Unchanged — fact sheet confirms this is accurate as-is. |
| Privacy | 3 bullets kept, but bullet 3 (email) is replaced with a true, still-privacy-positive statement (list stays in the browser) rather than shrunk to 2 bullets — keeps the section's visual rhythm intact. |
| Contact | Tone softened; mailbox verification flagged to PM, not resolved by copy (§5). |

**Mobile (375px) shape of the redesigned Data sources section** — scannable top to bottom, no horizontal scroll, no table (tables don't reflow at 320px; a vertical list does):

```
Data sources / Datenquellen
──────────────────────────
Six of the seven stores are read straight from the
retailer's own website or flyer. Coop is the exception —
coop.ch blocks automated access, so Coop's prices come
from aktionis.ch, a public Swiss deal site, instead.

● Migros   the public weekly flyer (Issuu, Zurich edition)
● Coop     aktionis.ch — coop.ch blocks automated access
● Denner   denner.ch, the store's own site
● LIDL     the public weekly flyer
● ALDI     the public weekly flyer
● SPAR     the public weekly flyer
● Volg     volg.ch, the weekly offers page

Collected Monday, Tuesday and Thursday. If data is more
than 9 days old, a banner tells you so on the deals page.
```

Each row: brand dot (12px, `STORE_BRAND` colour, decorative — store name is the text, so colour is never the only signal) + store name (font-semibold) + source description (`text-ink-2`, wraps to a second line on narrow screens without breaking alignment — it's a flex row with `items-start`, not a fixed grid column, so German's longer compound words never clip). Same typographic scale as the existing bullet lists (`text-base` / `text-sm`), same `gap-2`/`mt-5` rhythm as neighbouring sections. No new component library, no new colour — this is markup + copy, buildable as a `<ul>` inside the existing `data-sources` section.

### 1b. Homepage `MethodologyStrip` (`components/landing/MethodologyStrip.tsx`)

**Today:** 3-step strip (Weekly discounts / from aktionis.ch — Normalised prices / per L, kg, piece — Category winners / by avg % off) + a link to Hidden Suggestions.

**Redesigned:** same 3-card grid (`grid-cols-3` on desktop, stacks on mobile — no layout change), no link (removed by the other spec), copy changed on 2 of 3 cards:
- Card 1 ("Weekly discounts"): description no longer names aktionis.ch as *the* source.
- Card 2 is **re-themed** from "Normalised prices" (misleading — implies per-unit price feeds the verdict, it doesn't) to "Category check" (the AI classification + cross-check step, which the fact sheet confirms *is* a real pipeline stage that precedes the verdict). This makes the 3-card strip actually mirror the real pipeline order: collect → categorise (AI-checked) → winner by avg % off.
- Card 3 unchanged (already accurate).

This is a meaning change to card 2, not just a wording fix — flagged explicitly so the Design Challenger can weigh in on whether re-theming a card counts as scope creep for a "copy rework." I judge it in scope because the alternative (keeping "Normalised prices per L/kg/piece" as a numbered *method step*) actively misstates how the verdict is computed, which the brief says not to paper over.

### 1c. Footer (`components/Footer.tsx`)

**Today:** one line, `© 2026 basketch · {disclaimer} · {source}` where `{source}` = "Data from aktionis.ch".

**Redesigned:** same single-line layout, `{source}` rewritten to name the real split in ~7 words, still short enough for the existing `text-xs` footer line at 375px (verify visually — the string is ~15% longer than today's; if it wraps to a second line on the smallest supported width that's acceptable, footer text already wraps, no fixed height).

### 1d. Deals page (`DealsClient.tsx`, `DealCard.tsx`)

No structural change. Two related items are **not** touched by this spec, both flagged to PM instead (§5):
- The "Cheapest" tag's label/meaning (fact sheet explicitly defers this as a product decision).
- `share_verdict.share_text`, which is sent from the deals/verdict share flow — copy fixed (§2) but no UI change.

---

## 2. Final copy — every stale string, EN + DE

"Key" = the i18n path. "File" = both `web-next/src/messages/en.json` and `de.json` unless noted (same key, both files).

### 2.1 `about.data_sources.body` → repurposed as `about.data_sources.intro`
*(rename flagged, not mandatory — Builder may keep the key `body` if renaming touches more call sites than expected; content change is what matters)*

- **EN:** "Six of the seven stores are read straight from the retailer's own website or flyer. Coop is the exception — coop.ch blocks automated access, so Coop's prices come from aktionis.ch, a public Swiss deal site, instead."
- **DE:** "Sechs der sieben Läden lesen wir direkt von der Website oder dem Flyer des Anbieters. Coop ist die Ausnahme — coop.ch blockiert automatisierte Zugriffe, darum stammen Coop-Preise von aktionis.ch, einem öffentlichen Schweizer Angebotsverzeichnis."

### 2.2 New: `about.data_sources.source_<store>` — 7 keys (per retailer)

| Key | EN | DE |
|---|---|---|
| `source_migros` | "Migros — the public weekly flyer (Issuu, Zurich edition)" | "Migros — der öffentliche Wochenflyer (Issuu, Ausgabe Zürich)" |
| `source_coop` | "Coop — aktionis.ch, a public deal site (coop.ch blocks automated access)" | "Coop — aktionis.ch, ein öffentliches Angebotsverzeichnis (coop.ch blockiert automatisierte Zugriffe)" |
| `source_denner` | "Denner — denner.ch, the store's own site" | "Denner — denner.ch, die Website des Anbieters selbst" |
| `source_lidl` | "LIDL — the public weekly flyer" | "LIDL — der öffentliche Wochenflyer" |
| `source_aldi` | "ALDI — the public weekly flyer" | "ALDI — der öffentliche Wochenflyer" |
| `source_spar` | "SPAR — the public weekly flyer" | "SPAR — der öffentliche Wochenflyer" |
| `source_volg` | "Volg — volg.ch, the weekly offers page" | "Volg — volg.ch, die Seite mit den Wochenaktionen" |

(Store *names* reuse `STORE_BRAND` keys already in `store-tokens.ts` — do not hardcode "Migros"/"Coop" text separately from that map, per CLAUDE.md's naming-consistency rule.)

### 2.3 `about.data_sources.note` (repurposed as the freshness line)

- **EN:** "Collected Monday, Tuesday and Thursday. If data is more than 9 days old, a banner tells you so on the deals page."
- **DE:** "Erfasst am Montag, Dienstag und Donnerstag. Sind die Daten älter als 9 Tage, siehst du das mit einem Hinweis auf der Aktionen-Seite."

### 2.4 `about.how_it_works.step1`

- **EN:** "We collect current promotions from seven Swiss supermarkets up to three times a week — the exact date is on the deals page."
- **DE:** "Wir erfassen die aktuellen Aktionen von sieben Schweizer Supermärkten bis zu dreimal pro Woche — das genaue Datum steht auf der Aktionen-Seite."

### 2.5 `about.how_it_works.step2`

- **EN:** "Each product is sorted into Fresh, Long-life or Household by an AI model, with a second AI checking every answer. When they disagree, the deal is still shown, marked 'Category unverified.'"
- **DE:** "Jedes Produkt wird von einem KI-Modell in Frisch, Lange haltbar oder Haushalt eingeordnet; ein zweites KI-Modell prüft jede Antwort. Bei Uneinigkeit wird die Aktion trotzdem angezeigt, aber als „Kategorie ungeprüft" markiert."

### 2.6 `about.how_it_works.step3`

- **EN:** "The verdict is ready right away. Browse all deals, or add items to a list and share it with whoever's shopping."
- **DE:** "Das Fazit steht sofort bereit. Durchstöbere alle Aktionen oder lege eine Liste an und teile sie mit der Person, die einkauft."

### 2.7 `about.privacy.bullet3` (repurposed, not deleted-and-shrunk — see §3)

- **EN:** "Your list is saved only in your browser — nothing is sent to a server."
- **DE:** "Deine Liste wird nur in deinem Browser gespeichert — es wird nichts an einen Server gesendet."

### 2.8 `about.contact.body`

- **EN:** "basketch is a small Swiss project — feedback welcome. Contact: hello@basketch.app"
- **DE:** "basketch ist ein kleines Schweizer Projekt — Feedback willkommen. Kontakt: hello@basketch.app"

*(Mailbox liveness is UNVERIFIED per fact sheet — this is a tone edit only, not a fix; see open question §5.)*

### 2.9 `footer.source`

- **EN:** "Data from 7 Swiss retailers — Coop via aktionis.ch"
- **DE:** "Daten von 7 Schweizer Läden — Coop via aktionis.ch"

### 2.10 `methodology.step1_d`

- **EN:** "from 7 Swiss retailers"
- **DE:** "von 7 Schweizer Läden"

### 2.11 `methodology.step2_t` / `step2_d` (re-themed, see §1b)

- **EN step2_t:** "Category check" · **step2_d:** "AI-assigned, cross-checked"
- **DE step2_t:** "Kategorie-Prüfung" · **step2_d:** "KI-zugewiesen, gegengeprüft"

### 2.12 `share_verdict.share_text`

- **EN:** "This week's grocery deals across 7 Swiss stores, side by side."
- **DE:** "Die Aktionen dieser Woche bei 7 Schweizer Läden, im Vergleich."

### fr / it — not live, listed only

`i18n/routing.ts` routes only `['de', 'en']`; `fr.json`/`it.json` are unrendered stub files (their `home` namespace is still a placeholder — "basketch est en cours de refonte" / "è in fase di ricostruzione" — they were never wired to the current homepage). They also have **no `about` or `methodology` namespace at all** today. Per the brief ("copy only if rendered"): no FR/IT copy is given here. Keys present and stale, to fix only when FR/IT ship:
- `fr.json:13` `footer.source` = "Données de aktionis.ch" — not live.
- `it.json:13` `footer.source` = "Dati da aktionis.ch" — not live.

---

## 3. Strings to delete (false claims)

| Key | File | Current text | Disposition |
|---|---|---|---|
| `about.privacy.bullet3` | en.json / de.json | "Email is optional and only used to find your list." | **Delete this content.** No e-mail feature is live (fact sheet §4a). Recommend replacing with the true bullet in §2.7 rather than dropping to 2 bullets, to preserve the section's visual rhythm — Builder/PM call if they'd rather just remove it. |
| "…since 2006" (part of `about.data_sources.body`) | en.json / de.json | "…a public Swiss deal aggregator **since 2006**." | Delete — UNVERIFIED (fact sheet §6.1). Superseded by the full rewrite in §2.1, which drops the clause entirely. |
| `about.how_it_works.step3` clause "…or track your regular items for a personal comparison." | en.json / de.json | as above | Delete — feature not live (fact sheet §3d). Superseded by §2.6. |
| `about.data_sources.stores_label` | en.json / de.json | "Stores tracked: Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg." | Delete — redundant once the per-retailer source list (§2.2) exists; keeping both repeats the same store names twice in one section. |

Not included here (already scoped to the other spec): `worth_picking_up.*`, `hidden_suggestions.*`.

---

## 4. Acceptance criteria + tests the Builder should write first (TDD)

Write these as a new suite, e.g. `web-next/src/messages/copy-accuracy.test.ts`, reading the raw JSON (not rendered components) so it fails immediately on the current stale content — red first, per this project's TDD rule.

1. **No locale string overstates the source.** `de.json` and `en.json`, flattened to a single string, must not match `/all deal data comes from aktionis|alle aktionsdaten stammen von aktionis/i`. (Catches the current `about.data_sources.body`.)
2. **No locale string claims a 2006 provenance.** No match for `/since 2006|seit 2006/i`.
3. **No locale string claims per-item automatic cheapest-store routing.** No match for `/route.*cheapest store|cheapest store.*routing|we route each item/i` anywhere in `en.json`/`de.json` (the "Cheapest" tag label itself, `deals.cheapest`, is exempt from this test — it's a 1-word tag, not a routing claim, and is a separate open question, §5).
4. **No locale string promises the "track regular items" or e-mail-for-list feature.** No match for `/track your regular items|verfolge deine üblichen artikel/i` or, in `about.privacy.bullet3` specifically, no mention of "email"/"e-mail" tied to the list.
5. **`footer.source` and `methodology.step1_d` do not name aktionis.ch as the sole source.** Assert both strings, in both locales, either omit "aktionis" entirely or also mention a plural/majority-direct framing (e.g. contain "7" or "Coop" alongside "aktionis" — i.e. never *just* "Data from aktionis.ch").
6. **The per-retailer source list is complete.** For each of the 7 `STORE_BRAND` keys, assert `about.data_sources.source_<store>` exists, is non-empty, and is present in both `en.json` and `de.json`.
7. **`share_verdict.share_text` names more than two stores.** Assert it does not match `/Migros.*Coop|Migros vs Coop/i` verbatim as a two-store comparison (a mention of "Migros" and "Coop" among other store names is fine; naming only those two as *the* comparison is not).
8. **JSON validity + key-parity regression** (likely already exists for the locale files — extend, don't duplicate): `en.json` and `de.json` have identical key sets after this change (no orphaned `stores_label` key left in one file only).
9. **Component-level:** extend `about/page.test.tsx` (or create it if it doesn't exist) to assert all 7 store names render inside the `data-sources` section — catches a future edit that silently drops a retailer row.
10. **Regression name each test after the defect it prevents** (per CLAUDE.md TDD rule), e.g. `does not claim aktionis.ch as the only source`, not `test data sources copy`.

Acceptance criteria for the feature as a whole:
- [ ] All 10 tests above pass.
- [ ] `about` page: per-retailer source list renders all 7 stores with correct source text, reflows at 320px, no horizontal scroll.
- [ ] `MethodologyStrip`: 3 cards render, card 2 shows "Category check", no dead link to `/settings/hidden` remains (verified by the other spec's own acceptance criteria, not re-tested here).
- [ ] Footer, About, Home strip, and `share_verdict` copy all pass a manual read-through in German first (de is primary locale) for Swiss understated tone — no exclamation marks, no "we guarantee," no superlatives beyond what's factual.
- [ ] `cd web-next && npm test` and `./node_modules/.bin/tsc --noEmit -p tsconfig.json` both clean.

---

## 5. Open PM questions

1. **"Cheapest" tag (`deals.cheapest`).** It labels the deal with the biggest % discount in its sub-category, not the lowest price or unit price. Two options, no default chosen here: (a) rename the tag (e.g. "Biggest discount") — most honest, but a bigger UI/brand change than a copy patch; (b) keep "Cheapest" but add a one-line clarifier the first time it's seen (e.g. a tooltip/legend: "Cheapest = biggest % off this week"). This is explicitly a product/legal call (Art. 3(1)(e) UWG accuracy), not a design default — please decide.
2. **Per-item cheapest-store routing vs. current behaviour.** CLAUDE.md's stated goal is "routing each item to its cheapest store." Today, the site ranks *categories* by average % discount and lets the visitor manually add individual deals to a list grouped by store — there is no per-item cheapest-store engine. This is a real gap between the stated product goal and shipped behaviour, not a copy problem I can word around. Worth a explicit PM decision: keep the current category-verdict model and adjust the stated goal, or treat per-item routing as a roadmap item and say so.
3. **`hello@basketch.app` — is it a monitored inbox?** UNVERIFIED per fact sheet. If not currently checked, either start monitoring it or replace/remove the contact line before shipping this copy.
4. **`CLAUDE.md:7`** currently says "aktionis.ch is dropped" — confirmed inaccurate for Coop (fact sheet §1a/§5b). Not touched by this spec (design/spec only, no source edits), but flagging since it's the one line most likely to keep misleading a future contributor or agent.
5. **Availability strip / "Notify me" status conflict.** The fact sheet (§3d) says the availability strip and "notify me when this drops" e-mail live only inside the unrendered `V3PreviewSection` and are not live. The separate "remove Worth a look" spec describes `AvailabilityCellSheet.tsx`'s own Notify-me flow (writing to `user_interest`) as a *live, separate, untouched* feature. These two documents disagree on whether any notify/availability UI is currently reachable by a visitor. Out of scope for this copy pass (no `availability.*` strings are touched here), but worth the Architect reconciling before anyone writes copy that assumes either answer.
6. **Renaming `about.data_sources.body` → `intro`, and repurposing `note`/`bullet3` instead of adding new keys.** Flagged as a design preference to keep the section shell stable; Tech Lead/Builder should confirm key-renaming cost before Build, since a rename touches more than a content edit would.

---

**Summary for the Challenger:** every rewritten string in §2 is traceable to a fact-sheet line; nothing UNVERIFIED is asserted; the per-retailer source list is new content, not a new component, sourced entirely from fact sheet §1; the "Cheapest" tag and the cheapest-store-routing gap are surfaced as questions, not quietly resolved.
