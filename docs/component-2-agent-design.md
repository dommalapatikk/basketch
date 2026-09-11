# Component 2 — Transformation: classifier, metadata agent, cache

**Written:** 2026-09-10. Supersedes the open questions in `docs/component-2-transformation-brief.md`.
**Read first:** `CLAUDE.md`, then `docs/collection-module-design.md`.
**Branch:** `feat/collection-module`.

---

## 1. What component 2 produces

For every collected `Offer`, component 2 must produce a **labelled, enriched product** the site can compare across seven retailers:

| Group | Fields |
|---|---|
| Identity | product name (normalised), brand, manufacturer |
| Classification | category (1 of 11), sub-category, confidence |
| Quantity | amount, unit (`g`/`kg`/`ml`/`l`/`Stück`), pack size, canonical unit price |
| Labels | organic, IP-SUISSE, Suisse Garantie, AOP/AOC |
| Attributes | **category-specific** — milk fat %, butter salted/unsalted, coffee grind, wine vintage… |

Prices, discounts and validity dates are **not** component 2's job. Component 1 already collects
them as structured data from the retailer. Re-deriving them from a product name would be guessing
at something we already know exactly.

---

## 2. The governing principle — the trust hierarchy

Every field is filled from the **highest available tier**, never a lower one when a higher exists.

```
Tier 1  Published structured field        Denner content_size, eco_labels, grapes, year
Tier 2  Published semi-structured text    nameSubline: "am Stück, mager, ca. 900 g, per 100 g"
Tier 3  Deterministic rules on the name   regex: "6 x 1.5 L" → 9 litres
Tier 4  Model inference                   only where nothing above exists
Tier 5  NULL                              the value is not stated anywhere
```

**Tier 5 is a valid, frequent, correct outcome. It is never a failure.**

### 2.1 Why this matters more than it looks

`Emmi Milch 1L` does not state a fat percentage. Ask a model for it and it will answer **3.5%**,
confidently, because that is the most common milk. It will be right often enough to look fine and
wrong often enough to matter.

That is fabricated product data presented to a user as fact. Under **UWG Art. 3(1)(e)** price
comparisons must be objectively correct — a wrong fat percentage beside a price is precisely what
that provision covers.

> **The rule: extract only what is written. Never infer. Absent is `null`, not a good guess.**

Every attribute prompt states this explicitly, and the benchmark tests for it: feed
`Emmi Milch 1L` and assert `fatPercent === null`, not `3.5`.

### 2.2 The tier available differs per retailer

| Retailer | Best tier available | Consequence |
|---|---|---|
| Denner | **1** — rich structured attributes | model barely needed |
| Volg | 2–3 — HTML with some structure | rules do most of it |
| Lidl | 2–3 — flyer JSON | rules do most of it |
| Coop (aktionis) | 3 — product name only | model does the work |
| Aldi, Spar | 3 — PDF text | model does the work |
| Migros | 4 — noisy OCR names | model does the work, low confidence |

The model's workload is **inversely proportional to how much the retailer publishes.** This is why
the classifier sits behind a port and the agent decides per-item how hard to work.

---

## 3. Prerequisite — component 1 currently discards published metadata

`DennerApiSource` maps only `name`, `price`, `insteadPriceText`, `discount_text`, `promotionFrom/To`,
`imageUrl`, `itemUrl`, `_tracking_item_category2`. Denner also sends, per item:

```
content_size_text  content_size  nameSubline  unit_price  salesQuantity  box_item_count
eco_labels  eco_label_logo  canister  category
grapes  year  wine_type  region_name  country_name  storage  tannins  acid  sugar
intensity  barrique_aging  character  rating  ratingTotal
```

**Action:** extend the `Offer` aggregate with a `sourceAttributes` value object carrying
tier-1 metadata, and populate it in each adapter where the retailer publishes it. Without this,
component 2 will use a model to guess values Denner is handing us for free.

### 3.1 ⚠️ Tier 1 is not automatically correct — measured 2026-09-10

Live check across 291 Denner offers: for wines carrying a vintage in **both** the structured `year`
field and the `nameSubline`, the two disagree **7 times out of 26 — 27%**.

```
Séduction Cabernet/Syrah Pays d’Oc IGP        year=2024   subline says 2025
Big Red Beast Côtes Catalanes IGP             year=2023   subline says 2022
Bio Monte Zovo Sa’ Solin Ripasso DOC          year=2023   subline says 2024
Concha y Toro Casillero del Diablo Reserva    year=2023   subline says 2024
Coto de Imaz Reserva Rioja DOCa               year=2021   subline says 2020
```

We cannot tell from outside which is current — plausibly the subline is hand-updated per promotion
while `year` is stale in the PIM, but that is a guess.

**Consequence: the trust hierarchy needs a conflict rule, not just an ordering.** Two published
sources disagreeing is not the same as one source being absent. Silently preferring either one
publishes a product fact we know may be wrong, which is the same failure mode as inferring it.

### 3.2 The conflict rule must be generic, not per-field (architecture finding A1)

**The trap.** The obvious fix is a rule saying *"for Denner wine, `year` beats the subline."* That is
correct today and is **the first line of a new exception list** — the same disease that killed
`categorize.ts`:

```
category-rules.ts:473-498     'lauch' excluded because "bärlauchschnitzel"…
                              'oliven' excluded because "olivenöl"…
                              → four exceptions today, unbounded tomorrow

the same shape, relocated:    "Denner wine: year beats subline"
                              "Lidl: content beats description"
                              "Aldi: tile weight beats printed weight"
```

**The rule instead.** Every extracted field carries its own provenance, and conflicts are data:

```ts
type Extracted<T> = {
  readonly value: T | null
  readonly tier: 1 | 2 | 3 | 4          // where it came from
  readonly sourceField: string          // 'year' | 'nameSubline' | 'regex:quantity'
  readonly conflicted: boolean          // two sources disagreed
  readonly alternatives: readonly { value: T; tier: number; sourceField: string }[]
}
```

Precedence is then **measured, not written**: score each source field against the benchmark and let
the winner emerge. One mechanism that improves with data, instead of a list a human maintains.

D2's finding (`year` beats subline, verified against live product pages) becomes the *first measured
data point*, not a hardcoded branch.

**Until enough data exists to measure:** highest tier wins, `conflicted` is set, confidence is
reduced. Nothing is discarded — every alternative is retained.

