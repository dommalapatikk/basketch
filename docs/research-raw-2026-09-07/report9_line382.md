<task-notification>
<task-id>ae89255f87beb52b7</task-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/ae89255f87beb52b7.output</output-file>
<status>completed</status>
<summary>Agent "Legal check on Swiss retail scraping" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All three agents have reported. The terms-of-use agent found a **stronger Migros clause than the one I quoted** — at a different URL, explicitly naming crawlers. Final consolidated report.

---

# Swiss legal &amp; ToS position for basketch — final report

**Not legal advice.** I am not a lawyer. **[SETTLED]** = primary source verified; **[INFERENCE]** = reasoning.

## Verdict

**Swiss law is unusually permissive here — more so than I initially assessed, because there are *two* Federal Supreme Court rulings won by scrapers, including one from 2023.** No database right, no copyright in price facts, no FADP engagement, no criminal exposure on public pages, and zero recorded enforcement against any Swiss promotion aggregator in twenty years.

**But the risk is not where intuition puts it.** Three findings changed my analysis during this research:

1. **"Non-commercial" is not a legal shield.** The UWG requires no competitive relationship. I was wrong about this initially.
2. **The real exposure is publication, not acquisition** — Art. 3(1)(e) UWG on stale or inaccurate price comparisons.
3. **Migros is a categorical outlier.** It says no **four** independent ways, including a terms clause that names web crawlers and metasearch engines by name.

**Practical conclusion: five of the eight sources are clean. Migros and Coop are not. aktionis.ch does not launder the problem.**

---

## 1. robots.txt [VERIFIED — fetched directly]

**No Crawl-delay in any of the eight.**

### Migros — an actual rule violation
```
User-agent: *
Disallow: */offers/instore/
Disallow: */offers/coupons/
Disallow: */promotion/
```
Weekly in-store promotion **detail pages sit at exactly `migros.ch/de/offers/instore/&lt;id&gt;`** (verified: `/2380967`, `/2450021`, `/en/offers/instore/2485877`). Corroboration the disallow is live and honoured: search engines return those URLs as **bare URLs with no title or snippet**. The **listing** page `/de/offers/home` is *not* disallowed — only the detail pages.

### Coop — blocked, and now explained
403 to every non-browser client, including `/robots.txt`. **Coop deployed DataDome bot protection**, confirmed in a vendor case study (21 Oct 2024) quoting **Tobias Schläpfer, Manager of Bot Protection at Coop**: scraper bots were "relentless," bot abuse of the store/stock finder cost USD 5,000–10,000/month in Google API overage, and **25% of traffic was bad-bot activity, now eliminated**. This is a deliberate technical protection measure — legally load-bearing (§3).

### The other six — promotion paths all permitted
- **Lidl** — promotions live on `sortiment.lidl.ch/de/aktuelle-aktionen`; blocks only `/checkout/`, `/app/`, `/lib/`, `/var/`, `/catalog/`, `/customer/`, `/*.php$`, and **`/*?`** (any query string).
- **Aldi Suisse** — blocks `/tools`, `/*?q=`. Explicitly *allows* every AI crawler incl. `ClaudeBot`, `anthropic-ai`.
- **Denner** — blocks only checkout, shopping-list, preview, auth.
- **Spar** — `Allow: /`; TYPO3 paths and `/*?id=*` blocked.
- **Volg** — blocks `/typo3/` only. But `GPTBot: Disallow: /`.
- **aktionis.ch** — blocks `/admin/`, `/login`, `/profile/`, `/dealtarget/`, `*.pdf`. Deal pages crawlable.

---

## 2. Terms of use

### Migros — the decisive find [VERIFIED verbatim, `migros.ch/de/content/rechtliche-hinweise`, last updated Feb 2023]

&gt; "Das (vollständige oder teilweise) Reproduzieren, Übermitteln, Modifizieren, Verknüpfen oder Benutzen der Webseiten **mittels elektronischen oder anderen Hilfsmitteln (wie Webcrawler-/Spider-Programme, Metasuchmaschinen, Framing)** für **öffentliche, geschäftliche und/oder kommerzielle Zwecke** ist ohne vorherige schriftliche Zustimmung des Betreibers untersagt."

This is **the only terms page among all eight that names crawlers, spiders and metasearch engines explicitly.** Note "**öffentliche**" — publishing at a public URL is caught regardless of non-commercial status. It self-declares group-wide reach: *"Diese rechtlichen Hinweise gelten für diese Webseite sowie alle darauf bezugnehmenden Webseiten der Migros-Gruppe."*

(The shorter "Portal"-variant I quoted earlier exists on other MGB properties; this is the operative migros.ch text and it is stronger.)

**Migros also refused programmatic access on the record.** On its own forum, staff answered a developer who said he'd otherwise scrape: *"Unfortunately, we are currently unable to grant access to our product data API. However… this may change in the future."*

