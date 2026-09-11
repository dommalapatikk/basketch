<task-notification>
<task-id>ad1aaa63818d7c616</task-id>
<tool-use-id>toolu_01NQmVAu3ahrEK5SPjWEKQHX</tool-use-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/ad1aaa63818d7c616.output</output-file>
<status>completed</status>
<summary>Agent "Swiss law on scraping factual data" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Swiss legal framework for scraping publicly accessible factual data (grocery products, prices, discounts, promo validity)

**Method note / limitation up front:** `fedlex.admin.ch` was blocked in this environment (permission denial on every attempt, plus Fedlex serves a JS shell to non-browser clients). Statutory text below was verified against secondary mirrors (swissrights.ch, rechtundgesetz.ch, lawbrary.ch) and against quotations inside primary court/doctrinal documents. Where I could not obtain a verbatim string I say so explicitly. Canonical Fedlex URLs are given for citation:
- URG, SR 231.1 — https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/de
- UWG, SR 241 — https://www.fedlex.admin.ch/eli/cc/1988/223_223_223/de
- DSG (nDSG), SR 235.1 — https://www.fedlex.admin.ch/eli/cc/2022/491/de
- StGB, SR 311.0 — https://www.fedlex.admin.ch/eli/cc/54/757_781_799/de

---

## 1. COPYRIGHT (URG, SR 231.1)

### 1.1 Art. 2 URG — Werkbegriff (verbatim, verified on two mirrors)

&gt; **Art. 2 Werkbegriff**
&gt; ¹ Werke sind, unabhängig von ihrem Wert oder Zweck, geistige Schöpfungen der Literatur und Kunst, die individuellen Charakter haben.
&gt; ² Dazu gehören insbesondere:
&gt; a. literarische, wissenschaftliche und andere Sprachwerke;
&gt; b. Werke der Musik und andere akustische Werke;
&gt; c. Werke der bildenden Kunst, insbesondere der Malerei, der Bildhauerei und der Graphik;
&gt; d. Werke mit wissenschaftlichem oder technischem Inhalt wie Zeichnungen, Pläne, Karten oder plastische Darstellungen;
&gt; e. Werke der Baukunst;
&gt; f. Werke der angewandten Kunst;
&gt; g. fotografische, filmische und andere visuelle oder audiovisuelle Werke;
&gt; h. choreographische Werke und Pantomimen.
&gt; ³ Als Werke gelten auch Computerprogramme.
&gt; ³bis Fotografische Wiedergaben und mit einem der Fotografie ähnlichen Verfahren hergestellte Wiedergaben dreidimensionaler Objekte gelten als Werke, auch wenn sie keinen individuellen Charakter haben.
&gt; ⁴ Ebenfalls geschützt sind Entwürfe, Titel und Teile von Werken, sofern es sich um geistige Schöpfungen mit individuellem Charakter handelt.

Sources: https://www.swissrights.ch/gesetze/Artikel-2-URG-2023-DE.php · https://www.rechtundgesetz.ch/15_76_309_URG_gesetzestexte_artikel_2_Art_2_Werkbegriff.html

