# PM decisions — 2026-09-25

Answers to the open questions in `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md` §8
and `docs/design/2026-09-25-data-source-copy-rework.md` §5. Recorded by the coordinator
from the PM's own words.

| Id | Question | PM decision |
|---|---|---|
| D-1 | ALDI: a third request (`spreads.json`) per publication | **Yes — fetch it.** Unblocks WP-6. |
| D-2 | Volg: daily image refresh, or accept empty cards | **No empty boxes.** Volg must show pictures; a daily refresh is approved. Unblocks WP-7c. |
| D-3 | SPAR: stay imageless, or ask permission | **SPAR must show pictures.** PM: "I cannot ask Spar for a permission. Just use their pictures… if you have PDF, just pass the PDF and truncate and show those pictures." Team to design the approach (signed-token page images vs. crops from the flyer PDF). Unblocks WP-8. |
| D-4 | Image-coverage alert severity | **Warn, still publish.** Fresh deals go live; the alert names the store that lost pictures. |
| D-5 | Lidl Plus label into the main upsert | Not objected to — **handled as a technical decision** by the Tech Lead. |
| D-6 | Retailer photos via `next/image` (re-encoded/cached on Vercel), incl. Coop photos from a third-party host | **PM accepts: "I don't think legally there is an issue."** Keep `next/image`. WP-9 closed as no-change. The PM's decision; the URG note in `product-image.tsx` should be updated to reflect it rather than contradict it. |
| P-7 | The "Cheapest" tag actually means biggest % discount | **Make it true: "Cheapest" must mean the lowest price.** Keep the label; change the logic. |
| P-8 | Build per-item cheapest-store routing, or keep the category comparison | **Keep today's category comparison.** Do not build routing now. |
| P-9 | `hello@basketch.app` | **Not used.** Replace with a **contact form** that emails the PM's Gmail (the PM told the coordinator which address; it is set only as a secret), address held in a secret setting, never in the page or repo. Must stay on free tiers. |
| P-10 | Order within each section: cheapest-per-kg first (A) or biggest discount first (B) | **B — biggest discount stays first.** PM: "the simplest one is bigger discount… the more the discount, then that's the better one." The "Cheapest" tag (lowest price per kg / l / piece among comparable offers, P-7) is shown on whichever card earns it, wherever it sits. |
| P-11 | Global 404 page: full Header/Footer, or a minimal page (Architect cross-review D4) | **Simple page.** basketch brand bar, "Page not found", and two localized buttons ("See this week's deals", "Home"), in DE or EN to match the link. |
| P-12 | Coop source (2026-09-26 Architect research) | **Stay on aktionis.ch.** Coop's own flyer is only a ~20% subset; aktionis carries ~1,000/week. Coop flyer recorded as the fallback only if aktionis becomes unavailable. |
| P-13 | "Fairtrade" in Migros names (name-truncation RCA) | **Drop it** from the name, like the other certification labels (kept in `labels`). |
| P-14 | Shared list vs recipient's own list | **Keep them separate — never replace or merge.** A shared link opens as its own view (new tab/window); Architect designs it. |
| P-15 | 404 button wording | **Designer decides** the best option. |
| P-16 | Go-live 2026-09-27 | Wording/plurals/freshness fix (review + QA passed) and pipeline WP-1c/1d/1e: **go live now.** Hourly DB expiry job (Architect D4): PM questions efficiency — prefer event-triggered; Architect + Tech Lead to re-evaluate. |
| P-17 | Stale expired deals (2026-09-27 RCAs) | **Yes — build it.** Replace the 2026-09-15 "today inside the cache, expire 1h" choice with the per-request Zurich date in the cache key (D1) + homepage deals rendered per request (D2) + webhook `expire: 0` (D3) + browser guard (D5) + architecture tests (D6). No scheduled jobs (pg_cron and the midnight cron both dropped). The in-effect/upcoming rules of the 2026-09-15 ADR are unchanged. |
| P-18 | Migros KW39 truth file | **Yes** — Tech Lead writes the hand-read `expectedName` values into `kw39-zh-truth.json` and commits it on the Migros branch (test data only; nothing goes live). |
| P-19 | Go-live 2026-09-28 | **Yes** — stale-expired-deals fix (review + QA passed) and 404-shows-500 fix (review + QA passed). |