**Do not** trust these two:
- `_tracking_item_category1/3/4/5` — a reused analytics slot. For wine it holds country, star
  rating and storage temperature. Only `category2` is a real category.
- `_tracking_item_brand` — holds the **region** for wine (`Colchagua Valley`). Unreliable.

---

## 4. Classification

Replaces `pipeline/categorize.ts` and `shared/category-rules.ts` entirely.

### 4.1 Why the keyword matcher is deleted, not patched

```
category-rules.ts:205   'tomaten'      → vegetables   (fresh)
category-rules.ts:341   'tomatenpüree' → canned       (long-life)
```

`tomaten` is a substring of `tomatenpüree`; whichever rule is evaluated first wins. That is the
tomato-purée bug. Maintaining it has produced a growing exception list:

```
'lauch'   excluded — "bärlauchschnitzel" is meat
'oliven'  excluded — "olivenöl" is condiments
'tomaten' excluded — "risotto tomaten" is pasta-rice
'gemüse'  excluded — "gemüseschäler" is a kitchen peeler
```

German compound nouns are unbounded, so the exception list is unbounded. This is a root-cause
failure, not a tuning problem.

### 4.2 The replacement

A model call behind a `Classifier` port. Output constrained to `BROWSE_CATEGORIES`
(`shared/types.ts`). Batched 25 products per call so the category list is sent once, not 6,000 times.

**The returned category is validated in the domain layer**, not the adapter. A model can return
`"tinned-goods"` — well-formed, plausible, and not one of our eleven. A classification naming a
category that does not exist is not a classification. That is an invariant.

---

## 5. Attribute schemas — all categories

Derived from 244 live Denner offers (2026-09-09), not invented. Every field is nullable; `null`
means *not stated in any available source*.

### 5.0 The hierarchy at a glance

Three levels: **browse category** → **sub-category** → **attributes**. The sub-category selects
which attribute schema the enrich step loads.

```
CROSS-CUTTING — every leaf inherits these
  organic · label(ip-suisse|suisse-garantie|aop|aoc|demeter) · origin
  quantity + unit · packSize · lactoseFree · glutenFree · vegan

🥬 fruits-vegetables
   ├── fruit ......... produce · variety · soldBy · preparation
   └── vegetables .... produce · variety · soldBy · preparation

🥩 meat-fish
   ├── meat .......... animal · cut · preparation · form · leanness · priceBasis
   ├── poultry ....... animal · cut · preparation · form · priceBasis
   ├── fish .......... species · wildCaught · preparation · form · priceBasis
   └── deli .......... animal · preparation(cured|smoked) · origin · sliced

🧀 dairy
   ├── dairy ......... dairyType · fatPercent · treatment · cheeseFirmness
   │                   milkSource · salted · flavour · sugarFree
   └── eggs .......... count · size(S|M|L|XL) · farming(freiland|boden|bio|weide)

🍞 bakery
   └── bread ......... bakedGood · grain · sourdough · sliced · regional

🍫 snacks-sweets
   ├── chocolate ..... sweetForm · chocolateType · cocoaPercent · inclusion · sizeVariant
   └── snacks ........ savouryForm · flavour · sizeVariant

🍝 pasta-rice-cereals                              ⚠️ no benchmark coverage
   └── pasta-rice .... staple · pastaShape · riceType · wholegrain · cookTime · eggPasta

🥤 drinks
   ├── water ......... carbonation · container
   ├── juice ......... fruit · fromConcentrate · sugarFree
   ├── soft-drinks ... sugarFree · caffeine · container
   ├── beer .......... beerStyle · abv · alcoholFree · container
   ├── wine .......... wineColour · vintage · grape · appellation · qualityTerm
   │                   region · country · sweetness · barrique
   ├── coffee ........ coffeeForm · capsuleSystem · intensity · roast · decaf
   └── tea ........... teaType · form · decaf

🍕 ready-meals-frozen
   ├── ready-meals ... dishType · cuisine · filling · servings · vegetarian
   └── frozen ........ dishType · cuisine · filling · servings · vegetarian   [frozen=true]

🥫 pantry-canned                                   ⚠️ no benchmark coverage
   ├── canned ........ pantryType · preservation · inSyrup · inBrine · inOil
   └── condiments .... pantryType · oilType · heatLevel · needsPreparation

🧹 home
   ├── laundry ....... laundryVariant · detergentForm · washLoads · scent · tier
   ├── cleaning ...... homeType · form · scent · tier
   ├── paper-goods ... homeType · plyCount · sheetCount · rollCount · tier
   └── household ..... homeType · form · tier

🧴 beauty-hygiene
   └── personal-care . careType · function · bodyArea · applicationTime
                       targetGroup · skinType · scent · spf
```

**Reading it:** a product classified `drinks / wine` loads the wine schema — nine wine attributes
plus the seven cross-cutting ones. It is never asked about `fatPercent` or `washLoads`. That
narrowing is why enrichment must follow classification (§6.1).

### Cross-cutting (apply to every category)

| Field | Values | Source tier |
|---|---|---|
| `organic` | boolean | 1 (`eco_labels`) or 3 (`bio`, `Bio` in name) |
| `label` | `ip-suisse` \| `suisse-garantie` \| `aop` \| `aoc` \| `demeter` \| `null` | 1 or 3 |
| `origin` | country / canton | 1 (`country_name`) or 3 |
| `packSize` | integer | 1 (`box_item_count`) or 3 (`6 x`) |
| `quantity` + `unit` | number + `g`/`kg`/`ml`/`l`/`cl`/`Stück` | 1 (`content_size`) or 3 |
| `lactoseFree`, `glutenFree`, `vegan` | boolean | 3 |

### 1. fruits-vegetables — `fruit`, `vegetables`

Real names: `Bohnen`, `Trauben dunkel`, `Kaktusfeigen`, `Eierschwämme`, `Flachnektarinen`

| Field | Values |
|---|---|
| `produce` | the item — `Trauben`, `Bohnen` |
| `variety` | `dunkel`, `hell`, `Flach-`, cultivar |
| `soldBy` | `weight` \| `piece` \| `punnet` |
| `preparation` | `whole` \| `pre-cut` \| `salad-mix` |

> Poorest-metadata category. Names are frequently one word. Expect heavy `null`.

