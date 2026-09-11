<task-notification>
<task-id>a4c4cfc4a9fde657b</task-id>
<tool-use-id>toolu_01Q1pnc41tNBv8rc7kXLBZ8m</tool-use-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/a4c4cfc4a9fde657b.output</output-file>
<status>completed</status>
<summary>Agent "Swiss price comparison sites and disputes" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Summary of findings

### 1. comparis.ch — data sourcing and legal history

**How it gets data**
- **Health insurance premiums (its flagship product) are official public data, not scraped.** All KVG basic-insurance premiums are approved and published annually by the Federal Office of Public Health (BAG). BAG runs the official calculator at priminfo.admin.ch and publishes the full premium set as Excel/CSV on opendata.swiss (dataset "Krankenversicherungsprämien", https://opendata.swiss/de/dataset/health-insurance-premiums). No portal can show a different basic premium — comparis and every competitor work off the same federal dataset.
- **Everything else is partner/commission-based.** Comparis's own pages describe commission relationships: insurers pay per quote/conclusion; real-estate agents pay sister company advanti a share of commission; mortgage lenders pay HypoPlus per lead or commission (https://en.comparis.ch/info/comparis-partnerservices, https://en.comparis.ch/info/privacy). Its privacy statement says data comes "from sources that are accessible to the public or from authorities, as well as from other third parties (e.g. partners, credit agencies, address dealers, Internet analysis services)."
- Note: comparis.ch itself returns **HTTP 403 to non-browser clients** (my WebFetch was blocked). DataDome publishes a Comparis customer story, "Comparis Automates Scraping Protection &amp; Saves a Day per Week with DataDome" (https://datadome.co/customers-stories/comparis-automates-scraping-protection-saves-a-day-per-week-with-datadome/) — so comparis is itself a scraping *target* that actively blocks bots.

**Legal challenges — and an important correction to the premise**
The known comparis litigation is **regulatory, not data-related**. I found **no evidence** of any provider (insurer, bank, telco) suing or sending cease-and-desist letters to comparis over displaying their data. I searched German and English sources and the Zurich Commercial Court decision database; nothing surfaced.

What did happen:
- **29 Sept 2023** — FINMA ruled Comparis is an *untied insurance intermediary* and must register: "The decisive function for the mediation of a product – namely the insurance comparison – remains with Comparis." (https://www.finma.ch/en/news/2023/09/20230929-mm-comparis/). Comparis appealed.
- **5 July 2024** — the Federal Administrative Court ruled for FINMA; Comparis lost, did not appeal to the Federal Supreme Court, and submitted to FINMA supervision. Coverage: Blick (id19939307), SRF, Tages-Anzeiger, Konsumentenschutz (https://www.konsumentenschutz.ch/allgemein/2024/07/comparis-urteil-muss-konsequenzen-haben/). The dispute had run since 2019.
- **1 Sept 2024** — the industry agreement (Branchenvereinbarung Vermittler) was declared generally binding, capping intermediary commissions at CHF 70 per insured person, payable only on conclusion — down from ~CHF 50 per *quote*. Comparis had been earning roughly CHF 10m/year from insurers (finews.ch/64366).
- Consumer-protection criticism (watson, Konsumentenschutz) that comparis in some verticals only compares providers that pay — a transparency issue, not a data-rights issue.

### 2. toppreise.ch — merchant-fed, not crawled

- Operated by **Toppreise Preisvergleich GmbH &amp; Co. KG, Bellenberg, Germany** (https://www.toppreise.ch/imprint).
- Its own legal notice states: **"All data displayed on Toppreise.ch is non-binding information that is provided by the operators of the online shops connected to Toppreise.ch."** and "The prices specified are non-binding and are subject to error on the part of the dealers." That is an explicit merchant-supplied-feed model.
- There is a dealer sign-up funnel (https://www.toppreise.ch/dealer-registration, merchant login at https://shop.toppreise.ch/) and shop-system integrations that push feeds automatically — e.g. saldia AG's toppreise connector: "your current prices and product data are automatically synced" (https://www.saldia.ch/en/apps/toppreise/). Industry write-ups describe XML/CSV product feeds plus CPC or 2–12% revenue-share monetisation (etron-software.ch, NZZ "Die Suche nach dem tiefsten Preis").
- **Not found:** any toppreise statement that it crawls merchant sites. Two attempts to fetch the dealer-registration page were blocked at my tool layer, so I could not read the fee schedule verbatim.

### 3. Swiss grocery-promotion aggregators — the split is real and informative

**profital.ch — official, paid, retailer-funded.** This is the strongest partnership evidence.
- Founded by **Swiss Post's Direct Mail Company** (a wholly owned Post subsidiary), launched **early November 2017**, built on **Offerista/Marktjagd** technology adapted for Switzerland (Offerista press release, mirrored at https://www.itsax.de/news/partner/12871/offerista-group/offerista-und-profital-bringen-digitale-prospekte-in-die-schweiz; Swiss Post product page https://www.post.ch/de/geschaeftlich/werben/online-dialogmarketing/profital).
- Sold to **Bring! Labs AG in 2022**. Bring! Labs is majority-owned by **Swiss Post since Sept 2021** (netzwoche.ch/news/2021-09-17).
- Business model is explicitly advertising: profital.ch's own footer says "Becoming an advertising partner? Advertise in Switzerland's most popular brochure app." Retailers are "Partner". Bring! Labs' B2B site markets a **"Feed-based Flyer"** product (https://www.bringlabs.com/en).
- **Migros/Coop status changed over time.** In May 2019 watson reported "allerdings fehlen ausgerechnet Migros und Coop" (https://www.watson.ch/digital/apps/553419667-7-apps-die-dir-helfen-geld-zu-sparen). As of the current App Store listing (Bring! Labs AG, v27.45.0), **Migros is listed** among food retailers and appears under "Beliebte Partner" on profital.ch; **Coop is still absent** (only "ITS Coop Travel" appears).
- A Bring! Labs success-story page quoted Migros saying **"Bring! is our partner for digital offer communication"** and "With Bring! we offer our customers an innovative offer solution based on their purchasing behavior." *Caveat:* the page (getbring.com/success-stories/migros-en) now 301-redirects to bringlabs.com/en/insights and the Migros case study is no longer listed there — I have the quote only via search-index snippet, not verified live.

**bring! (Bring! Labs AG)** — same company as Profital. Offers appear in an "Angebote" tab fed by Profital's publisher network (https://business.profital.ch/insights/profital-lanciert-kooperation-mit-einkaufslisten-app-bring). Retailer-funded advertising, named clients include Netto Marken-Discount, Qualipet, Spar. It also stores Cumulus/Supercard loyalty cards, but pctipp/SRF coverage notes Migros and Coop were guarded about formal cooperation ("we communicate corresponding cooperations when they are current").

**aktionis.ch — explicitly built *without* retailer cooperation.** This is the counter-example and it is well documented.
- Operator: **CouponPlus AG**, Hardturmstrasse 133, 8005 Zürich, CHE-107.425.708, MD Urs Schmidig (https://www.aktionis.ch/imprint). Founded 2006 by three students; changed hands 2009.
- Covers **Coop, Coop Megastore, Denner, LIDL, Migros, OTTO'S, SPAR, Volg** (https://www.aktionis.ch/vendors) — i.e. it carries Coop, which Profital does not.
- Press release **28 Sept 2006** (pressetext.com): the founders cite "mangelnder Kooperationsbereitschaft etlicher Anbieter — zu denen auch die Migros zählt" and say they will "die Plattform aber auch ohne Kooperation der Detailhändler weiter ausbauen."
- Netzwoche, **31 Jan 2014**: "die Haltung der Detailhändler bisher eher ablehnend gewesen, auch die der Migros" — while aktionis was publishing *regional* Migros promotions that were not even on Migros's own website.
- **Not found:** any statement that aktionis ever obtained retailer data feeds, and no record of legal action against it in 20 years of operation.

**kaufDA/Bonial** — kaufda.de operates in Germany; I found **no evidence of a Swiss kaufDA/Bonial operation**. The CH-facing leaflet aggregators are kimbino.ch, oferlo.ch, prospektmaschine. Kimbino describes a B2B partner portal where retailers manage content and see campaign stats (https://www.kimbino.at/partnerschaft/ — 404 on direct fetch; description via search index), yet kimbino.ch carries Migros and Coop leaflets. I could not verify whether those specific Migros/Coop leaflets are partner-supplied or harvested.

**rappn.ch — the closest live analogue to basketch, and it scrapes openly.**
- **Rappn GmbH, Zug, founded 2026**, MD Stefano Viviano (Moneyhouse record). Apps on iOS/Android (ch.rappn.app).
- Covers Migros, Coop, Aldi, Lidl, Denner, OTTO'S, Aligro across all 26 cantons, "over 10,000 deals refreshed every week."
- Its own statement (https://rappn.ch/en/grocery-price-comparison-app-switzerland): data comes from **"public sources: flyers, websites and promotional materials from the supermarkets. Rappn collects everything, organises it and displays it clearly"** and **"Rappn has no commercial agreements with any retailer. We don't receive money from Migros, Coop, Aldi, Lidl, Denner or anyone else."**
- It is operating publicly as of 2026 with no reported legal trouble.

**preispirat.ch** — community-submitted deals plus affiliate monetisation; not a systematic feed or scrape.

### 4. Official Migros / Coop APIs, feeds, open data — none for promotions

- **Migros: explicitly refused.** On Migipedia, Migros staffer "Philipp" answered a request for product-data API access: **"Unfortunately, we are currently unable to grant access to our product data API. However, I have been able to find out that this may change in the future."** (https://migipedia.migros.ch/en/forum/migipedia/is-there-an-api-for-migros-product-data)
- **migros.ch robots.txt disallows exactly the promotion paths** — full file at https://www.migros.ch/robots.txt includes:
  ```
  User-agent: *
  ...
  Disallow: */offers/instore/
  Disallow: */offers/coupons/
  Disallow: */promotion/
  ```
  This is the single most concrete signal in the whole research: Migros affirmatively excludes in-store offers, coupons and promotions from crawling for all user agents.
- **coop.ch returns HTTP 403** to my fetches, including for `/robots.txt` — consistent with the DataDome deployment below. Denner's robots.txt (https://www.denner.ch/robots.txt) is permissive: `Allow: /`, blocking only checkout, shopping-list, preview and OIDC auth paths.
- **No Migros or Coop promotion/price dataset on opendata.swiss.** The only food-related federal datasets are the Swiss Food Composition Database and Lebensmittelkontrolle. The Migros/Opendata.ch tie-up is a *funding* programme ("Business Innovation food.opendata.ch", Migros Pioneer Fund, from 2016, https://opendata.ch/news/opendata-ch-lanciert-mit-engagement-migros-innovationsprogramm-rund-um-food-daten/) — it funds projects, it does not publish Migros price or promotion data.
- **No official Coop developer portal or partner data feed found.** Third-party commercial scrapers fill the gap: Apify's `studio-amba/coop-ch-scraper` and `studio-amba/migros-scraper`, and Pepesto's "Migros API"/"Coop Switzerland API" — all unofficial resellers of scraped data.
- **No affiliate programme exposing weekly promotions.** The only Migros-group affiliate programme found is SportXX (8% pay-per-sale, via 100partnerprogramme.de) — retail merchandise, not grocery promotions. Migros's 2026 retail-media move is with **Criteo** (https://www.criteo.com/de/news/press-releases/2026/02/...), i.e. selling ad inventory, not licensing offer data outward.

### 5. Blocking, cease-and-desist, and the Swiss legal position on scraping

**Confirmed blocking, no confirmed litigation.**
- **Coop deployed DataDome bot protection.** Case study published **21 Oct 2024**: Coop is described as "a major Swiss retail and e-commerce brand"; **Tobias Schläpfer, Web Applications Developer &amp; Manager of Bot Protection at Coop**, is quoted. Scraper bots were "relentless," bots abused the "find in stock"/"find a store" features driving USD 5,000–10,000/month in excess Google API cost; **25% of traffic was bad-bot activity and was eliminated**. (https://datadome.co/customers-stories/coop-stops-scraping-reduces-api-costs-with-datadomes-ai-driven-bot-protection/ — 403 to fetch; readable mirror at https://securityboulevard.com/2024/10/coop-stops-scraping-reduces-api-costs-with-datadomes-ai-driven-bot-protection/)
- Migros blocks promotions in robots.txt (above). Coop blocks at the WAF/bot-management layer.
- **Not found — stated explicitly:** no reported Abmahnung, cease-and-desist letter, injunction, or lawsuit by Migros, Coop, Denner, Lidl or Aldi Suisse against any scraper, price-tracker or promotion aggregator. I searched German-language legal and news sources ("Migros Abmahnung Scraping", "Coop Preisvergleich Klage", "Screen Scraping Schweiz Urteil") plus the Zurich Commercial Court decision archive. Nothing. Likewise, **no Swiss price-tracking project was found to have been shut down** under retailer legal pressure — aktionis has run since 2006 against explicit retailer non-cooperation, and rappn launched in 2026 openly declaring it has no retailer agreements.
- The only Migros legal action found in the price-comparison space runs the *other* way: **Migros filed a Lauterkeitskommission complaint against Aldi** over Aldi's comparative price advertising (20min.ch/103623181, watson.ch/318879097) — a competitor-advertising dispute, not a data dispute.

**Swiss law is unusually permissive here — two load-bearing points:**
1. **Switzerland has no sui generis database right.** Unlike EU Directive 96/9 Art. 7, Swiss law offers no investment protection for non-creative databases. Protection is limited to Art. 4 URG (collective works, requires creative selection/arrangement) and Art. 5 UWG. A weekly promotion list has essentially no creative height.
2. **BGE 131 III 384 (Federal Supreme Court, 4 Feb 2005)** is the leading Swiss scraping precedent, and the scraper won. A AG used a **search spider** to systematically harvest real-estate listings from competing platforms and republish them. The court held this was **not** unfair under Art. 5 lit. c UWG, because A AG had applied "angemessenen eigenen Aufwand" — programming the acquisition system, continuously adapting and monitoring it, and processing the data before republication. It also rejected the Art. 2 UWG general clause, noting there is no general prohibition on imitation, and that restricting such reuse would harm competition on "completeness, reliability and accessibility" and ultimately harm end users. (https://entscheide.weblaw.ch/cache.php?link=bge-131-iii-384, summary at https://www.grell-law.ch/blogitems/2005/12/01/bernahme-von-immobilien-inseraten)
3. **Ryanair v. Bravo Next / lastminute.com** — the Swiss Federal Supreme Court confirmed in two parallel rulings (reported **2 May 2023**) that the portals acted lawfully; no IP or contractual violation; Ryanair ordered to pay CHF 140,000. Crucially, the rulings are **conditional**: scraping is permissible only if **no technical protection measures are circumvented** and the source site is **not slowed down**; the airline retains the right to erect technical barriers. (https://v-i-r.de/2023/05/02/screen-scraping-urteil/ — I could not locate the 4A_ docket numbers.)

### What this means for basketch (inference, flagged as such)

The evidence does **not** support "Swiss retailers license this data rather than tolerate scraping." It supports a more specific and more useful picture:

- **Migros is the outlier that licenses.** It pays into the Profital/Bring! channel (Swiss Post-owned) for digital offer distribution, and it simultaneously robots.txt-excludes `*/offers/`, `*/promotion/` from its own site. That is a deliberate channel strategy: distribute offers through paid partners, discourage free harvesting.
- **Coop licenses nothing and blocks hard.** Absent from Profital, no API, DataDome at the edge, 403 to non-browser clients. Coop is the hardest technical target.
- **Legal exposure in Switzerland is genuinely low but not zero.** BGE 131 III 384 plus the absence of a sui generis database right plus zero recorded enforcement actions in 20 years of Swiss promotion aggregation is a strong position. The live constraints from the Ryanair rulings are technical, not proprietary: do not circumvent protection measures (Coop's DataDome would be exactly that), and do not degrade the source site. Migros's robots.txt Disallow on `*/promotion/` is not legally binding on its own, but ignoring it weakens the Art. 2 UWG "own reasonable effort / good faith" posture that BGE 131 III 384 turned on.
- **rappn.ch is a direct, currently-operating precedent** doing what basketch would do, publicly declaring it scrapes public sources with no retailer agreements, across the same seven chains — worth watching closely.

Sources:
- [FINMA ruling on Comparis (29 Sept 2023)](https://www.finma.ch/en/news/2023/09/20230929-mm-comparis/)
- [Blick — Comparis loses against FINMA (July 2024)](https://www.blick.ch/wirtschaft/gericht-urteilt-zugunsten-der-firma-vergleichsportal-registriert-sich-als-versicherungsvermittler-comparis-verliert-jahrelangen-rechtsstreit-was-das-fuer-dich-bedeutet-id19939307.html)
- [Konsumentenschutz on the Comparis ruling](https://www.konsumentenschutz.ch/allgemein/2024/07/comparis-urteil-muss-konsequenzen-haben/)
- [finews.ch — new trouble for Comparis, CHF 70 commission cap](https://www.finews.ch/news/versicherungen/64366-comparis-versicherungsvermittler-krankenkassen-kvg-70-franken-decisis-holding)
- [opendata.swiss — health insurance premiums dataset](https://opendata.swiss/de/dataset/health-insurance-premiums)
- [Toppreise.ch legal notice](https://www.toppreise.ch/imprint)
- [saldia AG toppreise connector](https://www.saldia.ch/en/apps/toppreise/)
- [Offerista/Profital launch press release](https://www.itsax.de/news/partner/12871/offerista-group/offerista-und-profital-bringen-digitale-prospekte-in-die-schweiz)
- [Swiss Post — Profital product page](https://www.post.ch/de/geschaeftlich/werben/online-dialogmarketing/profital)
- [Profital x Bring! cooperation](https://business.profital.ch/insights/profital-lanciert-kooperation-mit-einkaufslisten-app-bring)
- [Bring! Labs B2B site](https://www.bringlabs.com/en)
- [Profital App Store listing (retailer list)](https://apps.apple.com/ch/app/profital-angebote-prospekte/id1260993643)
- [watson (13 May 2019) — Migros and Coop missing from Profital](https://www.watson.ch/digital/apps/553419667-7-apps-die-dir-helfen-geld-zu-sparen)
- [Aktionis.ch imprint (CouponPlus AG)](https://www.aktionis.ch/imprint)
- [Aktionis.ch vendor list](https://www.aktionis.ch/vendors)
- [pressetext (28 Sept 2006) — retailers incl. Migros unwilling to cooperate](https://www.pressetext.com/news/erfolgreich-gestartet-aktionisch-erweitert-angebot-um-regionale-aktionen.html)
- [Netzwoche (31 Jan 2014) — Aktionis adds Migros regional promotions](https://www.netzwoche.ch/news/2014-01-31/aktionis-neu-mit-aktionen-der-migros-regionalstellen)
- [Migipedia — Migros declines product API access](https://migipedia.migros.ch/en/forum/migipedia/is-there-an-api-for-migros-product-data)
- [migros.ch robots.txt](https://www.migros.ch/robots.txt)
- [denner.ch robots.txt](https://www.denner.ch/robots.txt)
- [DataDome Coop case study (mirror, 21 Oct 2024)](https://securityboulevard.com/2024/10/coop-stops-scraping-reduces-api-costs-with-datadomes-ai-driven-bot-protection/)
- [DataDome Comparis case study](https://datadome.co/customers-stories/comparis-automates-scraping-protection-saves-a-day-per-week-with-datadome/)
- [BGE 131 III 384 (4 Feb 2005)](https://entscheide.weblaw.ch/cache.php?link=bge-131-iii-384&amp;sel_lang=de)
- [Grell law — commentary on BGE 131 III 384](https://www.grell-law.ch/blogitems/2005/12/01/bernahme-von-immobilien-inseraten)
- [Swiss Federal Court screen-scraping ruling vs Ryanair (May 2023)](https://v-i-r.de/2023/05/02/screen-scraping-urteil/)
- [rappn.ch — grocery price comparison, data sourcing statement](https://rappn.ch/en/grocery-price-comparison-app-switzerland)
- [Migros x Criteo retail media partnership (Feb 2026)](https://www.criteo.com/de/news/press-releases/2026/02/migros-und-criteo-starten-partnerschaft-und-lancieren-digitales-retail-media-werbeangebot-fuer-den-schweizer-werbemarkt/)
- [Migros complaint against Aldi price-comparison advertising](https://www.watson.ch/schweiz/konsum/318879097-gegen-diesen-aldi-preisvergleich-hat-die-migros-beschwerde-eingelegt)</result>
<usage><subagent_tokens>110388</subagent_tokens><tool_uses>87</tool_uses><duration_ms>836870</duration_ms></usage>
</task-notification>