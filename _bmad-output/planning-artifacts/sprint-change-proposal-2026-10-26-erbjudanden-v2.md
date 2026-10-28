---
title: 'Kursändring: veckans erbjudanden, andra planen (Epic 9)'
date: 2026-10-27
status: godkänd (headless enligt docs/autonomi.md; länken beslutad av Pontus)
trigger: 'Pontus 2026-10-26: "Jag vill helst kunna ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade." och Pontus val av funktioner'
supersedes: sprint-change-proposal-2026-10-26-erbjudanden.md
scope: Moderate
branch: epic/9-erbjudanden-v2
---

# Kursändring: veckans erbjudanden, andra planen (Epic 9)

Läge: batch och headless. Pontus sover och har gett fria händer ("Implementera det som är möjligt i natt"). Beslutet om länken är Pontus eget. Övriga val går att ändra senare, så enligt grundregeln i `docs/autonomi.md` fattas de utan att fråga. Valen står i `docs/beslutslogg.md` och frågorna i `docs/oppna-fragor.md`.

Den här planen ersätter den första planen för Epic 9 (`sprint-change-proposal-2026-10-26-erbjudanden.md`, grenen `epic/9-erbjudanden`, `c72942e`), som ligger kvar som underlag. Grenen `epic/9-erbjudanden-v2` utgår från `epic/12-asynkron-ai`, där Epic 10–12 är planerade.

## 1. Sammanfattning av ändringen

### Vad som utlöste ändringen

Den första planen för 1.2 lät Pontus klistra in eller fotografera erbjudandena, och Matkoll fick aldrig hämta något från en butik. Två saker har ändrats sedan dess:

1. **Pontus vill ha en länk.** "Jag vill helst kunna ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade." Förstudien `docs/erbjudanden-lankar.md` visar:
   - **ICA fungerar.** `https://www.ica.se/erbjudanden/<slug>-<butiks-id>/` är samma adress varje vecka, och en vanlig GET ger hela veckan i `window.__INITIAL_DATA__ → offers.weeklyOffers`. För Pontus butik, Maxi ICA Stormarknad Östersund (1003733), var det 213 erbjudanden vecka 44, varav 122 inte mat.
   - **Willys, Hemköp, Coop och Lidl** bygger erbjudandena i webbläsaren. Där gäller text och foto.
2. **Pontus valde funktioner** ur en lista och godkände rekommendationen i stort:
   - en erbjudandeetikett på inköpslistan ("Falukorv 29 kr");
   - ett filterpiller i Recept för recept med veckans erbjudanden;
   - "Fyll på lagret" för basvaror på erbjudande, särskilt inför stugan;
   - AI-förslag med erbjudanden (Story 9.2 i den första planen);
   - en föreslagen veckomeny från erbjudanden och lager, som ett nytt AI-jobb;
   - bevakningar med aviseringar väntar.

Dessutom har Epic 11 (nytt utseende) och Epic 12 (AI-jobb i kö) planerats sedan den första planen. Epic 9 ska följa båda.

### Typ av ändring

Ett nytt beslut av Pontus om en planerad epic som ännu inte är byggd. Inget byggt ändras. Den första planens nummer behålls.

### Byggordning

Epic 9 byggs efter Epic 12, i grenen `epic/9-erbjudanden-v2`. 9.1–9.4 behöver bara Epic 11 och kan byggas före Epic 12 om Pontus vill få nyttan tidigare. 9.5–9.8 och 9.10 behöver AI-jobben (12.4), och 9.5–9.6 det kortare svaret (12.3).

### Underlag

- **Förstudien** `docs/erbjudanden-lankar.md`: sidans form, fälten, villkoren, felfallen och kraven på tester. Den kom från grenen `epic/11-nytt-utseende` (`f7c5544`) och följer med i den här grenen.
- **Hämtningen** (AD-11): `safeFetch` med domänkontroll, DNS-kontroll, omdirigeringar, 10 s och 3 MB, en User-Agent i formen `Mozilla/5.0 (compatible; Matkoll/1.0; +…)`, och `fixture-sites.ts` med `tests/fixtures/sites/manifest.json`, så att tester aldrig lämnar datorn.
- **Butikerna** (7.1): `store` med `chain`, `external_store_id` och `url` (ICA Handla, en annan plattform än erbjudandesidan), `save_store` och `ensure_user_defaults()`.
- **Historik för basvaror:** `pantry_addition` har bara en nyckel (bockens id) och tas bort när listan rensas och efter 30 dagar. `pantry_removal` lever en dag. Det finns ingen historik över köp, så "Fyll på lagret" utgår från lagret på alla ställen och produktvalen.
- **Utseendet** (Epic 11): kategorier med platta, listgrupper och listrader, grå soptunna med "Ångra", produktetiketten (ljusblå), receptkort och rättkort, och flikarna Recept, Matsedel, Inköpslista och Lagersaldo. Skisserna ligger i `ux-designs/ux-Matkoll-2026-10-25/mockups/`.
- **AI-jobben** (Epic 12, AD-28): `ai_job` med sorterna `suggest`, `analyze` och `import`, kön, `after()`, pollning och det kompakta svaret för förslag.