**So Migros says no four ways: robots.txt, an explicit crawler prohibition, "öffentliche Zwecke," and a direct API refusal.** No other retailer comes close.

**Legal weight, honestly:** browsewrap. Swiss doctrine holds AGB bind only if **validly incorporated**; a footer link with no acceptance step generally forms no contract, and a bot that never registers is not in a contractual relationship. **[INFERENCE for CH — no Swiss decision found on browsewrap enforceability against a scraper.]** It is unambiguous notice of non-consent rather than a contract — but that notice is precisely what erodes the good-faith posture the case law turns on.

### Coop — **still an open gap**
Everything readable (Impressum, Coop City AGB, Interdiscount AGB, Coop Vitality, fooby.ch) contains **no anti-automation clause**. But the one page that plausibly carries an IP/reuse clause — **`coop.ch/de/termsAndConditions`** — could not be retrieved through any of ~6 proxy routes. **Do not treat "no clause" as established for Coop.** Worth 30 seconds in a normal browser.

### The rest
- **Denner** — same prohibition (shorter variant, Art. 15 AGB), *and* its Impressum links to the Migros page above, pulling in the crawler clause **by incorporation**.
- **Aldi Suisse** — strongest commercial-reuse ban: *"Die ALDI SUISSE Dienste dürfen von den Nutzern nur zu privaten Zwecken genutzt werden. Datennutzungen, die bezwecken, Inhalte gewerblich, kommerziell oder anderweitig geschäftsmässig zu verwenden, sind Nutzern verboten."* Plus a ban on *"Software oder sonstige Scripts"* impairing operations. **But § 1.1 scopes the whole document to *user-account* use** — genuinely arguable it never attaches to anonymous fetching.
- **Lidl.ch** — **no general terms of use exists.** No contractual clause. It does declare Friendly Captcha and Google reCaptcha *"zum Schutz unserer Webseite vor automatisierten Zugriffen (z. B. durch Bots)"* — a technical countermeasure, and a signal that automated access is unwanted. (The "robot, spider" language found in searches is from `careers.lidl.com`, a different property — not attributable to lidl.ch.)
- **Spar** — no anti-automation clause, but **deemed acceptance on access** and *"Jede weitere Nutzung bedarf der vorherigen schriftlichen Zustimmung."*
- **Volg** — **no terms document exists at all.** Impressum and privacy policy only. Nothing to be bound by.
- **aktionis.ch** (CouponPlus AG, CHE-107.425.708) — **no anti-scraping, anti-bot or database clause**, verified term-by-term. Only: *"Für die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung … im Voraus einzuholen"*, plus deemed acceptance on first use.

---

## 3. Swiss legal framework

### Copyright — facts free, images not
Art. 2 URG requires *geistige Schöpfungen … die individuellen Charakter haben*. Prices, percentages, dates: none qualify. **[SETTLED]** The IGE's own commissioned study (*Zuordnung von Sachdaten*, 2020) confirms raw factual data are unprotectable.

Art. 4 URG protects **only "Auswahl oder Anordnung"**, never the content. A comprehensive weekly list has functionally-dictated selection.

**New and operationally important: Art. 2 Abs. 3bis URG** (2020 revision) protects **photographic reproductions of 3-D objects even without individual character**. Swiss product photos are protected *per se*. **Avoiding images is a settled legal requirement, not merely prudent.**

### No sui generis database right — triple-confirmed [SETTLED]
- IGE-commissioned study (2020): Switzerland lacks the mechanism entirely.
- *sic!* (Swiss IP journal): *"die Schweiz [hat] **bewusst** auf die Umsetzung der sui generis Datenbank-RL … verzichtet"* — a deliberate legislative choice, unique in European comparison.
- Lexology/Primerus: *"no full-fledged ownership can be acquired in data, and as a principle, any person having lawful access to data may also use it"*; databases fail originality *"even if substantial investments have been made."*

The 2020 URG revision introduced none.

### UWG — **correction to my initial analysis**
&gt; I first reasoned the UWG likely doesn't reach a non-competing hobby project. **That was wrong.**

**No Wettbewerbsverhältnis is required. [SETTLED]** **BGE 120 II 76** ("Mikrowelle"): non-competitors who unfairly influence competition can be sued. **BGE 126 III 198 E. 2c/aa**: the test is purely **objective** — conduct suitable to affect the market's functioning. Art. 2 UWG's second limb covers *"das Verhältnis … zwischen Anbietern und Abnehmern"* and never mentions competitors. A price comparison steering purchasing decisions is inside its scope.

**Counterweight [SETTLED]: BGE 133 III 431** — where conduct fails a specific tort's elements, Art. 2's general clause may **not** be used as a catch-all; **besondere Umstände** are required.

