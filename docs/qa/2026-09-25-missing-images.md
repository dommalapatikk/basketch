# Missing product images — live check 2026-09-25

Measured against production (`https://basketch.vercel.app/de/deals`, server-rendered
payload, 1,623 deal objects). Not yet root-caused; not fixed.

| Store | Deals | Photo URL | Flyer crop | Shows a picture? |
|---|---|---|---|---|
| Coop | 1,003 | 1,003 | 0 | Yes (sample URL: 200 direct, 200 via `/_next/image`) |
| Denner | 241 | 241 | 0 | Yes (sample: 200 / 200) |
| LIDL | 35 | 35 | 0 | Yes (sample: 200 / 200) |
| Migros | 49 | 0 | 49 | Yes (page image `image.isu.pub`: 200 direct; plain `<img>` by design) |
| **ALDI** | **211** | 0 | **0** | **No — every ALDI card is empty** |
| **SPAR** | **60** | 0 | 0 | **No — by design** (c337031: no evidence SPAR publishes page images) |
| **Volg** | **24** | 17 | 0 | **No — all 17 URLs return 404 at www.volg.ch; 7 have no URL** |

Only one URL per host was tested for Coop/Denner/LIDL.

## Leads (unverified)

- **ALDI — likely regression.** c337031 (2026-09-16) wired ALDI `pageImageUrl` so crops
  are built (`aldi-flyer-source.ts:191`). Run 35983172760 collected 163 ALDI offers
  (35 warnings, all "price has no product name below it"), yet 0 of 211 live ALDI deals
  carry a crop. Enrichment log: "451 of 1631 matched NO row — those deals have no crop",
  then "69 of 1631" in the second pass. Crop is lost somewhere between collection and
  the `deals` row / frontend mapping. Needs tracing.
- **Volg — dead links.** Every `www.volg.ch/fileadmin/_processed_/…csm_promo_…jpg` URL
  404s. Volg likely regenerates processed image paths; stored URLs go stale.
- **SPAR — known, accepted** as an honest empty card in c337031. A product decision
  whether to revisit.