## 2. Konsekvensanalys

### 2.1 Checklista

| # | Punkt | Status | Not |
| --- | --- | --- | --- |
| 1.1 | Utlösande story | [N/A] | Inget fel i en story. Utlöses av Pontus beslut. |
| 1.2 | Problemformulering | [x] | Erbjudandena ska komma från en länk per butik och användas på inköpslistan, i Recept, för lagret, i AI-förslagen och i en veckomeny. |
| 1.3 | Underlag | [x] | Avsnitt 1. |
| 2.1 | Pågående epic | [x] | Epic 10 byggs. Epic 11 och 12 är planerade. Inget av dem ändras. |
| 2.2 | Ändringar på epic-nivå | [x] | Epic 9 planeras om: tio stories i stället för fyra. |
| 2.3 | Kommande epics | [x] | 1.3 (butiksjämförelse) kan läsa `store_offer`. Inget ändras nu. |
| 2.4 | Ogiltiga eller nya epics | [x] | Den första planens stories ersätts. Inga nya epics. |
| 2.5 | Ordning | [x] | Epic 10 → 11 → 12 → 9, med 9.1–9.4 möjliga efter Epic 11. Inom Epic 9: nyttan först (avsnitt 4.4). |
| 3.1 | PRD | [!] | FR-34–FR-36 och NFR-10 skrivs om, FR-51–FR-54 är nya, UJ-7 skrivs om. |
| 3.2 | Arkitektur | [!] | AD-25 skrivs om. Tillägg i AD-1, AD-9, AD-11, AD-15, AD-18, AD-24 och AD-28. |
| 3.3 | UX | [!] | Arket Veckans erbjudanden, länken i Inställningar, erbjudandeetiketten, filtret Erbjudanden, Fyll på lagret, förslaget till veckans matsedel, texter, tillstånd och Flöde 7. En ny token, `offer-chip`. |
| 3.4 | Andra artefakter | [!] | Två migrationer, typer, RLS-test, designtester, ESLint, fixtursidor, felkoder, revalidering och e2e-användare. Ingen ny miljövariabel och ingen ändring av CI. |
| 4.1 | Direkt justering | Gångbar | Epic 9 är inte byggd. |
| 4.2 | Återställning | Inte gångbar | Inget är byggt. |
| 4.3 | MVP-översyn | Inte gångbar | 1.0 och 1.1 är oförändrade. |
| 4.4 | Vald väg | [x] | Alternativ 1: Epic 9 planeras om. |
| 5.1–5.5 | Förslagets delar | [x] | Avsnitt 1–5. |
| 6.1–6.2 | Granskning | [x] | Förslaget stämmer med de uppdaterade dokumenten. |
| 6.3 | Godkännande | [x] | Länken: Pontus. Resten: headless enligt `docs/autonomi.md`. |
| 6.4 | `sprint-status.yaml` | [x] | `epic-9: backlog`, tio stories och `epic-9-retrospective: optional`. Bara nya nycklar. |
| 6.5 | Överlämning | [x] | Avsnitt 5. |

### 2.2 Epics

- **Epic 1–8, 10–12:** inga ändringar. Epic 9:s stories bygger ut befintliga ytor (inköpslistan, Recept, Matsedel, Inställningar och AI-förslagen) som egna stories.
- **Epic 9:** tio stories (avsnitt 4.4). Den första planens fyra stories och specar ersätts.
- **1.3:** berörs inte nu.

### 2.3 Påverkan på stories som redan är byggda eller planerade