### 2. meat-fish — `meat`, `poultry`, `fish`, `deli`

Real names: `Denner Schweinsnierstück` (subline `am Stück, mager, ca. 900 g, per 100 g`),
`Denner Trutenfiletmedaillons`, `Ancora Alaska Wildlachs`, `Bigler Tessiner Coppa`

| Field | Values |
|---|---|
| `animal` | `pork` \| `beef` \| `veal` \| `chicken` \| `turkey` \| `lamb` \| `fish` \| `seafood` |
| `cut` | `Nierstück`, `Huft`, `Filet`, `Voressen`, `Medaillons` |
| `preparation` | `raw` \| `marinated` \| `breaded` (`paniert`) \| `cooked` \| `cured` \| `smoked` |
| `form` | `whole` \| `sliced` \| `minced` \| `skewer` (`Spiessli`) \| `sausage` |
| `leanness` | `mager` \| `null` |
| `wildCaught` | boolean (`Wildlachs`) |
| `priceBasis` | `per-100g` \| `per-kg` \| `per-piece` — **from subline, affects comparison** |

### 3. dairy — `dairy`, `eggs`

Real names: `Denner Milchdrink`, `Emmi Caffè Latte Macchiato`, `Le Gruyère AOP Hartkäse`,
`Soignon Back-Ziegenfrischkäse`, `Danone Activia Joghurt`

| Field | Values |
|---|---|
| `dairyType` | `milk` \| `yoghurt` \| `cheese` \| `butter` \| `cream` \| `quark` \| `dessert` |
| `fatPercent` | `0.1` \| `1.5` \| `2.5` \| `3.5` \| `3.9` — **`null` unless printed** |
| `treatment` | `uht` \| `pasteurised` \| `raw` (`Rohmilch`) |
| `cheeseFirmness` | `hart` \| `halbhart` \| `weich` \| `frisch` |
| `milkSource` | `cow` \| `goat` (`Ziegen`) \| `sheep` \| `buffalo` |
| `salted` | boolean — **butter only, `null` unless stated** |
| `flavour` | `Banane`, `Erdbeere`, `natur` |
| `sugarFree` | boolean (`Double Zero`) |
| **eggs** `count` | integer |
| **eggs** `size` | `S` \| `M` \| `L` \| `XL` |
| **eggs** `farming` | `freiland` \| `boden` \| `bio` \| `weide` |

> ⚠️ Not one of the 12 real Denner dairy names stated a fat percentage. `fatPercent` will be
> `null` far more often than not. That is correct behaviour, not a bug.

### 4. bakery — `bread`

Real names: `Laugenkranz mit IP-SUISSE Mehl`, `Appenzeller Bärli-Biber`, `Canelés de Bordeaux`

| Field | Values |
|---|---|
| `bakedGood` | `bread` \| `roll` \| `pastry` \| `biscuit` \| `cake` \| `speciality` |
| `grain` | `weiss` \| `ruch` \| `vollkorn` \| `dinkel` \| `roggen` |
| `sourdough` | boolean |
| `sliced` | boolean |
| `regional` | `Appenzeller`, `Bordeaux` |

### 5. snacks-sweets — `snacks`, `chocolate`

Real names: `Cailler Tafelschokolade Milch mit ganzen Haselnüssen`, `Lindt Lindor Kugeln Assortiert`,
`Zweifel Original Chips Chnoblibrot`, `Koestlin Saltas Salzstangen`

| Field | Values |
|---|---|
| `sweetForm` | `bar` (`Tafel`) \| `pralines` \| `balls` (`Kugeln`) \| `biscuit` \| `sweets` \| `wafer` |
| `chocolateType` | `milch` \| `dunkel` \| `weiss` \| `assortiert` |
| `cocoaPercent` | number — `null` unless printed |
| `inclusion` | `Haselnüsse`, `Caramel`, `Pistazie`, `Crisp` |
| `savouryForm` | `chips` \| `flips` \| `sticks` (`Salzstangen`) \| `nuts` \| `crackers` \| `popcorn` |
| `flavour` | `Paprika`, `Chnoblibrot`, `Inferno`, `salted` |
| `sizeVariant` | `mini` \| `standard` \| `chunky` \| `king` |

### 6. pasta-rice-cereals — `pasta-rice`

> ⚠️ **Zero coverage in the Denner benchmark.** Denner files these under `Sonstiges`.
> Schema derived from category knowledge; must be validated against Coop/Aldi data before trusting.

| Field | Values |
|---|---|
| `staple` | `pasta` \| `rice` \| `couscous` \| `polenta` \| `flour` \| `cereal` \| `oats` \| `pulses` |
| `pastaShape` | `penne`, `spaghetti`, `fusilli`, `gnocchi` |
| `riceType` | `risotto` \| `basmati` \| `jasmin` \| `parboiled` \| `vollkorn` |
| `wholegrain` | boolean |
| `cookTime` | minutes, `null` unless printed |
| `eggPasta` | boolean |

### 7. drinks — `water`, `juice`, `beer`, `wine`, `soft-drinks`, `coffee`, `tea`

Real names: `Corona Bier Cero 0.0%`, `Freixenet Rosé alkoholfrei`, `Jacobs Kaffeekapseln Lungo 6 Classico`,
`San Pellegrino Mineralwasser`, `Red Bull Energy Drink Sugarfree`

**All drinks**

| Field | Values |
|---|---|
| `drinkType` | `water` \| `juice` \| `soft-drink` \| `energy` \| `beer` \| `wine` \| `spirit` \| `coffee` \| `tea` \| `cocoa` |
| `alcoholFree` | boolean (`alkoholfrei`, `0.0%`, `Cero`) |
| `sugarFree` | boolean (`Zero`, `Sugarfree`) |
| `abv` | number — `8.8`, `0.0`; `null` unless printed |
| `container` | `bottle` \| `can` \| `carton` \| `capsule` (tier 1: `canister`) |
| `carbonation` | `still` \| `sparkling` \| `medium` |

**wine** — mostly tier 1 at Denner (`grapes`, `year`, `wine_type`, `region_name`, `country_name`)