**Art. 5 lit. c UWG** — four cumulative elements, construed narrowly: a *marktreifes Arbeitsergebnis*, taken **"als solches"**, by *technische Reproduktionsverfahren*, **"ohne angemessenen eigenen Aufwand"**. A single price is not a market-ready product, and restructuring into basket routing is not takeover "as such." **[INFERENCE]**

### Case law — three decisions

**① BGE 131 III 384 (4 Feb 2005) — scraper WON. [SETTLED]**
&gt; *"Die systematische Suche der Beklagten nach veröffentlichten … Immobilien-Inseraten, deren Übernahme in die eigene Website sowie deren Anzeige … **ist als solche nicht unlauter**."*
&gt; *"Mit Art. 5 UWG sollen keine neuen Ausschliesslichkeitsrechte geschaffen werden…"*

All claims rejected. The defendant's **programming, adapting, monitoring and processing** defeated the "ohne angemessenen eigenen Aufwand" element. Protection also **expires once creation costs are amortised**. The Court warned that restricting such reuse would harm competition on "completeness, reliability and accessibility" and ultimately harm end users.

**② KGer Freiburg 102 2015 189 (22 Aug 2016) — scraper LOST.** Weak authority: cantonal, first instance, and the defendant **defaulted entirely** (*"gänzlich untätig geblieben"*), so nothing was contested. It also turned partly on a **false comparative claim** built from expired listings.

**③ Ryanair v. Bravo Next / lastminute.com — Swiss Federal Supreme Court, two parallel rulings reported 2 May 2023. Scrapers WON; Ryanair ordered to pay CHF 140,000.** No IP or contractual violation. **The rulings are conditional: scraping is lawful provided (a) no technical protection measures are circumvented and (b) the source site is not slowed down.** The operator retains the right to erect technical barriers.

**This is the operative rule, and it maps exactly onto Coop's DataDome and Migros' robots.txt.**

### FADP / nDSG — does not apply [SETTLED]
Art. 5 lit. a DSG: *"alle Angaben, die sich auf eine bestimmte oder bestimmbare **natürliche Person** beziehen."* Product/price data is out of scope. The revision also **removed legal persons** — so Migros and Coop cannot invoke the DSG against a scraper *at all*.

**Live edge case:** incidentally scraped **reviews, usernames, named contacts** *are* personal data, and the EDÖB is explicit that *"Der Schutz von Personendaten endet nicht an der Schwelle zur Öffentlichkeit"* (24 Aug 2023; 31 Oct 2024). Filter at parse time.

### Criminal law — not engaged [SETTLED]
Art. 143 and 143bis StGB both require data/systems **"gegen seinen Zugriff besonders gesichert"** — electronic access protection. A page served to any anonymous GET is not; a robots.txt or ToS is a *declaration*, not a *Sicherung*. Art. 143 additionally needs **Bereicherungsabsicht**.

**No "virtuelles Hausrecht" exists in Swiss law** — a German construct with no Swiss statutory basis and no Swiss decision importing it. **[SETTLED, negative finding]**

**The line [INFERENCE]:** credentials, CAPTCHA, rate limiter, IP block, token-gated internal API — each is plausibly a *besondere Sicherung*. Coop's DataDome is exactly that.

### How the Swiss market actually works [VERIFIED]
- **toppreise.ch: merchant feeds, not crawling** — *"provided by the operators of the online shops connected to Toppreise.ch."*
- **comparis.ch premiums are federal open data** (BAG publishes all KVG premiums on opendata.swiss). Its FINMA litigation (lost 5 July 2024) is about intermediary registration, not data. **No provider has ever sued comparis over displaying their data.**
- **comparis's one crawling incident** (priminfo.ch, 2011) drew a criminal complaint — **for an attempted SQL injection by an employee acting *"eigenmächtig"***, not for the crawling, which was described as ordinary practice. **Exposure attached to circumvention, not crawling.**

---

## 4. Practical risk

**Worst case, by likelihood:** IP block (near-certain for Coop) → takedown email (most likely Migros) → cease-and-desist (unlikely) → litigation (very unlikely).

Swiss C&amp;D economics differ from Germany: **the cost of the warning letter generally cannot be recovered from the recipient**, so there is no letter-writing industry and no incentive to target a hobbyist.

**No enforcement has ever been recorded. [VERIFIED, negative finding]** Searches of German-language legal/news sources and the Zurich Commercial Court archive found **no Abmahnung, C&amp;D, injunction or lawsuit** by Migros, Coop, Denner, Lidl or Aldi against any scraper or aggregator, and **no Swiss price-tracking project shut down** under retailer pressure.