| Byggt eller planerat i | Före | Med Epic 9 |
| --- | --- | --- |
| 7.1 Butik | Namn, kedja, butiks-id, adress, URL | Också "Länk till veckans erbjudanden", förifylld för Maxi ICA. `save_store` tar `offers_url`. |
| 1.8 Hämtning | Bara receptsajter | `safeFetch` hämtar också godkända erbjudandesidor, med egen User-Agent. Receptimporten är oförändrad. |
| 3.5, 11.4 Inköpslistan | Poster, produktetikett | Erbjudandeetikett på raden under och erbjudanden i listpostdetaljen. Rubriken får "Erbjudanden". Listan och exporten är oförändrade. |
| 5.1, 11.5 Recept | Alla, Favoriter, Kan lagas nu | Ett fjärde piller, Erbjudanden. De andra är oförändrade. |
| 5.2, 12.3, 12.4, 12.7 AI-förslag | Utifrån lagret | Med erbjudandenas namn, etiketter och en rubrik. Utan erbjudanden som förut. |
| 11.5 Matsedel | Rättkort, "Lägg till rätt" | "Föreslå veckans matsedel" och förslaget. |
| 12.4 AI-jobb | `suggest`, `analyze`, `import` | Också `offers` och `weekplan`. |
| 8.x Lagret | Per ställe | `listStockedSites` för "Fyll på lagret", utan mängder. |

### 2.4 PRD

- **Ordlistan:** erbjudande, veckans erbjudanden, länk till erbjudanden, basvara och erbjudandeetikett.
- **Krav** (addendumet, avsnittet "Version 1.2: Veckans erbjudanden (Epic 9)"):

  | Krav | Innehåll |
  | --- | --- |
  | FR-34 | Lägga in: länk och hämtning, text och foto som reserver |
  | FR-35 | Se och ta bort |
  | FR-36 | AI-förslag med erbjudanden |
  | FR-51 | Erbjudanden på inköpslistan |
  | FR-52 | Filtret Erbjudanden |
  | FR-53 | Fyll på lagret |
  | FR-54 | Förslag till veckans matsedel |
  | NFR-10 | Hämtning från butiker, omskriven från "ingen hämtning" |

- **Ändrade konsekvenser:** FR-23 (erbjudanden som indata) och FR-28 (länken). FR-8, FR-15, FR-22 och FR-26 är uttryckligen oförändrade.
- **UJ-7** skrivs om till "Pontus planerar veckan efter erbjudandena". **SM-C4** gäller som förut.
- **Utanför 1.2:** automatisk hämtning, bevakningar, fler kedjor med länk, historik över köp, prisjämförelse och flera butiker på en gång.
- `prd.md` §8.3 får en punkt om 1.2.

### 2.5 Arkitektur

- **AD-25 skrivs om, "Veckans erbjudanden":**
  - länken och `OFFER_SITES`;
  - datamodellen med `label_key`, `section`, `note`, `member_only`, `valid_to` och `source`;
  - veckan, hämtningen, läsaren utan `eval` och skrivningen;
  - katalogen, användningarna utan AI, AI-delarna, testerna, felen och revalideringen.
- **Tillägg:**

  | AD | Tillägg |
  | --- | --- |
  | AD-1 | `offers` får importera `src/server/fetch` |
  | AD-9 | `offers` i `suggestDishes`, `planWeek`, `extractOffers` och eventuellt `matchOffers` |
  | AD-11 | Godkända erbjudandesidor, beslutat av Pontus |
  | AD-15 | Ett foto av ett blad behandlas som en plats och sparas aldrig |
  | AD-18 | Revalideringen för `store_offer` och `store` |
  | AD-24 | `listStockedSites` |
  | AD-28 | Sorterna `offers` och `weekplan` |

- **Frontmatter, modultabellen, källträdet, datamodellen, Capability Map och Deferred** uppdateras. `.memlog.md` har beslutet.

### 2.6 UX

- **`EXPERIENCE.md`:**
  - Foundation och IA;
  - Voice and Tone för erbjudanden;
  - Component Patterns: Erbjudandeetikett, Veckans erbjudanden (ark), Fyll på lagret, Filtret Erbjudanden och Förslag till veckans matsedel;
  - 16 nya tillstånd;
  - Flöde 7, "Veckan efter erbjudandena";
  - Settings med länken.