| Field | Values |
|---|---|
| `wineColour` | `rot` \| `weiss` \| `rosé` \| `schaumwein` |
| `vintage` | year — **tier 1 `year`**; note Denner also puts it in the category string |
| `grape` | `Carménère`, `Shiraz`, `Merlot`, `Chardonnay` |
| `appellation` | `DOC` \| `DOCG` \| `AOC` \| `AOP` \| `DO` \| `DOP` \| `IGT` |
| `qualityTerm` | `Riserva` \| `Gran Reserva` \| `Superiore` \| `Classico` |
| `region`, `country` | tier 1 |
| `sweetness` | `brut` \| `extra dry` \| `medium dry` \| `demi-sec` \| `trocken` |
| `barrique` | boolean (tier 1) |

**beer**

| Field | Values |
|---|---|
| `beerStyle` | `lager` \| `hell` \| `blonde` \| `panaché` \| `weizen` \| `ipa` \| `stark` |

**coffee / tea**

| Field | Values |
|---|---|
| `coffeeForm` | `beans` \| `ground` \| `capsule` \| `instant` \| `pods` |
| `capsuleSystem` | `nespresso` \| `tassimo` \| `dolce-gusto` \| `proprietary` |
| `intensity` | integer — `Lungo 6`, `Espresso 10` |
| `roast` | `crema` \| `espresso` \| `classico` \| `filter` |
| `decaf` | boolean |
| `teaType` | `black` \| `green` \| `herbal` \| `fruit` \| `rooibos` |

> ⚠️ `Bosch Tassimo Style Kaffeemaschine` appeared under Denner's coffee category. It is a
> **machine**, not a drink. The grocery filter must catch appliances.

### 8. ready-meals-frozen — `ready-meals`, `frozen`

Real names: `Buitoni Pizza La Classica Due Formaggi`, `Findus Plätzli Chäs`, `Mulan Dim Sum Mix`

| Field | Values |
|---|---|
| `frozen` | boolean — **`ready-meals` vs `frozen` turns on this** |
| `dishType` | `pizza` \| `pasta` \| `dim-sum` \| `plätzli` \| `soup` \| `bowl` \| `dessert` |
| `cuisine` | `italian` \| `asian` \| `swiss` \| `mexican` |
| `filling` | `Chäs`, `Spinat`, `Champignons`, `Due Formaggi` |
| `servings` | integer |
| `vegetarian` | boolean |

### 9. pantry-canned — `canned`, `condiments`

> ⚠️ **Zero coverage in the Denner benchmark** — this is exactly the `Sonstiges` bucket.
> Schema derived from the 47 `Sonstiges` names, which are overwhelmingly this category.

Real `Sonstiges` names: `Knorr Gemüsebouillon`, `Bonduelle Goldmais`, `Del Monte Ananasscheiben`,
`Denner Rapsöl`, `Dona Gemüsekaviar Bakin Ajvar`, `Maggi Würze`, `Natura rote Linsen`

| Field | Values |
|---|---|
| `pantryType` | `canned-veg` \| `canned-fruit` \| `canned-fish` \| `canned-meat` \| `pulses` \| `oil` \| `vinegar` \| `sauce` \| `stock` \| `spice` \| `spread` \| `baking` \| `dessert-mix` |
| `preservation` | `tinned` \| `jarred` \| `dried` \| `powder` \| `paste` |
| `oilType` | `raps` \| `oliven` \| `sonnenblumen` \| `erdnuss` |
| `inSyrup` / `inBrine` / `inOil` | boolean |
| `heatLevel` | `mild` \| `medium` \| `scharf` |
| `needsPreparation` | boolean — bouillon powder vs ready sauce |

### 10. home — `cleaning`, `laundry`, `paper-goods`, `household`

Real names: `Dash Colorwaschmittel Alpen Frische`, `Persil Waschmittel Power Caps Color`,
`Tempo Toilettenpapier Premium`, `Plenty Haushaltspapier Original`

| Field | Values |
|---|---|
| `homeType` | `laundry` \| `dishwashing` \| `surface-cleaner` \| `toilet-paper` \| `kitchen-roll` \| `tissues` \| `bags` \| `foil` |
| `laundryVariant` | `color` \| `voll` \| `fein` \| `black` \| `wolle` |
| `detergentForm` | `pulver` \| `flüssig` \| `caps` \| `gel` \| `sheets` |
| `washLoads` | integer — **the real unit of comparison for detergent** |
| `plyCount` | integer — paper goods |
| `sheetCount` / `rollCount` | integer |
| `scent` | `Alpen Frische`, `Tropical Lily` |
| `tier` | `classic` \| `premium` \| `original` |

> `washLoads` and `rollCount × sheetCount` matter more than pack weight — a detergent price is only
> comparable per wash, not per kilo.

### 11. beauty-hygiene — `personal-care`

Real names: `Head & Shoulders Antischuppen-Shampoo Citrus Fresh`,
`L'Oréal Revitalift Laser X3 Anti-Age-Pflege Augen`, `Victoria's Secret Bodyspray Coconut Passion`

| Field | Values |
|---|---|
| `careType` | `shampoo` \| `conditioner` \| `shower-gel` \| `soap` \| `body-lotion` \| `face-cream` \| `serum` \| `deodorant` \| `bodyspray` \| `toothpaste` \| `razor` \| `hair-colour` \| `sun` |
| `function` | `anti-dandruff` (`Antischuppen`) \| `anti-age` \| `moisturising` \| `firming` \| `volumising` \| `repair` |
| `bodyArea` | `hair` \| `face` \| `eyes` (`Augen`) \| `body` \| `hands` \| `teeth` |
| `applicationTime` | `tag` \| `nacht` |
| `targetGroup` | `men` \| `women` \| `baby` \| `unisex` |
| `skinType` | `trocken` \| `fettig` \| `sensibel` \| `normal` |
| `scent` | `Apple Fresh`, `Coconut Passion`, `Argan Oil` |
| `spf` | integer |

---

## 5b. How many schemas do we actually need?

244 Denner products is a keyhole view. Checked against **Open Food Facts' category taxonomy**
(downloaded 2026-09-10, `static.openfoodfacts.org/data/taxonomies/categories.json`, 4.6 MB):

```
total categories        14,675
with a German name       3,629  (25%)
with a French name      10,655  (73%)
with an Italian name     3,739  (25%)
hierarchical            parents / children, linked to wikidata + food_groups
```

So yes — the real assortment is thousands of product types, not eleven.