**Two live analogues that settle the practical question:**
- **aktionis.ch has run since 2006 explicitly *without* retailer cooperation.** Founders publicly cited *"mangelnder Kooperationsbereitschaft etlicher Anbieter — zu denen auch die Migros zählt"* and said they'd build it *"auch ohne Kooperation der Detailhändler."* Netzwoche (2014): retailers' stance remained *"eher ablehnend, auch die der Migros."* **Twenty years, no legal action.**
- **rappn.ch — a direct, currently-operating equivalent of basketch.** Rappn GmbH (Zug, 2026), same seven chains, all 26 cantons, 10,000+ deals weekly. Its own statement: data from *"public sources: flyers, websites and promotional materials"* and *"Rappn has **no commercial agreements** with any retailer."* Operating openly, no reported trouble.

**Channel picture:** Migros licenses offers through **Profital/Bring!** (Swiss Post-owned) *while* excluding them from its own site — a deliberate paid-channel strategy. **Coop licenses nothing and blocks hard.** Neither offers a public API; no Migros/Coop price data on opendata.swiss.

### (a) aktionis vs (b) direct — **go direct**

Refining my earlier reasoning (the competitive-relationship argument isn't needed, since Art. 5 lit. c doesn't require one):

aktionis has the **weakest terms of the eight** — no anti-scraping clause at all. But two things make it the worse target: its **compiled dataset *is* its *marktreifes Arbeitsergebnis***, which is the one fact pattern where Art. 5 lit. c actually bites; and it **never states where its data comes from or names a single retailer partner** while republishing Migros and Coop promotions. **Scraping it inherits its upstream exposure — most pointedly against Migros' express metasearch/crawler prohibition — and adds a second party.** It launders nothing.

---

## 5. Mitigations that materially change the analysis

**Tier 1 — these are the ruling:**
1. **Never circumvent a technical protection measure.** The explicit condition in the 2023 Federal Supreme Court rulings, the line for Art. 143bis, and the sole source of comparis's criminal exposure. **Do not spoof a UA to defeat Coop's DataDome.** If an honest bot is blocked, that is a refusal — **drop Coop.** An honest user agent is only a mitigation if you accept "no."
2. **Don't fetch `migros.ch/de/offers/instore/` or `*/promotion/`.** Migros' four-way refusal — including a clause naming *"Webcrawler-/Spider-Programme, Metasuchmaschinen"* — makes this the one clear line in the set. Use `/de/offers/home` if sufficient, drop Migros, or **ask** (they said access "may change in the future").
3. **Don't slow the source.** The second Ryanair condition. One fetch per store per week is far inside it — document that.
4. **Invest visible own effort.** Normalisation, matching, unit-price computation, per-item cheapest-store routing. This is the *literal* statutory test (*"angemessener eigener Aufwand"*) and the exact ground on which the 2005 defendant won.

**Tier 2 — the under-rated one:**
5. **Art. 3(1)(e) UWG is your real exposure.** Swiss law requires price comparisons to rest on **objectively correct and verifiable facts**. The Fribourg defendant lost partly on a false claim built from **expired** entries. So: show the scrape timestamp and validity window on every item, **expire aggressively**, disclose retailer coverage, never imply exhaustiveness.
6. **No images.** Art. 2 Abs. 3bis URG protects Swiss product photos even without originality.
7. **Filter personal data at the parser** — reviews, usernames, named staff.
8. Honest UA with project URL and contact email; weekly cadence; caching; conditional requests; attribution and deep links back.
9. Prominent takedown contact with a stated few-days SLA.

---

## Gaps and caveats

- **`coop.ch/de/termsAndConditions` remains unread** after ~6 proxy attempts. It is the one Coop page that plausibly carries an IP/reuse clause. **Check it in a normal browser before relying on "Coop has no clause."**
- **Docket numbers for the 2023 Ryanair rulings were not located** — sourced from German-language practitioner reporting, not the judgment text. Verify before relying on it formally.
- Fedlex serves a JS shell to non-browser clients; Art. 2/4 URG and Art. 5 lit. a/c UWG are verified verbatim, Art. 5 lit. b's closing words are reconstructed.
- KGer Freiburg appeal history unconfirmed.
- One Lexology guide asserts scraping in Switzerland "will most likely infringe a multitude of third party rights." It returned 403 and is **unverified**; it is also not reconcilable with BGE 131 III 384's actual holding. Logging it for honesty, not endorsing it.

**Bottom line:** the statutory position is strong and the practical record is clean — a live competitor does exactly this openly, and two Federal Supreme Court decisions went to the scrapers. The 2023 conditions are the whole game: **don't circumvent, don't overload, don't misstate.** Drop or ask permission for Migros, respect Coop's block, take the other five, and publish only fresh timestamped facts.</result>
<usage><subagent_tokens>143935</subagent_tokens><tool_uses>74</tool_uses><duration_ms>2446042</duration_ms></usage>
</task-notification>