- **`DESIGN.md`:** token `offer-chip` (mint), och en rad om att arket bara använder befintliga komponenter.
- **Ändrat mot den första planen:** raden Veckans erbjudanden i Kan lagas nu försvinner. Ingången är textknappen "Erbjudanden" i Inköpslistans rubrik och filtret Erbjudanden i Recept. Arket följer Epic 11: kategorier med platta, listrader och en grå soptunna med "Ångra".

### 2.7 Kod och drift (ingen kod ändras i den här kursändringen)

- **Migrationer:**
  - `settings`: `store.offers_url`, `save_store` och `ensure_user_defaults()`;
  - `offers`: `store_offer` och `save_store_offers`;
  - 9.6 och 9.7 ändrar `ai_job.kind`.

  Alla bara lägger till (AD-5).
- **Fixtursidor:** `tests/fixtures/sites/ica-erbjudanden*.html` med påhittade varor och en påhittad token.
- **ESLint:** `offers` får importera `src/server/fetch`, och `no-eval`, `no-new-func` och `no-implied-eval` gäller hela `src/`.
- **Ingen ny miljövariabel och ingen ändring av CI.** Drift: migrationerna körs med `supabase db push` före koden (AD-23).

## 3. Rekommenderad väg

**Alternativ 1, direkt justering:** Epic 9 planeras om med tio stories. Inget byggt ändras.

### Beslut inom alternativ 1

| Fråga | Vald | Andra alternativ och skäl |
| --- | --- | --- |
| Hur erbjudandena kommer in | Länk per butik (beslutat av Pontus). Text och foto är reserver | **Bara text och foto** (den första planen): Pontus vill hellre ha länken. **Automatisk hämtning:** väntar (backlog). |
| Vilka sajter | En fast lista i koden, i 1.2 bara `www.ica.se` | **Pontus väljer domän som för recept:** varje sajt behöver en egen läsare och egna fixturer. **Willys, Hemköp, Coop, Lidl:** kräver JavaScript eller interna API:er. |
| Var länken bor | `store.offers_url` i `settings` | **En egen tabell i `offers`:** länken är en egenskap hos butiken, och Pontus bad om den i Inställningar. |
| Hur sidan läses | Deterministisk läsare av `__INITIAL_DATA__`, utan `eval` | **AI som receptimporten:** kapar texten och ser bara ett 20-tal av 213. **`eval` eller `vm`:** kör butikens kod på servern. |
| Granskning | Länken sparas direkt. Text och foto granskas | **Granska också länken:** ingen AI tolkar den, och trycket "Hämta" är Pontus beslut. |
| Ny hämtning | Ersätter länkens erbjudanden för veckan | **Lägga ihop:** gamla erbjudanden som butiken har tagit bort skulle stå kvar. |
| Unik nyckel | Namnet som butiken skrev det (`label_key`) | **Varan (`name`)**, som i den första planen: två märken av samma vara skulle bli ett. |
| Katalogen | `matchIngredients`. AI bara om mätningen visar behov (9.10) | **AI direkt:** kostar tid och token varje vecka utan att veta om det behövs. |
| Var ingången finns | "Erbjudanden" i Inköpslistans rubrik och filtret i Recept | **Raden i Kan lagas nu** (den första planen): erbjudandena används nu på flera ställen. **En femte flik:** fyra flikar räcker. |
| Etikettens färg | Mint (`offer-chip`) | **Ljusblå:** är redan produktetikett och "saknas". **Sand:** är AI-etiketten. |
| Basvaror | I lagret på något ställe nu, eller med produktval | **Kvittona i `pantry_addition`:** har ingen vara och försvinner. **En ny historik:** öppen fråga 27. |
| AI-förslagens ordning | AI:ns ordning, prompten ber om erbjudanden först | **Sortera på servern** (den första planen): korten skulle flytta sig när rätterna kommer en i taget (12.7). |
| Veckomenyn | AI-jobbet `weekplan`: fem rätter, i första hand ur biblioteket och högst två nya | **Bara nya rätter:** Pontus skulle behöva granska fem recept. **Bara biblioteket utan AI:** filtret Erbjudanden gör redan det. |
| Text och foto | AI-jobb av sorten `offers` | **Egna rutter** (den första planen): Epic 12 gör alla AI-flöden till jobb. |

**Insats:** medel. 9.1 är störst (två migrationer, läsaren, hämtningen och arket). 9.6 är näst störst. 9.2–9.4 och 9.9 är små.
**Risk:** låg till medel.
- Den största osäkerheten är om ica.se godtar Matkolls ärliga User-Agent (T13). Den prövas en gång i 9.1, och svaret avgör om text kommer direkt efter.
- Därefter kommer hur många erbjudanden som kopplas till katalogen (T14).
- Sidans form kan ändras utan förvarning. Läsaren misslyckas då tydligt med en reserv.