**But we do not need 14,675 schemas, and building toward that number would be a mistake.**
OFF's taxonomy is built for global food science; most leaves are hyper-specific
(`en:milks-from-austria`, `en:non-homogenized-milks`). Three separate concerns are being conflated:

| Layer | Count | Purpose | Changes |
|---|---|---|---|
| **Browse categories** | **11** | what a user clicks on the site | rarely |
| **Attribute families** | **~30–40** | which schema governs extraction | occasionally |
| **Product types** | thousands | the actual products | weekly |

A schema is needed per *attribute family*, not per product type. `Vollmilch 3.5%`,
`Ziegenmilch` and `laktosefreie Milch` are three product types sharing **one** milk schema —
`fatPercent`, `milkSource`, `treatment`, `lactoseFree` covers all three. Likewise every one of the
40 chocolate products in the Denner sample is served by a single `chocolate` schema.

The ~25 schemas in §5 are the starting set. Expect them to grow to 30–40 as Coop, Aldi and Migros
data arrives — the gaps will show up as products the enrich step returns mostly-`null` for, which is
a measurable signal, not a guess.

### 5b.1 Open Food Facts as a tier-1 source — promising, unproven

OFF could supply quantity, labels, categories and nutrition as **published structured data**,
free and openly licensed — tier 1 rather than model inference.

**Verified:** the API responds; the taxonomy file is served; the barcode endpoint works.
**Blockers, both real:**

1. **Our offers carry no barcodes.** Not one of the seven adapters extracts a GTIN. Matching would
   be fuzzy name-matching, which reintroduces exactly the substring-collision failure that broke
   `categorize.ts`.
2. **German coverage is 25%.** Swiss product names are German. A source that names three-quarters of
   its categories only in French/English is a weak fit for the input we actually have.

**Status:** worth a spike, not worth designing around yet. Search API was returning 503 at time of
writing, so Swiss product volume is **unmeasured** — that number decides whether this is viable.

---

## 5c. Step-by-step: what is extracted from where, per source

The trust hierarchy (§2) applied concretely. **Rules and published fields run first; the model only
sees what is still `null` afterwards.**

### Denner — API JSON (richest source)

| Field | Tier | Origin |
|---|---|---|
| product name | 1 | `name` / `_tracking_item_name` |
| quantity + unit | 1 | `content_size` (numeric) + `content_size_text` (`"75 cl"`, `"0.9 unit.g"`) |
| pack size | 1 | `box_item_count`, `salesQuantity` |
| unit price | 1 | `unit_price` |
| labels (organic, Suisse Garantie) | 1 | `eco_labels` |
| container | 1 | `canister` |
| category | 1 | `_tracking_item_category2` — **but `Sonstiges` 19% of the time** |
| wine: grape, vintage, colour, region, country, sweetness, barrique | 1 | `grapes`, `year`, `wine_type`, `region_name`, `country_name`, `sugar`, `barrique_aging` |
| cut, leanness, preparation, **price basis** | 2 | parse `nameSubline` — `"am Stück, mager, ca. 900 g, per 100 g"`, `"paniert, 400 g"` |
| brand | 3 | rules on name — ⚠️ **not** `_tracking_item_brand`, which holds the *region* for wine |
| **→ model only for** | 4 | category when `Sonstiges`; sub-category; non-wine attributes |

### Lidl — flyer JSON + PDF

| Field | Tier | Origin |
|---|---|---|
| product name | 1 | `title` |
| validity | 1 | `offerStartDate` / `offerEndDate` |
| quantity, price basis | 2 | **`description` — currently declared in the wire type and never read** |
| price basis (Lidl Plus) | 2 | PDF loyalty cross-check (page-level, existing) |
| category | ✗ | `categoryPrimary` is only `Food` / `Non Food` |
| **→ model for** | 4 | category, sub-category, most attributes |

### Volg — HTML

| Field | Tier | Origin |
|---|---|---|
| product name | 1 | `c-product__title` |
| validity | 1 | section heading date |
| category hint | ✗ | **none — checked and rejected, see below** |
| **→ model for** | 4 | category, sub-category, attributes |

### Coop — aktionis HTML

| Field | Tier | Origin |
|---|---|---|
| product name, prices, validity, image | 1 | card markup |
| everything else | ✗ | nothing published |
| **→ model for** | 4 | category, sub-category, **all** attributes |

> aktionis publishes its own 39-label taxonomy. Deliberately **not** used — it is a third party's
> labelling of Coop's products (see `coop-aktionis-source.ts`). Coop's real taxonomy is unreachable (§10).

### Aldi, Spar — flyer PDF

| Field | Tier | Origin |
|---|---|---|
| product name, price | 1 | PDF text within the tile |
| quantity, descriptor | 3 | regex over remaining tile text — sizes are usually printed on the tile |
| **→ model for** | 4 | category, sub-category, attributes |

### Migros — Issuu JPEG + OCR

| Field | Tier | Origin |
|---|---|---|
| product name | 4 | OCR text — **noisy**, known defect |
| **→ model for** | 4 | everything, and **confidence must be capped lower** for this source |

> A model reading a mis-OCR'd name produces a confident wrong answer from a corrupted input.
> Source quality has to propagate into confidence, or Migros silently poisons the dataset.

### Consequence: three adapter fixes are prerequisites

| Retailer | Fix | Effect |
|---|---|---|
| Denner | capture `sourceAttributes` (§3) | removes most model work for the richest source |
| Lidl | read the `description` field | quantity + price basis without a model |
| Volg | ~~keep the section title~~ | **withdrawn — see below** |

Doing these first shrinks what the model is asked to invent — which is the cheapest possible
accuracy improvement, because published data has no error rate.

> **Correction, 2026-09-10.** An earlier draft of this document claimed Volg's section titles were
> a discarded category signal. They are not. The fixture contains exactly three:
> `Frische-Aktionen`, `Volg-Aktionen`, `Weitere Aktionen*` — promotion buckets, not a taxonomy.
> The existing comment in `volg-html-source.ts` was already correct. Only `Frische-Aktionen` carries
> any signal at all (a weak freshness prior on one of three sections), which is not worth the
> coupling. **The Volg change is withdrawn.**

---

## 6. The agent

The agent does **not** decide categories. It handles uncertainty, failure and budget around calls
that do.