**Are bare price/product listings protected? No. [SETTLED]**
The double requirement — *geistige Schöpfung* + *individueller Charakter* — is not met by a product name, a price, a discount percentage, or a validity date. Swiss doctrine is uniform: mere ideas, facts, and information are free; only their concrete individual expression is protected. The IGE (Swiss Federal Institute of Intellectual Property) commissioned study on the allocation of factual data (*Sachdaten*) is explicit that raw factual data do not qualify as protectable works — they lack the creative selection, coordination or presentation copyright requires (https://www.ige.ch/fileadmin/user_upload/recht/gesellschaft/d/200818_Bericht_Zuordnung_Sachdaten.pdf). Pestalozzi puts the same point for data mining: unprocessed data ("sog. Rohdaten") rarely satisfy the prerequisites (https://pestalozzilaw.com/de/insights/aktuell/legal-insights/urheberrechtliche-hindernisse-beim-data-mining/). IGE's own public guidance states that mere ideas, performances and concepts are unprotected, and that compilations that merely convey facts or commonplace information in trivial form are denied protection (https://www.ige.ch/de/etwas-schuetzen/urheberrecht/grundlegendes).

**Caveat [INFERENCE]:** Scraped *marketing copy* (a written product description with some flourish), *product photographs*, and *logos* are a different matter. Art. 2 Abs. 3bis URG (added in the 2020 revision) protects photographic reproductions of three-dimensional objects **even without individual character** — so retailer product photos are protected in Switzerland essentially per se. Copying product images is materially riskier than copying names, prices and dates. Restricting the pipeline to name/price/percentage/date is what keeps it outside Art. 2.

### 1.2 Art. 4 URG — Sammelwerke (verbatim)

&gt; **Art. 4 Sammelwerke**
&gt; ¹ Sammlungen sind selbständig geschützt, sofern es sich bezüglich Auswahl oder Anordnung um geistige Schöpfungen mit individuellem Charakter handelt.
&gt; ² Der Schutz von in das Sammelwerk aufgenommenen Werken bleibt vorbehalten.

Source: https://www.swissrights.ch/gesetze/Artikel-4-URG-2023-DE.php · cf. https://lawbrary.ch/law/art/URG-v2025.07-de-art-4/

**What is protected, and what is not. [SETTLED]**
Art. 4 protects **only the selection or the arrangement** ("bezüglich Auswahl oder Anordnung"), never the underlying content. The individual data items are not covered by the *Sammelwerk* protection; Abs. 2 merely reserves any independent copyright the incorporated items may carry in their own right (which, for a price, is none).

**Does a retailer's promotion list qualify? Almost certainly not. [MAJORITY DOCTRINE / INFERENCE]**
A weekly promotion list is arranged by objectively dictated criteria — category, price, validity period, exhaustiveness of what is on offer. Where selection is dictated by function or completeness rather than by choice, there is no *individueller Charakter* and no Sammelwerk. Even if a court found one, the protection would attach to the layout/ordering, not to the facts — so extracting the facts into a **different** structure (basketch's per-item cheapest-store routing) does not reproduce the protected element. This is a clean structural defence, not merely a de minimis one.

### 1.3 No sui generis database right in Switzerland — CONFIRMED [SETTLED]

Switzerland has **no** equivalent to Art. 7 of Directive 96/9/EC (EU Database Directive). Non-creative databases enjoy no investment-protection right whatsoever under Swiss law.

Confirming sources:
- **IGE-commissioned academic study** (Swiss Federal Institute of Intellectual Property), *Zuordnung von Sachdaten*, 18 Aug 2020: Switzerland lacks the sui generis mechanism; only two routes exist — copyright for creative databases only, and Art. 5 lit. c UWG. https://www.ige.ch/fileadmin/user_upload/recht/gesellschaft/d/200818_Bericht_Zuordnung_Sachdaten.pdf
- **sic! (Swiss IP journal), "Urheberrechtsentwicklung durch den EuGH – entfernt sich die EU von der Schweiz?"**: Switzerland *deliberately* declined to implement the sui generis Database Directive — "die Schweiz [hat] bewusst auf die Umsetzung der sui generis Datenbank-RL … verzichtet". https://www.legalis.ch/de/sic/sic-artikel/?titel=urheberrechtsentwicklung-durch-den-eugh-entfernt-sich-die-eu-von-der-schweiz&amp;id=21910
- Doctrinal restatement: "In der Schweiz besteht kein sui generis Datenbankschutz für quantitativ und qualitativ hochwertig zusammengestellte, softwarebetriebene Datenbanken. Ein allfälliger Schutz ergibt sich nur aus Art. 2 Abs. 4 URG für Sammelwerke sowie aus Art. 5 lit. c UWG." — and this position is described as *unique in European comparison*. https://de.wikipedia.org/wiki/Datenbankwerk
- MLL Legal (Meyerlustenberger Lachenal), *Skimming, Scraping, Scratching – Verwertung fremder Datenbanken*: https://www.mll-news.com/wp-content/uploads/2013/07/Verwertung_Datenbanken.pdf (title and framing confirmed via search index; the PDF itself would not render text through WebFetch — I could not extract verbatim passages from it and am not quoting it).

**Did the 2020 URG revision introduce one? No. [SETTLED]**
The revision in force 1 April 2020 (AS 2020 1003) added Art. 2 Abs. 3bis (photographs without individual character), extended the term for photographs, added Art. 24d (use of works for scientific research / TDM), Art. 13a and 22c, and the stay-down obligations for hosting providers. It introduced **no** database producer's right. Confirmed by economiesuisse's and MLL's revision Q&amp;As, which enumerate the changes and contain no database right (https://www.mll-news.com/qa-zum-revidierten-urheberrechtsgesetz-klarere-grundsaetze-bei-fotografien/ · https://www.economiesuisse.ch/de/artikel/urg-revision-klarere-grundsaetze-bei-fotografien), and by the 2020 IGE study which post-dates the revision and still records the absence.

**Net copyright position:** [SETTLED] Names, prices, discount percentages and validity dates are free for the taking as a matter of Swiss copyright law. There is no residual database right to catch them.

---

## 2. UNFAIR COMPETITION (UWG, SR 241)

### 2.1 Art. 2 UWG — Grundsatz (verbatim)

&gt; **Art. 2 Grundsatz**
&gt; Unlauter und widerrechtlich ist jedes täuschende oder in anderer Weise gegen den Grundsatz von Treu und Glauben verstossende Verhalten oder Geschäftsgebaren, welches das Verhältnis zwischen Mitbewerbern oder zwischen Anbietern und Abnehmern beeinflusst.

Verified via search index against multiple Swiss sources incl. https://www.lexfind.ch/tolv/223432/de and cantonal case-law citations (https://www.zg.ch/behoerden/staatskanzlei/kanzlei/gvp/gvp-2013/gerichtspraxis/zivilrecht/wettbewerbsrecht/art-2-i-v-m-art-3-abs-1-lit-a-uwg).

### 2.2 Art. 5 UWG — Verwertung fremder Leistung

&gt; **Art. 5** Unlauter handelt insbesondere, wer:
&gt; a. ein ihm anvertrautes Arbeitsergebnis wie Offerten, Berechnungen oder Pläne unbefugt verwertet;
&gt; b. ein Arbeitsergebnis eines Dritten wie Offerten, Berechnungen oder Pläne verwertet, obwohl er wissen muss, dass es ihm unbefugterweise überlassen oder zugänglich gemacht worden ist;
&gt; c. das marktreife Arbeitsergebnis eines andern ohne angemessenen eigenen Aufwand durch technische Reproduktionsverfahren als solches übernimmt und verwertet.

**Verbatim confidence:** lit. c is verified verbatim (it recurs identically in BGE 131 III 384, digilaw.ch, and the UZH materials). lit. a is verified verbatim. lit. b — the opening clause is verified; the closing words after "unbefugterweise überlassen" are reconstructed from the standard text and should be re-checked against Fedlex before being quoted in anything binding.

**Structural analysis of lit. c for basketch [decisive]:**
Four cumulative elements, all of which must be met, and which the Federal Supreme Court says are to be construed **narrowly**:
1. a **marktreifes Arbeitsergebnis** (market-ready work product, commercially exploitable "ohne weiteres Zutun");
2. taken over **"als solches"** (as such — i.e. substantially unaltered);
3. by a **technisches Reproduktionsverfahren**;
4. **ohne angemessenen eigenen Aufwand** (without adequate own effort).

Protective purpose: to prevent someone gaining an unjustified competitive advantage by saving the production cost of an identical product.

**Applied to a per-item cheapest-store router [INFERENCE, but well-supported]:** elements (1) and (2) are the weak links. A single price datum is not a "marktreifes Arbeitsergebnis" in the sense of a product that can be marketed as-is; and re-keying facts into a *different* output artefact (a cross-retailer basket routing decision) is not taking over the work product "als solches" — it is a transformation with substantial own effort (matching, normalisation, ranking logic). Under BGE 131 III 384 the defendant's own spider-programming and filtering work already sufficed to defeat element (4).

### 2.3 Art. 3 Abs. 1 lit. e UWG (relevant, and the real exposure)

Content verified (not fully verbatim): it is unfair to compare oneself, one's goods, works, services **or their prices** in an incorrect, misleading, unnecessarily disparaging or slavishly imitative manner ("unrichtig, irreführend, unnötig herabsetzend oder anlehnend") with those of others, or to advantage third parties in competition in a corresponding manner. Swiss practice requires price comparisons to rest on **objectively correct and verifiable facts**, with correctness required for *both* the own price and the comparison price. Source: https://www.lexology.com/library/detail.aspx?g=6f35ed30-ff94-4964-b2fd-d2ca8cfe7212 and https://www.faire-werbung.ch/wp-content/uploads/2025/01/SLK-Grundsaetze_DE-1.1.2025.pdf

**This is the single most relevant UWG provision for basketch. [MAJORITY DOCTRINE]** The legal risk of a price-comparison product in Switzerland is not *acquiring* the data — it is *publishing stale, wrong, or unfairly framed comparisons*. This was the operative finding in the Fribourg case below, where the defendant's "more listings than X / Number 1 in Switzerland" claim was held false precisely because it compared live inventory against a mix of live and **expired** entries. Concrete implication: display the scrape timestamp and the promotion validity window, drop expired promotions promptly, and never present an incomplete retailer set as exhaustive.

### 2.4 KEY QUESTION — does UWG apply to a non-commercial, non-competing project?

**Yes, in principle. A Wettbewerbsverhältnis is NOT required. [SETTLED]**

This is the answer that matters most, and it cuts against the intuitive assumption:

- Under the 1986 UWG, "Die Anwendung des neuen UWG setzt nicht ein Wettbewerbsverhältnis zwischen dem Täter und dem Verletzten voraus." The broader statutory term *Verhalten* (rather than *Wettbewerbshandlung*) was chosen precisely to capture "auch wettbewerbsrelevante Handlungen Dritter …, die nicht unmittelbar – als Wettbewerber oder Kunden – in das Spiel der Konkurrenz eingreifen."
- **BGE 120 II 76** ("Mikrowelle"): a person who is not in a competitive relationship but who nonetheless unfairly influences or endangers competition can be sued — journalist, publisher, consultant, etc.
- **BGE 126 III 198 E. 2c/aa p. 202**: the general clause means only conduct that is **objectively suitable to influence competition / the functioning of the market** can be unfair. The test is objective; the actor's intent and commercial status are irrelevant.

Source anchoring these: https://www.aarejura.ch/download/wettbewerb_im_internet.pdf and http://relevancy.bger.ch/cgi-bin/JumpCGI?id=BGE-133-III-431

**So the "we're non-commercial" defence does not exclude the UWG.** [SETTLED] A cross-retailer price comparison that steers consumer purchasing decisions plainly affects "das Verhältnis … zwischen Anbietern und Abnehmern" — the second limb of Art. 2 UWG, which does not mention competitors at all. basketch is squarely inside the UWG's objective scope.

**But there is a real counterweight [SETTLED]:** **BGE 133 III 431** establishes the methodology for the relationship between the Art. 2 general clause and the specific torts in Art. 3–8. Where conduct fails the elements of a specific provision, Art. 2 may **not** be used as a catch-all to reinstate liability; **besondere Umstände** (special circumstances) beyond the conduct itself are required. In that case, absent inducement to breach of contract (Art. 4) or trade-secret violation (Art. 6), the mere use of another's customer addresses was not unfair. Full text: http://relevancy.bger.ch/cgi-bin/JumpCGI?id=BGE-133-III-431 · http://www.polyreg.ch/bgepub/Band_133_2007/BGE_133_III_431.html

### 2.5 Swiss commentary specifically on Art. 5 lit. c and systematic scraping

Yes, it exists and is directly on point:
- **"Art. 5 lit. c UWG – reloaded"**, University of Zurich (https://www.ius.uzh.ch/dam/jcr:f99dadbe-fb90-4d6e-a9f6-29ade36ae063/Art.%C2%A05%20lit.%C2%A0c%20UWG%C2%A0%E2%80%93%20reloaded.pdf) — treats *marktreifes Arbeitsergebnis*, *technische Reproduktionsverfahren*, database application, the absent sui generis right, and BGE 131 III 384. **Caveat: the PDF would not yield extractable text through WebFetch; I am citing it as an identified on-point source, not quoting it.**
- **Jusletter IT, "Web Scraping"**, 11 Dec 2017: https://jusletter-it.weblaw.ch/flash/flash/11-dezember-2017/web-scraping_3cd0e00f27.html (WebFetch permission-denied in this environment — flagged as the leading Swiss practitioner treatment, unverified content).
- **MLL Legal**, *Skimming, Scraping, Scratching* (above).

---

## 3. CASE LAW

**Direct answer: Swiss case law on scraping is genuinely thin — two decisions carry essentially the whole load, and only one of them is a BGE.** I am stating that rather than padding.

### 3.1 BGE 131 III 384 (4C.336/2004, 4 February 2005) — the leading case [SETTLED]

Real-estate portal operators sued a competitor that ran a **search spider** systematically harvesting their published property ads and republishing them on its own platform.

**Regeste (verbatim):**
&gt; Art. 2 und 5 lit. c UWG; Übernahme der auf einer fremden Internet-Plattform erscheinenden Immobilien-Inserate; Unlauterkeit der Ausbeutung fremder Leistungen.
&gt; Ausbeutung fremder Leistungen als Fallgruppe unlauteren Verhaltens im Sinne von Art. 2 UWG (E. 3).
&gt; Die Unlauterkeit der Verwertung fremder Arbeitsergebnisse oder Leistungen wird in Art. 5 lit. c UWG durch die Art und Weise der Übernahme definiert; Voraussetzungen einer unzulässigen Verwertung (E. 4).
&gt; Systematische Daten-Übernahme als unlauteres Verhalten im Sinne von Art. 2 UWG (E. 5)?

**Holding on the nature of Art. 5 UWG (verbatim):**
&gt; "Mit Art. 5 UWG sollen keine neuen Ausschliesslichkeitsrechte geschaffen werden, sondern unlautere Praktiken in Zusammenhang mit der Nachahmung fremder Arbeitserzeugnisse wettbewerbsrechtlich verboten werden."

**The decisive holding for scraping (verbatim):**
&gt; "Die systematische Suche der Beklagten nach veröffentlichten, in ihr Angebot passenden Immobilien-Inseraten, deren Übernahme in die eigene Website sowie deren Anzeige nach den Strukturmerkmalen der eigenen Immobilien-Plattform ist als solche nicht unlauter."

**What was actually decided:** the claim **failed**. Art. 5 lit. c creates no new IP right, does not protect against imitation as such, and its elements are to be interpreted **very narrowly**. The defendant's own effort in programming and filtering the spider was held "nicht so unangemessen gering" as to satisfy the *ohne angemessenen eigenen Aufwand* element (E. 4.4.2). The plaintiffs also failed to substantiate the objective cost of producing their ads (E. 4.5). The Court further held that Art. 5 lit. c protection is **temporally limited to the amortisation period**: a first mover enjoys no protection once the creation costs of the work product have already been amortised. On Art. 2 UWG, systematic takeover of published listings is not unfair absent **besondere Umstände** (E. 5.3–5.4).

Sources: https://entscheide.weblaw.ch/cache.php?link=bge-131-iii-384&amp;sel_lang=de · https://datenrecht.ch/en/bge-131-iii-384-schutz-von-datenbanken-nach-uwg-5-lit-c-such-spider/ (Walder Wyss datenrecht.ch commentary) · bger.ch full text at https://www.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=atf://131-III-384:fr&amp;lang=de&amp;type=show_document&amp;zoom=YES (TLS certificate on bger.ch failed verification through WebFetch; weblaw mirror used).

### 3.2 Kantonsgericht Freiburg, II. Zivilappellationshof, 22 August 2016 (102 2015 189) — the contrary result [CANTONAL, not binding nationally]

A Swiss online classifieds platform sued an England-based competitor that spidered its listings. The court found **all four** Art. 5 lit. c elements satisfied and held "das Spidering als unlauteres Verhalten der Beklagten". It **expressly distinguished BGE 131 III 384 on technological grounds**: "die Technologie des Spiderings [habe sich] enorm weiterentwickelt", so that in 2016 the copying required "no actual programming" and the copied data needed "no processing before use" — collapsing the *angemessener eigener Aufwand* element that saved the defendant in 2005. It also found an Art. 3 Abs. 1 lit. e UWG violation for the "more listings than [plaintiff] / Number 1 in Switzerland" claim, because expired listings were counted.

Sources: https://www.mll-news.com/kger-freiburg-beurteilt-spidering-von-inseraten-als-unlautere-uebernahme-eines-fremden-arbeitsergebnisses/ · judgment PDF: https://entscheidsuche.ch/docs/FR_Gerichte/FR_TC_001_102-2015-189_2016-08-22.pdf (PDF text not extractable through WebFetch; facts taken from MLL's analysis). **I could not confirm whether this was appealed to the Bundesgericht — I found no BGer decision reviewing it.**

**Why this case is distinguishable for basketch [INFERENCE]:** the Fribourg defendant was (a) a **direct competitor** offering a substitutable classifieds service, (b) taking the listings over **substantially unaltered** and **as such**, (c) reproducing the plaintiff's product to compete with it, and (d) making false comparative claims. A non-competing basket-optimiser that transforms per-item price facts into a routing decision, with a genuinely different output artefact, hits none of those four.

### 3.3 What I searched for and did NOT find

- **comparis.ch**: no Swiss court decision on scraping or meta-search involving comparis surfaced. Nothing to report.
- **local.ch / search.ch / Swisscom Directories**: the known litigation is **competition law (KG/WEKO), not scraping**. WEKO closed an investigation into Swisscom Directories on market dominance in address directories; competitor Zip.ch appealed to the Bundesverwaltungsgericht over Swisscom Directories' partnerships with Google and Bing. This is Art. 7 KG market-dominance territory, **not** a UWG/database reuse precedent. Do not cite it as scraping authority. (https://www.moneycab.com/it/vorwuerfe-gegen-swisscom-directories-werden-gerichtsfall/)
- **A BGE squarely on "Datenbanken"** beyond 131 III 384: none found. BGE 133 III 431 is about customer addresses and general-clause methodology, not databases.
- Frequently-cited screen-scraping decisions in German-language search results (**BGH I ZR 224/12** *Flugvermittlung im Internet* / Ryanair, holding screen scraping permissible absent circumvention of technical protection; **BGH I ZR 159/10** *Automobil-Onlinebörse*) are **German**, not Swiss, and are persuasive at best. Do not present them as Swiss law.

**Bottom line: [SETTLED] one Federal Supreme Court decision (BGE 131 III 384) permitting search-spider takeover of published listings, and one cantonal decision (KGer FR 2016) reaching the opposite result on harsher facts against a direct competitor. There is no more than that.**

---

## 4. FADP / nDSG (revised DSG, in force 1 September 2023)

**Art. 5 lit. a DSG (verbatim):**
&gt; Personendaten: alle Angaben, die sich auf eine **bestimmte oder bestimmbare natürliche Person** beziehen

Source: https://www.datenschutzpartner.ch/dsg/dsg-5/ · https://datenschutz.law/revdsg/2-kapitel/1-abschnitt-begriffe-und-grundsaetze/art-5 · canonical: https://www.fedlex.admin.ch/eli/cc/2022/491/de

**Scope conclusion: [SETTLED] product names, prices, discount percentages and promotion validity dates are NOT personal data and fall entirely outside the DSG.** They relate to goods, not to an identified or identifiable natural person. A further point that matters here: the total revision **removed legal persons** from the DSG's scope — so even the *retailer's own* data has no DSG protection. Migros, Coop and Aldi Suisse cannot invoke the DSG against a scraper at all.

**Edge cases that would pull the DSG back in [SETTLED law, applied]:**
1. **Incidental personal data.** If the scrape captures customer reviews with usernames, store-employee names, contact persons, or seller identities, that *is* personal data and the DSG applies in full — including Art. 19 information duties and Art. 30/31 lawfulness. Publicly accessible status is no exemption: the EDÖB's joint statement is explicit that "Der Schutz von Personendaten endet nicht an der Schwelle zur Öffentlichkeit" and "Auch öffentlich zugängliche Personendaten unterliegen dem Datenschutzrecht." (https://www.edoeb.admin.ch/de/24082023-data-scraping · closing statement 31 Oct 2024: https://www.edoeb.admin.ch/de/31102024-gemeinsame-abschlusserklaerung-zum-thema-datenextraktion-data-scraping · https://www.activemind.ch/blog/data-scraping/). **Practical rule: hard-filter reviews, usernames and named contacts at the parser, not at the display layer.**
2. **basketch's own users.** If the app stores user shopping lists tied to accounts, basketch is itself a controller under the DSG for *that* data — independent of the scraping question.
3. **The retailer's privacy policy is irrelevant to this analysis.** A site operator's privacy policy governs *their* processing of *visitors'* data; it creates no data-protection claim over product/price data and cannot manufacture one.

---

## 5. "HAUSRECHT" AND CRIMINAL LAW (Art. 143 / 143bis StGB)

### 5.1 Art. 143 StGB — Unbefugte Datenbeschaffung (verbatim)

&gt; Wer in der Absicht, sich oder einen andern unrechtmässig zu bereichern, sich oder einem andern elektronisch oder in vergleichbarer Weise gespeicherte oder übermittelte Daten beschafft, die nicht für ihn bestimmt und **gegen seinen unbefugten Zugriff besonders gesichert** sind, wird mit Freiheitsstrafe bis zu fünf Jahren oder Geldstrafe bestraft.

Source: https://143bis.ch/kommentar/stgb-143/

### 5.2 Art. 143bis Abs. 1 StGB — Unbefugtes Eindringen in ein Datenverarbeitungssystem

&gt; Wer auf dem Wege von Datenübertragungseinrichtungen unbefugterweise in ein fremdes, **gegen seinen Zugriff besonders gesichertes** Datenverarbeitungssystem eindringt, wird, auf Antrag, mit Freiheitsstrafe bis zu drei Jahren oder Geldstrafe bestraft.

(Abs. 1 verified as to the operative elements and penalty; treat the exact word order as high-confidence but re-check against Fedlex before quoting in a filing. Abs. 2 criminalises putting into circulation or making accessible passwords/programs intended for such intrusion.) Sources: https://143bis.ch/kommentar/stgb-143bis/ · https://digilaw.ch/hacking/ · UZH Computerdelikte materials: https://www.ius.uzh.ch/dam/jcr:0540e6f2-8163-43a9-8c94-e2f1d68d0dd6/06_Computerdelikte%20.pdf

### 5.3 Does scraping a PUBLIC, unprotected page engage either? **No. [SETTLED]**

Three independent reasons, each sufficient:

1. **"Besonders gesichert" is a hard, unmet element.** Both provisions require the data / system to be *specially secured against the perpetrator's access*. A page served to any anonymous HTTP GET is by definition not specially secured. The commentary is emphatic that the protection must be **electronic and technical and directed specifically against that mode of access** — it is not even enough that the server sits in a locked room if there is no electronic access barrier. A robots.txt directive, a Terms-of-Use clause, or a "do not scrape" notice is a *declaration*, not a *Sicherung*, and does not satisfy the element. The protected legal interest is the entitled person's freedom to decide who gets access to a **secured** system — an interest that is not engaged where they chose to publish openly.
2. **Art. 143 additionally requires Bereicherungsabsicht** (intent of unlawful enrichment). A non-commercial project lacks it outright. (Art. 143bis is the residual offence precisely for actors *without* enrichment intent — and it is an **Antragsdelikt**, prosecuted only on complaint.)
3. **Art. 143 also requires the data be "nicht für ihn bestimmt."** Data a retailer deliberately publishes to the general public *is* intended for the reader.

Cf. BGE 145 IV 185 on the scope of the computer-crime provisions: https://www.bger.ch/ext/eurospider/live/de/php/clir/http/index.php?highlight_docid=atf://145-IV-185:de&amp;lang=de&amp;type=show_document

**[INFERENCE — the line to not cross]:** the analysis flips if the pipeline ever (a) uses credentials, a loyalty-card login, or a members-only area; (b) defeats a CAPTCHA, bot-detection, rate limiter or IP block; or (c) calls a private/undocumented internal API gated by a token. Each of those is a plausible *besondere Sicherung*, and circumventing it converts a civil-law question into a criminal one. Public HTML and openly documented endpoints only.

### 5.4 "Virtuelles Hausrecht" under Swiss law

**There is no recognised "virtuelles Hausrecht" as a distinct institution in Swiss law. [SETTLED, negative finding]** The concept is a **German** doctrinal construct, derived from §§ 858 ff./1004 BGB and § 903 BGB property rights over the server hardware, developed in German cases (LG Hamburg 315 O 326/08; OLG Hamburg 5 U 190/06; AG Kerpen; and the BGH's later revision of its position). I found **no** Swiss statutory basis and **no** Swiss decision importing it. Swiss law reaches the same practical territory instead through (i) the UWG, (ii) Art. 143/143bis StGB where access protections exist, and (iii) contract.

**Contract / Terms of Use [MAJORITY DOCTRINE]:** a scraping prohibition in AGB binds only if the AGB were **validly incorporated**. Merely placing terms behind an "AGB" hyperlink or in the Impressum, without a further incorporation step, generally does **not** produce a valid agreement — i.e. pure **browse-wrap is weak**. A bot that never registers, never clicks through, and never accepts anything is not in a contractual relationship with the site. Correspondingly, the German practitioner consensus that a scraping ban in AGB does not suffice where no technical protection is circumvented is persuasive by analogy. (https://www.voelker-gruppe.com/kompetenzen/ip-it-stuttgart/beitraege/screen-scraping-web-crawler · https://www.ias.uni-stuttgart.de/service/begriffslexikon/rechtliche_aspekte_screenscraping_und_datenbankscraping/) **[INFERENCE for Swiss law — I found no Swiss decision directly on browse-wrap enforceability against a scraper.]**

**One contrary voice to log honestly:** a Lexology practitioner guide on online IP in Switzerland states that Swiss law is silent on automatically scraped third-party content, that there is "no exemption for scraping of publicly available data," and that scraping "will most likely infringe a multitude of such third party rights and will therefore be unlawful." That is a notably more restrictive framing than the case law supports and it is not reconcilable with BGE 131 III 384's actual holding. **I could not verify it — Lexology returned HTTP 403 — and I am reporting it only as a search-index snippet, not as a source I read.** (https://www.lexology.com/library/detail.aspx?g=a3dd7da5-d824-403f-8497-782bbf94fbe5)

---

## Consolidated conclusions, by confidence label

| # | Conclusion | Label |
|---|---|---|
| 1 | Product names, prices, discount %, validity dates are not works under Art. 2 URG — no copyright | **[SETTLED]** |
| 2 | Art. 4 URG protects only selection/arrangement, never the underlying facts | **[SETTLED]** |
| 3 | Switzerland has **no** sui generis database right; the 2020 URG revision did not create one | **[SETTLED]** |
| 4 | A weekly promotion list is unlikely to be a protected Sammelwerk (functionally dictated selection) | **[MAJORITY DOCTRINE / INFERENCE]** |
| 5 | Product **photographs** are protected in CH even without individual character (Art. 2 Abs. 3bis) — do not copy images | **[SETTLED]** |
| 6 | UWG requires **no** Wettbewerbsverhältnis; it applies objectively to any conduct suitable to affect the market — "non-commercial" is **not** a shield | **[SETTLED]** (BGE 120 II 76; BGE 126 III 198 E. 2c/aa) |
| 7 | Art. 5 lit. c UWG creates no exclusive right, is construed narrowly, and its protection lapses once creation costs are amortised | **[SETTLED]** (BGE 131 III 384) |
| 8 | Systematic spider-based takeover of published listings is not *per se* unfair under Art. 2 UWG; *besondere Umstände* are required | **[SETTLED]** (BGE 131 III 384 E. 5; BGE 133 III 431 on general-clause methodology) |
| 9 | Transforming price facts into a different output artefact (per-item basket routing) fails the "als solches übernimmt" and "marktreifes Arbeitsergebnis" elements of Art. 5 lit. c | **[INFERENCE]** |
| 10 | KGer FR 2016 shows a court **will** find spidering unfair where the actor is a direct competitor, copies unaltered, invests trivial effort, and makes false comparative claims | **[CANTONAL PRECEDENT]** |
| 11 | The genuine legal exposure is **Art. 3 Abs. 1 lit. e UWG** — stale, expired, incomplete or misleadingly framed price comparisons | **[SETTLED law, applied]** |
| 12 | Product/price data falls entirely outside the DSG; legal persons are outside it too since the total revision | **[SETTLED]** |
| 13 | Incidentally scraped personal data (reviews, usernames, named contacts) *is* in scope — public accessibility is no exemption (EDÖB) | **[SETTLED]** |
| 14 | Art. 143 / 143bis StGB are not triggered by scraping a public, unprotected page — "besonders gesichert" is unmet, and Art. 143 additionally needs Bereicherungsabsicht | **[SETTLED]** |
| 15 | Circumventing login, CAPTCHA, rate limits, IP blocks or token-gated APIs would plausibly satisfy "besonders gesichert" and create criminal exposure | **[INFERENCE]** |
| 16 | No "virtuelles Hausrecht" exists as a Swiss legal institution (German construct only) | **[SETTLED, negative finding]** |
| 17 | Browse-wrap scraping bans are weak against a bot that never accepts terms | **[INFERENCE for CH]** |
| 18 | Swiss scraping case law is genuinely sparse: essentially BGE 131 III 384 plus KGer FR 2016. Nothing on comparis; the local.ch/Swisscom Directories dispute is cartel law, not scraping | **[SETTLED, negative finding]** |

**Operative risk summary for basketch:** the acquisition side is well-protected by the absence of a database right and by BGE 131 III 384. The exposure sits on the **publication** side under Art. 3 Abs. 1 lit. e UWG (accuracy, freshness, completeness of the comparison) and in **incidental personal data** under the DSG. Both are engineering-controllable: timestamp and validity-window every displayed promotion, expire aggressively, disclose retailer coverage, filter reviews/usernames/named contacts at parse time, take no product images, and never authenticate or defeat a bot control.</result>
<usage><subagent_tokens>94269</subagent_tokens><tool_uses>72</tool_uses><duration_ms>750904</duration_ms></usage>
</task-notification>