## 4. Ändringar i detalj

Alla ändringar nedan är införda i dokumenten.

### 4.1 PRD

- `addendum.md`: nytt avsnitt **"Version 1.2: Veckans erbjudanden (Epic 9)"** med mål, UJ-7, ordlista, FR-34–FR-36, FR-51–FR-54, NFR-10, ändrade konsekvenser, effektmål, vad som ligger utanför och datamodellen.
- `prd.md` §8.3: en punkt om 1.2.

**Exempel, NFR-10:**

```
FÖRE (första planen): Matkoll hämtar aldrig något från en butiks webbplats. Ingen kod i flödet anropar fetch eller safeFetch.
EFTER: Matkoll hämtar bara från godkända erbjudandesajter (i 1.2 www.ica.se), en hämtning per tryck med en ärlig User-Agent, inget nytt försök vid 403 eller 429, sidan läses utan att kod från den körs, och tester anropar aldrig en butik.
```

Skäl: Pontus beslut om länken, och reglerna från förstudien.

### 4.2 Arkitektur (`ARCHITECTURE-SPINE.md`)

- Frontmatter: `scope` Epic 1–12, `binds` med FR-34–FR-36, FR-51–FR-54 och NFR-10, och källorna.
- Modultabellen: `offers` äger `store_offer`.
- **AD-25 skrivs om.** Platshållaren "AD-25 hör till Epic 9 … vilar" ersätts.
- Tillägg i AD-1, AD-9, AD-11, AD-15, AD-18, AD-24 och AD-28. Id:n för befintliga AD ändras inte.
- Källträdet, datamodellen, Capability Map och Deferred ("Erbjudanden efter 1.2").
- `.memlog.md`: beslutet loggat.

**Exempel, AD-11:**

```
FÖRE: src/server/fetch/safeFetch(...) är den enda kod som hämtar från receptsajter.
EFTER: Tillägg (1.2, AD-25), beslutat av Pontus: safeFetch hämtar också butikers erbjudandesidor, med samma kontroller, men bara från den fasta listan OFFER_SITES och bara den adress som är sparad i store.offers_url.
```

### 4.3 UX

- `EXPERIENCE.md` och `DESIGN.md` enligt avsnitt 2.6.

### 4.4 Epics (`epics.md`)

`## Epic 9: Veckans erbjudanden` står sist, efter Epic 12, med:

1. **Story 9.1: Veckans erbjudanden från butikens länk.** Länken i Inställningar, `store_offer`, hämtningen, läsaren, arket och ingången i Inköpslistan.
2. **Story 9.2: Erbjudanden på inköpslistan.** Etiketten "Falukorv 29 kr" och listpostdetaljen.
3. **Story 9.3: Filtret Erbjudanden i Recept.** Pillret, huvudvarorna, sorteringen och etiketterna på korten.
4. **Story 9.4: Fyll på lagret.** Basvaror på erbjudande, var de finns, och "Lägg på listan".
5. **Story 9.5: AI-förslag med veckans erbjudanden.** Den första planens 9.2, i AI-jobbet.
6. **Story 9.6: Veckans matsedel från erbjudanden och lagret.** AI-jobbet `weekplan`.
7. **Story 9.7: Erbjudanden från inklistrad text.** AI-jobbet `offers` med granskning.
8. **Story 9.8: Erbjudanden från foto av reklambladet.** Samma jobb med bild.
9. **Story 9.9: Ta bort erbjudanden.** Soptunna, "Ångra" och "Ta bort alla".
10. **Story 9.10: AI kopplar fler erbjudanden till katalogen.** Byggs bara om T14 visar behov.

Requirements Inventory, Additional Requirements, UX Design Requirements (UX-DR19, UX-DR20, UX-DR32, UX-DR33), FR Coverage Map och Epic List är uppdaterade.

### 4.5 Sprintstatus

`sprint-status.yaml` får:

```yaml
  epic-9: backlog
  9-1-veckans-erbjudanden-från-butikens-länk: backlog
  9-2-erbjudanden-på-inköpslistan: backlog
  9-3-filtret-erbjudanden-i-recept: backlog
  9-4-fyll-på-lagret: backlog
  9-5-ai-förslag-med-veckans-erbjudanden: backlog
  9-6-veckans-matsedel-från-erbjudanden-och-lagret: backlog
  9-7-erbjudanden-från-inklistrad-text: backlog
  9-8-erbjudanden-från-foto-av-reklambladet: backlog
  9-9-ta-bort-erbjudanden: backlog
  9-10-ai-kopplar-fler-erbjudanden-till-katalogen: backlog
  epic-9-retrospective: optional
```

### 4.6 Epic-kontext och spec-utkast

- `_bmad-output/implementation-artifacts/epic-9-context.md`, i samma form som de andra.
- Utkast till story-specar (status `draft`), i samma mall som de färdiga:
  - `spec-9-1-veckans-erbjudanden-fran-butikens-lank.md`
  - `spec-9-2-erbjudanden-pa-inkopslistan.md`
  - `spec-9-3-filtret-erbjudanden-i-recept.md`
  - `spec-9-4-fyll-pa-lagret.md`
  - `spec-9-5-ai-forslag-med-veckans-erbjudanden.md`
  - `spec-9-6-veckans-matsedel-fran-erbjudanden-och-lagret.md`
  - `spec-9-7-erbjudanden-fran-inklistrad-text.md`
  - `spec-9-8-erbjudanden-fran-foto-av-reklambladet.md`
  - `spec-9-9-ta-bort-erbjudanden.md`
  - `spec-9-10-ai-kopplar-fler-erbjudanden-till-katalogen.md`

  Den första planens specar (`spec-9-1` till `spec-9-4` på `epic/9-erbjudanden`) följer inte med.

### 4.7 Dokument i `docs/`

- `erbjudanden-lankar.md`: förstudien, nu i den här grenen.
- `beslutslogg.md`: kursändringens beslut, överst.
- `oppna-fragor.md`:
  - fråga 8 besvarad av Pontus (länken);
  - frågorna 9 och 10 omskrivna;
  - nya frågor 26–30;
  - T12 och nya T13–T14.
- `backlog-efter-1-0.md`: punkt 2 är planerad som Epic 9 v2. Automatisk hämtning, bevakningar med aviseringar och fler kedjor med länk väntar.

## 5. Överlämning

- **Omfattning:** Moderate. En omplanerad epic och nya planeringsdokument, men ingen ny plan för hela appen.
- **Mottagare:** utvecklingen (`bmad-build`), story för story i ordningen 9.1 → 9.10 utan att fråga mellan storyna, efter Epic 12. Två undantag:
  - nekar ica.se i 9.1 (T13) kommer 9.7 direkt efter;
  - 9.10 byggs bara om T14 visar behov.

  Utkasten till specar slutförs när storyn påbörjas.
- **Gren:** `epic/9-erbjudanden-v2`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Grenen tas om på `main` när Epic 10–12 är ihopslagna. Den gamla grenen `epic/9-erbjudanden` är ersatt och kan tas bort när den här är ihopslagen.
- **E2E-användare (en per spec):** står i epic-kontexten, från `e2e-erbjudanden-lank@matkoll.test` (9.1) till `e2e-erbjudanden-koppla@matkoll.test` (9.10).
- **Board:** story-rubrikerna i `epics.md` är klara för `scripts/board.mjs sync`, som körs när epicen påbörjas, inte i den här kursändringen.
- **Klart betyder:**
  - Pontus kan spara länken, trycka "Hämta veckans erbjudanden" och se veckans erbjudanden på mat i kategorier, från ica.se i appen och från fixturerna i testerna.
  - Inköpslistan har "Falukorv 29 kr", filtret Erbjudanden visar recepten, och "Fyll på lagret" visar vad som saknas i stugan.
  - AI-förslagen och veckomenyn använder erbjudandena, och utan erbjudanden är förslagen som förut (test).
  - Text och foto fungerar som reserver, med granskning.
  - Ingen test anropar en butik. Sidan läses aldrig med `eval`, och token, kakor och interna adresser finns aldrig i databasen eller loggarna (test).
  - Lagningsstatus, inköpslistans poster och exporten är oförändrade.
  - Alla sex kontroller passerar.
- **Pontus:** inga konton eller hemligheter behövs. Efter epicen provar Pontus Flöde 7 och svarar på öppna frågor 9, 10 och 26–30. T13 och T14 fylls i under 9.1.