```
                    ┌──────────────┐
   ~1,800 offers ──▶│  cache-load  │── hits (85–95% after month 1) ─────────┐
                    └──────┬───────┘                                       │
                           │ misses                                        │
                           ▼                                               │
                    ┌──────────────┐                                       │
                    │ tier-1 fill  │  published attributes, no model        │
                    └──────┬───────┘                                       │
                           ▼                                               │
                    ┌──────────────┐                                       │
                    │ classify-t1  │  batched 25, cheap model              │
                    └──────┬───────┘                                       │
                           ▼                                               │
                    ┌──────────────┐  category not in BROWSE_CATEGORIES?   │
                    │   validate   │───────────────┐                       │
                    └──────┬───────┘               │                       │
                           ▼                       │                       │
                    ┌──────────────┐               │                       │
                    │ enrich       │  load the sub-category schema,        │
                    │              │  extract only the missing fields      │
                    └──────┬───────┘               │                       │
                           ▼                       │                       │
                    ┌──────────────┐               │                       │
                    │    route     │               │                       │
                    └──┬────┬───┬──┘               │                       │
              confident│    │   │low               ▼                       │
                       │    │   └──▶┌──────────────────┐                   │
                       │    │       │   classify-t2    │ stronger model    │
                       │    │       └────────┬─────────┘                   │
                       │    │                │ still unsure                │
                       │    │                ▼                             │
                       │    │       ┌──────────────────┐                   │
                       │    │       │  flag-uncertain  │ ← never guesses   │
                       │    │       └────────┬─────────┘                   │
                       ▼    ▼                ▼                             ▼
                    ┌───────────────────────────────────────────────────────┐
                    │              cache-write  →  report                   │
                    └───────────────────────────────────────────────────────┘
```

### 6.1 Why enrichment must follow classification

You cannot know which attribute schema applies until you know what the product is. `Findus Plätzli
Chäs` needs the frozen schema; `Le Gruyère AOP` needs the dairy schema. Classification is therefore
a hard dependency of enrichment, and the graph is genuinely two-pass.

### 6.2 The nodes that carry the engineering

| Node | Why it exists |
|---|---|
| `tier-1 fill` | Uses published metadata before any model call. For Denner this alone fills most fields. |
| `validate` | Structured output is not a guarantee. A domain invariant, not an adapter concern. |
| `flag-uncertain` | The node `categorize.ts` never had. Always returning an answer is how the tomato-purée bug hid for months. Uncertainty must reach the database. |
| `route` | Escalation is per-item; tier 1 is batched. Rare enough that one call each is affordable. |

### 6.3 Failure and budget are edges, not try/catch

- Provider returns 5xx / times out → retry with backoff → fall back to the second provider
- Both providers down → **the run fails loudly**; it never writes 1,800 uncategorised rows
- Token or call cap reached → stop, persist what is done, report the shortfall
- Malformed output after N retries → `flag-uncertain`, never a fabricated category

### 6.4 Confidence — to be measured, not assumed

**A model's self-reported confidence is a generated token, not a measurement.** Asked "how sure are
you 0–1?", a model will say `0.95` while wrong.

Options: provider logprobs; self-consistency (classify twice, disagreement ⇒ uncertain); ensemble
(two models disagree ⇒ uncertain).

**Decision procedure:** the Denner benchmark has 197 known answers. Plot claimed confidence against
actual correctness. If claimed 0.9 is right ~90% of the time, the model is calibrated and we use its
number. If claimed 0.9 is right 60% of the time, discard it and use disagreement instead.
Decide from the measurement, not from preference.

---

## 7. Cache

New Supabase table. **Not** the GitHub Actions cache (evicted after 7 days unused) and **not** a
committed JSON file (grows forever, pollutes history).

```sql
create table product_classification_cache (
  cache_key         text primary key,   -- normalised_name | taxonomy_v | prompt_v | schema_v
  normalised_name   text not null,
  category          text not null,
  sub_category      text,
  attributes        jsonb not null default '{}'::jsonb,
  confidence        numeric not null,
  is_uncertain      boolean not null default false,
  model             text not null,
  tier              smallint not null,  -- 1 = cheap, 2 = escalated
  taxonomy_version  smallint not null,
  prompt_version    smallint not null,
  schema_version    smallint not null,
  created_at        timestamptz not null default now()
);

create index on product_classification_cache using gin (attributes);
create index on product_classification_cache (is_uncertain) where is_uncertain;
```

| Decision | Reason |
|---|---|
| Keyed on normalised name, **not** retailer | Coca-Cola is Drinks whether Coop or Denner sells it. One entry serves all seven. |
| Versions **in the key** | The classic cache bug: improve the prompt, and stale answers are served forever. Bumping a version invalidates automatically — no manual flush. |
| `model` and `tier` recorded | Debuggability, and it shows whether escalation earns its cost. |
| Uncertain results cached but flagged | Not re-billed every run, but `where is_uncertain` is the review queue. |
| `attributes` as `jsonb` + GIN | 11 categories × ~8 attributes, still growing. Sparse columns would be unmanageable; jsonb stays queryable and adds fields without migrations. |

**Size:** ~50,000 unique products over the project's life × ~250 bytes ≈ **12 MB** against a 500 MB
free tier.

### 7.1 It is a memo, not a checkpoint (architecture finding A2)

An earlier draft called this the crash checkpoint. **That was wrong, and the wrong word hid a bug.**

The cache records *"this product name was classified"*. It does **not** record *"this offer was
persisted"*. A run dying between classification and the Supabase upsert leaves the cache saying
"done" for a deal that never landed. Checkpoint semantics would skip it forever.

**Correct model: every run processes every offer.** The cache is a memo that makes repeats free —
85–95% hit rate after month one — not a resume point that lets work be skipped.

| | Checkpoint semantics | Memo semantics ✓ |
|---|---|---|
| After a crash | resume at the gap | re-run everything |
| Cost of re-running | avoided | ~zero, all cache hits |
| Can work be silently lost? | **yes** | no |
| Needs run-state tracking | yes | no |

Re-running is therefore always safe and always cheap. This is strictly better than checkpointing,
and it **removes checkpointing from LangGraph's justification** (§8) — the remaining reasons are
tracing, retry/branch structure, and the owner's stated goal of learning the tool.

The DB upsert must be idempotent for this to hold. It already is — the pipeline upserts on a
natural key.

---

## 7b. Traceability and observability

The existing `collection/application/telemetry.ts` port is extended, not replaced. Its own comment
states the problem this section exists to solve:

> *"`pipeline_runs` has been written on every run for months and nothing reads it, so the
> categorisation regression stayed invisible."*

Emitting data is not observability. **The test is whether a wrong category on the live site can be
explained without adding logging first.**

### 7b.1 The traceability question

> *"This tomato purée is filed under fresh vegetables. Why?"*

Answerable from stored data alone, with no re-run:

```
deal row
  ├─ run_id            → pipeline_run     when, which week, which source, which git SHA
  └─ classification_id → cache row        category · sub_category · confidence
                                          model · tier · prompt_version · taxonomy_version
                                          schema_version · is_uncertain
                                          attributes.<field>.provenance  (§3.2)
```

Every field carries its own provenance via `Extracted<T>` (§3.2) — which tier it came from, which
source field, whether sources disagreed, and what the alternatives were. So the answer is not
"the model said so" but *"tier 4, gemini-2.5-flash-lite, prompt v3, confidence 0.61, escalated,
alternatives considered: pantry-canned 0.34."*

**Cost of this:** four extra columns and one foreign key. It is the difference between debugging a
category and guessing at one.

### 7b.2 One correlation ID, end to end

`RunTrace.runId` already exists in collection. It threads through transformation and storage
unchanged, so every row written by a run is attributable to it — and every log line, every
LangSmith trace and every `pipeline_run` row shares that key.

```
runId  ──▶ collection   SourceSpan per retailer      (exists)
       ──▶ transform    TransformSpan                (new)
       ──▶ storage      rows tagged with run_id      (new)
```

### 7b.3 Metrics — RED plus the domain signals that actually matter

RED (rate, errors, duration) is already covered per source by `SourceSpan`. Generic metrics would
not have caught the tomato-purée bug: the run was fast, error-free and wrote thousands of rows. The
domain signals are what make a silent failure legible.

```ts
export type TransformSpan = {
  readonly runId: string
  readonly durationMs: number

  // Cost and cache
  readonly cacheHits: number
  readonly cacheMisses: number          // hit rate should climb to 85–95%
  readonly tokensUsed: number
  readonly estimatedCostRappen: number  // against the hard budget cap

  // The classification ladder
  readonly tier1Classified: number
  readonly tier2Escalated: number       // escalation rate — is tier 2 earning its cost?
  readonly uncertain: number            // never silently zero again
  readonly invalidCategoryRejected: number  // model returned a category that does not exist

  // Publication
  readonly blocked: number              // tobacco (D10) — should be small and non-zero

  // The leading indicator of a source changing shape
  readonly publishedDataCoverage: Record<Retailer, number>  // hasPublishedData() ratio

  // The regression gate
  readonly benchmarkMacroF1: number | null
  readonly benchmarkPerCategory: Record<string, number>
}
```

**`publishedDataCoverage` is the early-warning signal.** If Denner's descriptor coverage falls from
100% to 0% while offers still parse, the source changed shape and the model is quietly doing work it
should not have to. Offer counts would look perfectly healthy.

**`invalidCategoryRejected` should be ~0.** A rising number means the prompt or the taxonomy drifted
apart.

### 7b.4 The self-scoring regression gate

Every run re-scores itself against the Denner benchmark and reports **macro-F1 per category**, not
overall accuracy — drinks, sweets and beauty are 74% of that set, so an overall number is close to
meaningless (§10).

```
run N-1   macro-F1 0.87   →   run N   macro-F1 0.71   →   the run is DEGRADED
```

That is the alarm that did not exist when the keyword matcher broke. It costs a few cents per run
and turns a silent regression into a visible one.

### 7b.5 Three pillars, right-sized

| Pillar | Implementation | Cost |
|---|---|---|
| **Logs** | structured JSON to stdout, `runId` on every line; GitHub Actions retains them | CHF 0 |
| **Metrics** | `TransformSpan` → `pipeline_run` columns; queryable in Supabase | CHF 0 |
| **Traces** | LangSmith for the agent graph — ~240 traces/month against a 5,000 free allowance | CHF 0 |

Still deliberately not OpenTelemetry: no collector, no dependency, no cost, for a weekly cron on a
free tier.

### 7b.6 What must alert

An alarm nobody reads is the state we are fixing. Four conditions, all derivable from the above:

| Condition | Meaning |
|---|---|
| `benchmarkMacroF1` drops > 0.10 vs the previous run | the classifier regressed |
| `publishedDataCoverage[r]` falls to 0 while offers > 0 | retailer `r` changed shape |
| `uncertain / total` > 20% | the model is out of its depth, or a source degraded |
| no successful run in 8 days | the schedule stopped — GitHub disables crons after 60 days idle |

---

## 8. Stack and deployment

| Concern | Choice | Note |
|---|---|---|
| Agent framework | **LangGraph (TS)** `@langchain/langgraph` v1.4.x | Production-stable, feature parity with Python |
| Tracing | **LangSmith** Developer tier | $0, 5,000 traces/mo; we use ~240. Hard cap configured. |
| Deployment | **GitHub Actions** | Already runs the pipeline; free; 6h limit suits a batch |
| **Not** used | LangGraph Platform | Paid — violates zero-paid-services |

**Honest note on LangGraph:** this loop could be hand-written in ~200 lines with no dependency.
LangGraph is chosen for its checkpointing and tracing and because building agent skill on it is an
explicit project goal — not because the task cannot be done without it.

**Schedule:** the workflow already fires Mon/Tue/Thu with per-store `days:` filters. Moving to 4–5
firings per week increases *presence*, not per-store fetch frequency — each retailer is still
fetched only on its own cycle days, honouring one-fetch-per-store-per-week.

**Known operational risk:** GitHub disables scheduled workflows after 60 days without a commit. The
agent must report its own last-run time so a silent stop is visible.

---

## 9. Model selection — open

Verified pricing, 2026-09-10, at ~6,000 classifications/month:

| Model | Input /M | Output /M | Monthly |
|---|---|---|---|
| local `multilingual-e5-small` | — | — | **$0.00** |
| OpenRouter free tier models | $0 | $0 | **$0.00** |
| OpenAI `gpt-5-nano` | $0.05 | $0.40 | **$0.10** |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | **$0.17** (free tier likely covers it) |
| DeepSeek v4-flash (off-peak) | $0.22 | $0.66 | **$0.36** |
| Kimi K2.6 | $0.95 | $4.00 | **$1.61** |

The spread is under CHF 2/month, so **price does not decide this — measured accuracy does.**
Batching cuts every figure ~10×; Gemini's 500 req/day free tier covers our entire batched volume
(~240 requests/month) many times over.

**Starting hypothesis:** Gemini 2.5 Flash-Lite at tier 1, Gemini 2.5 Flash or `gpt-5-nano` at
tier 2. Unverified until the bake-off runs.

---

## 10. The benchmark

Denner is the only one of the seven retailers publishing its own categories, so it is the only free
answer key.

**Harvested 2026-09-09: 244 offers, all labelled.** Known defects:

| Defect | Detail | Handling |
|---|---|---|
| `Sonstiges` = 47 (19%) | Not a category. Knorr bouillon, Dr. Oetker desserts, tinned veg, rapeseed oil, 4× cat food | Hand-label, tagged `derived`, scored separately |
| Vintages split wine into 10 labels | `Rotwein / 2023`, `Rotwein /`… | Collapse `X / YYYY` → `X` |
| 2 of 11 categories uncovered | `pasta-rice-cereals`, `pantry-canned` — both hide inside `Sonstiges` | Flag as unmeasured |
| Severe imbalance | drinks 69, snacks-sweets 45, beauty 31 = **74% of the set** | **Report macro-averaged per-category accuracy, not overall accuracy** |

> ⚠️ Overall accuracy on this set is close to meaningless: a model that knew only drinks, sweets and
> cosmetics would score 74%. **Macro-F1 across categories is the honest metric.**

Every row is tagged `denner` (197) or `derived` (47) so both scores fall out of one harness. The
benchmark becomes a permanent regression gate — each pipeline run re-scores itself and reports
accuracy to telemetry.

**Coop taxonomy — investigated and closed.** Coop product URLs embed a genuine 4–5 level category
path (`lebensmittel/fleisch-fisch/abgepacktes-frischfleisch/kalb`). Three routes tested 2026-09-10:
`coop.ch` product page returns **403** (DataDome); aktionis listing cards carry no outbound link;
the aktionis deal page contains zero `coop.ch` references. Getting past DataDome is the one act our
legal constraints name explicitly. **Route closed.**

---

## 11. Build order

1. Extend `Offer` with `sourceAttributes`; populate in `DennerApiSource` first (§3)
2. Benchmark file — collapse vintages, hand-label `Sonstiges`, tag provenance (§10)
3. Domain: `Classification`, `Confidence`, category-exists invariant, `Classifier` port (§4)
4. Attribute schemas as validated domain types (§5)
5. `SupabaseClassificationCache` + migration (§7)
6. One `Classifier` adapter; run the bake-off; measure calibration (§6.4, §9)
7. LangGraph graph: nodes, routing, fallback, budget cap (§6)
8. Delete `categorize.ts` and `shared/category-rules.ts`
9. Wire into `run.ts`; update `pipeline.yml`

---

## 12. Open decisions

| # | Question | Owner |
|---|---|---|
| 1 | Hand-label the 47 `Sonstiges`? Proposed: yes, tagged `derived`, scored both ways | user |
| 2 | Which model at each tier | bake-off |
| 3 | Confidence method — self-reported vs disagreement | measurement (§6.4) |
| 4 | Does `pasta-rice-cereals` / `pantry-canned` need a second answer key from another retailer? | open |
| 5 | Base `deals` table is absent from `supabase/migrations/` — a fresh DB cannot be rebuilt | open, from prior brief |
| 6 | **Tier-1 vs tier-2 conflict rule.** Denner's `year` contradicts its own subline 27% of the time (§3.1). Proposed: mark `conflicted`, low confidence, do not display | user |

---

## 13. Build log

**2026-09-10 — §3 adapter fix, Denner. Done.**

- `collection/domain/source-attributes.ts` — `SourceAttributes` value object with
  `publishedQuantity` unit normalisation (kg→g, cl/l→ml), pack-size and vintage invariants,
  label de-duplication, and Unicode-space normalisation. 25 tests.
- `collection/domain/offer.ts` — `Offer` now carries `sourceAttributes`; defaults to empty so no
  existing adapter breaks.
- `collection/infrastructure/denner/denner-api-source.ts` — `parseContentSize` +
  `mapSourceAttributes`. 16 new tests.
- Full suite **538 passed**, `tsc` clean.

**Decoded:** `content_size_text` uses `"N unit.g"` for kilograms — an untranslated i18n key.
Cross-checked against `nameSubline` on three products (`0.9`↔900 g, `0.4`↔400 g, `0.38`↔380 g).

**Found:** Denner ships **U+00A0 non-breaking spaces** inside text fields (`ca.·900·g`,
`Suisse·Garantie`). Byte-different from a plain space, visually identical. Unnormalised these
produce cache keys that never match and duplicate-looking products. Normalised in the domain.

**Live recovery, 291 offers (2026-09-10):**

| Field | Coverage |
|---|---|
| descriptor (subline) | **100%** |
| unit price | **100%** |
| pack size | **100%** |
| quantity + unit | **84%** |
| eco labels | 11% — 11 distinct: Bio, Suisse Garantie, MSC, ASC, Bio EU, IP-Suisse, V-Label Vegetarisch/Vegan, Rainforest Alliance (+Cocoa), Alkoholfrei |
| wine block | 11% (32 offers) — region+country 32/32, grape 31/32, vintage 26/32 |
| wine block on a non-wine product | **0** ✓ |

**2026-09-10 — §3 adapter fix, Lidl. Done.**

- `lidl-flyer-source.ts` — `decodeEntities` (German umlauts, dashes, symbols, numeric/hex entities)
  and `lidlSourceAttributes`. 9 new tests.
- **100% descriptor recovery** across the 40-product fixture, 0 entities left undecoded.
- Only the verbatim descriptor is captured. Pulling origin, quantity and price basis out of
  `"Herkunft: Schweiz Pro 2 x 250 g 100 g = 1.58"` is tier-2 parsing and belongs to component 2 —
  doing it in the adapter would put transformation logic in the collection layer.

**2026-09-10 — §3 adapter fix, Volg. Withdrawn, not done.** Section titles are promotion buckets,
not categories. See the correction box in §5c.

**Totals after both fixes:** 547 tests passing, `tsc` clean.
