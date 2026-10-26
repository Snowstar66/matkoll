---
title: 'Kursändring: version 1.2 "Veckans erbjudanden"'
date: 2026-10-26
status: godkänd (headless enligt docs/autonomi.md)
trigger: docs/backlog-efter-1-0.md, punkt 2, och Pontus beslut om den enkla första versionen (2026-10-26)
scope: Moderate
branch: epic/9-erbjudanden
---

# Kursändring: version 1.2 "Veckans erbjudanden"

Läge: batch och headless. Pontus har beslutat att 1.2 ska byggas i den enkla versionen. Alla val i det här förslaget går att ändra senare, så enligt grundregeln i `docs/autonomi.md` fattas de utan att fråga. Valen står i `docs/beslutslogg.md` och frågorna i `docs/oppna-fragor.md`.

Kursändringen görs parallellt med att Epic 8 (version 1.1, flera ställen) byggs i grenen `epic/8-flera-stallen`. Den här grenen, `epic/9-erbjudanden`, utgår från `main`. Numren följer efter Epic 8: FR-34–FR-36, NFR-10, AD-25, UX-DR19–UX-DR20, UJ-7, Flöde 7 och öppna frågor 8–10. Epic 9 byggs efter att Epic 8 är ihopslagen.

## 1. Sammanfattning av ändringen

### Vad som utlöste ändringen

Version 1.0 (Epic 1–7) är klar och ihopslagen i `main`. 1.1 (Epic 8) byggs. Det andra tillägget efter 1.0 är **menyförslag utifrån veckans erbjudanden** (`docs/backlog-efter-1-0.md`, punkt 2). Pontus valde den enkla första versionen:

- Pontus klistrar in butikens erbjudanden (text kopierad från butikens sida) eller fotograferar reklambladet.
- AI:n plockar ut erbjudandena med samma teknik som receptimporten och bildanalysen: AI-porten i `src/server/ai/`, med strikta scheman och promptar.
- AI-förslagen (Epic 5) prioriterar rätter som använder varor på erbjudande i vald butik den här veckan.
- Att hämta erbjudanden automatiskt varje vecka från ICA, Willys, Coop och Lidl ingår inte. Det är ett senare alternativ.

### Typ av ändring

Ett nytt krav från Pontus efter 1.0. Det är inget fel i det som är byggt och ingen ändring av målen. 1.0:s och 1.1:s krav gäller som förut. FR-23 (AI-förslag) får erbjudanden som ytterligare indata.

### Underlag

- **AI-porten** (AD-9) har `parseRecipe`, `analyzeImage` och `suggestDishes`, med `runStructured`, strikta scheman i `schemas.ts`, promptar i `prompts/`, en deterministisk mock och `pnpm eval:ai`. `analyzeImage` kontrollerar varje post för sig (`parseAnalyzeItems`), så att en dålig post inte gör hela svaret ogiltigt. Story 6.5 (i Epic 8:s gren) gav bilder av platser 2048 px och Qwens sampling.
- **Importen** (1.6, 1.9) har arket med flikar, `postAi` och `postAiForm`, `route-support.ts` med `readImageForm` och förminskningen i klienten.
- **AI-förslagen** (5.2) läser lagret på servern (`getPantrySnapshot()`), bygger indata med `toSuggestInput` och gränserna i `src/lib/suggest-input.ts`, kräver minst två varor hemma per förslag och visar förslagen i `recipes/ui/ai-suggestions.tsx`. Klienten skickar bara titlar att undvika.
- **Butikerna** (7.1) finns i `settings` med `store`, `is_selected` och `getSelectedStore()`. `product_choice` refererar `store` med en sammansatt nyckel och `on delete restrict`. En butik kan inte tas bort i v1.
- **Receptimport från länk** (AD-11) hämtar bara från godkända receptsajter med `safeFetch`. coop.se bygger sina sidor i webbläsaren, så serverhämtningen gav ingen text (T1).
- **Epic 8** gör att `getPantrySnapshot()` utan argument gäller valt ställe (AD-24). Epic 9 behöver inget mer än det.

## 2. Konsekvensanalys

### 2.1 Checklista

| # | Punkt | Status | Not |
| --- | --- | --- | --- |
| 1.1 | Utlösande story | [N/A] | Inget fel i en story. Utlöses av Pontus beslut om 1.2. |
| 1.2 | Problemformulering | [x] | Nytt krav: AI-förslagen ska ta hänsyn till veckans erbjudanden i vald butik, med erbjudanden som Pontus klistrar in eller fotograferar. |
| 1.3 | Underlag | [x] | `docs/backlog-efter-1-0.md`, punkt 2, koden i `src/server/ai`, `suggestions`, `settings` och importen (avsnitt 1). |
| 2.1 | Pågående epic | [x] | Epic 8 byggs i en egen gren. Epic 9 planeras parallellt och byggs efter Epic 8. Ingen av Epic 8:s stories ändras. |
| 2.2 | Ändringar på epic-nivå | [x] | Ny Epic 9: Veckans erbjudanden, med 4 stories. |
| 2.3 | Kommande epics | [x] | 1.3 (butiksjämförelse) kan senare läsa `store_offer`, som har butik, vecka och katalogingrediens. Inget i 1.3 ändras nu. |
| 2.4 | Ogiltiga eller nya epics | [x] | Inga epics blir ogiltiga. En ny epic. |
| 2.5 | Ordning | [x] | Epic 8 före Epic 9, enligt Pontus ordning. Inom Epic 9: text, förslag, foto, hantering. |
| 3.1 | PRD | [!] | Nya krav FR-34–FR-36 och NFR-10 i addendumet. Ordlistan får "Erbjudande" och "Veckans erbjudanden". FR-23 får erbjudanden som indata. Ny användarresa UJ-7 och nytt motmått SM-C4. |
| 3.2 | Arkitektur | [!] | Ny AD-25. Tillägg i AD-9, AD-15 och AD-18. Modultabellen, källträdet, datamodellen, Capability Map och Deferred uppdateras. |
| 3.3 | UX | [!] | Raden Veckans erbjudanden, arket Veckans erbjudanden, raderna om erbjudanden i AI-förslagen, nya tillstånd och texter, och Flöde 7. |
| 3.4 | Andra artefakter | [!] | Ny migration, typer, RLS-test, designtest, ESLint-zon, nya fixturer och utvärderingar, `revalidateFor`, nya felkoder och e2e-användare. Ingen ny miljövariabel och ingen ändring av CI. |
| 4.1 | Direkt justering | Gångbar | Ny epic inom den befintliga strukturen. Låg till medel insats och låg risk. |
| 4.2 | Återställning | Inte gångbar | Inget behöver göras om. |
| 4.3 | MVP-översyn | Inte gångbar | 1.0 är klar. 1.2 lägger till, utan att minska något. |
| 4.4 | Vald väg | [x] | Alternativ 1: direkt justering med en ny Epic 9. |
| 5.1–5.5 | Förslagets delar | [x] | Avsnitt 1, 2, 3, 4 och 5 nedan. |
| 6.1–6.2 | Granskning | [x] | Förslaget stämmer med de uppdaterade dokumenten. |
| 6.3 | Godkännande | [x] | Headless: godkänt enligt grundregeln i `docs/autonomi.md`, eftersom allt går att ändra. Pontus beslutade själva tillägget och versionen. |
| 6.4 | `sprint-status.yaml` | [x] | `epic-9: backlog`, fyra stories och `epic-9-retrospective: optional`. Bara nya nycklar. |
| 6.5 | Överlämning | [x] | Avsnitt 5. |

### 2.2 Epics

- **Epic 1–7:** inga ändringar i det som är byggt. AI-förslagen (5.2) och raden i biblioteket (5.1) byggs ut i Epic 9:s stories, inte som omarbetning av gamla stories.
- **Epic 8:** inga ändringar. Epic 9 är oberoende av ställen. Det enda den har gemensamt med lagret är att AI-förslagen läser `getPantrySnapshot()` utan argument, som efter Epic 8 gäller valt ställe.
- **Epic 9 (ny):** Veckans erbjudanden, med fyra stories i ordning (avsnitt 4.4).
- **1.3 (butiksjämförelse):** berörs inte nu.

### 2.3 Påverkan på stories som redan är byggda

| Byggt i | Beteende före 1.2 | I 1.2 |
| --- | --- | --- |
| 5.2 | AI-förslagen utgår bara från lagret | Utgår från lagret och, när de finns, veckans erbjudanden i vald butik. Förslag med erbjudanden står först och har "På erbjudande: …". Utan erbjudanden är allt som förut. |
| 5.1 | Filtret "Kan lagas nu" med knappen "Föreslå rätter med AI" längst ned | Raden Veckans erbjudanden står ovanför knappen. Rangordningen är oförändrad. |
| 1.4, 6.1, 6.5 | AI-porten har tre metoder | En fjärde, `extractOffers`, med samma regler. Bilder av blad behandlas som bilder av platser. |
| 7.1 | Butiken används av produktval och export | Erbjudanden sparas per butik, och raden följer vald butik. `store` revaliderar också `/recept`. |
| Övriga | – | Oförändrade. |

### 2.4 PRD

- **Ordlistan:** nya begrepp: **Erbjudande** (en vara som en butik säljer billigare under en vecka, med namnet som i bladet, varan i grundform och priset som text) och **Veckans erbjudanden** (de erbjudanden som gäller för vald butik och den senaste vecka som inte är slut).
- **Nya krav** (addendumet, avsnittet "Version 1.2: Veckans erbjudanden"):
  - FR-34: lägga in veckans erbjudanden från text eller foto, med granskning före sparning;
  - FR-35: se och ta bort veckans erbjudanden;
  - FR-36: AI-förslag med veckans erbjudanden;
  - NFR-10: ingen hämtning från butiker, text och bild är data, och samma svarstider som import.
- **Ändrade konsekvenser:** FR-23 får erbjudanden som indata. FR-8 och FR-22 påverkas uttryckligen inte. Texten i `prd.md` är oförändrad, utöver en hänvisning i §8.3.
- **Användarresa:** UJ-7, "Pontus planerar veckan efter reklambladet".
- **Effektmål:** SM-5 (variation) får stöd. Ett nytt motmått, SM-C4: Matkoll jagar inte alla erbjudanden eller exakta priser.
- **Utanför 1.2:** automatisk hämtning varje vecka, länkar som servern hämtar, erbjudanden i inköpslistan, exporten och rangordningen, prisjämförelse och flera butiker på en gång.

### 2.5 Arkitektur

- **Ny AD-25, "Veckans erbjudanden":** modulen `offers` och tabellen `store_offer`, veckan, vilka erbjudanden som gäller, `save_store_offers`, kopplingen till katalogen, `extractOffers` i AI-porten, flödet utan skrivning, förbudet mot hämtning från butiker, hur AI-förslagen använder erbjudandena, vad som inte påverkas, UI-gränsen, felkoderna och revalideringen. Hela texten står i spine:n.
- **Ändrade AD:**
  - AD-9: porten får `extractOffers`, och `suggestDishes` får erbjudanden.
  - AD-15: ett foto av ett blad eller en skärmbild behandlas som ett foto av en plats (2048 px).
  - AD-18: `revalidateFor('store_offer')` → `/recept`, och `store` får också `/recept`.

  Id:n för befintliga AD ändras inte. AD-24 kommer från Epic 8.
- **Modultabellen och källträdet:** `offers` äger `store_offer`.
- **Datamodellen och ER-diagrammet:** `store_offer` med `store` och valfri `ingredient`.
- **Capability Map:** en ny rad för FR-34–FR-36 och NFR-10.
- **Deferred:** automatisk hämtning och länkar kräver ett nytt AD om hämtning från butiker.
- **`.memlog.md`:** beslutet loggat.

### 2.6 UX

- **Recept, filtret "Kan lagas nu":** raden Veckans erbjudanden ovanför "Föreslå rätter med AI", med tre lägen (inga erbjudanden, erbjudanden, ingen butik).
- **Arket Veckans erbjudanden:** veckopiller, flikarna Text och Foto, förlopp med "Avbryt", granskning med "Ta bort" per rad och "Spara N erbjudanden", och de inlagda erbjudandena med "Ta bort", "Ta bort alla" och "Läs in fler".
- **AI-förslagen:** "Med veckans erbjudanden från <butik>." över förslagen och "På erbjudande: …" under titeln.
- **Texter och tillstånd:** veckan som "vecka 45, 4–10 nov", beskedet om länkar, inga erbjudanden, för lång text, kapad lista, veckan är slut, gränsen 100 och borttagning med "Ångra".
- **Flöde 7**, "Veckans meny från reklambladet".
- DESIGN.md: inga nya tokens eller komponenter. Arket använder Ark, veckopillren Filterpiller, och felen Meddelanderuta.

### 2.7 Kod och drift (ingen kod ändras i den här kursändringen)

- **Migration (Story 9.1):** `store_offer` med RLS, grants, RLS-test och `save_store_offers`. Migrationen bara lägger till, så den fungerar med koden före 1.2 (AD-5).
- **Typer:** genereras om. **Designtester:** låser längdgränserna och veckokontrollen mot domänen.
- **ESLint:** en zon som hindrar `offers` från att importera `src/server/fetch`.
- **AI-porten:** `extractOffers`, ett nytt schema, en ny prompt, nya fixturer och en ny utvärdering. `suggestDishes` får `offers`. Ingen ny leverantör och ingen ny miljövariabel.
- **E2E:** fyra nya e2e-användare (avsnitt 5).
- **Drift:** migrationen körs med `supabase db push` före koddriftsättningen, som tidigare (AD-23).

## 3. Rekommenderad väg

**Alternativ 1, direkt justering:** en ny Epic 9 med fyra små stories i ordning. 1.0:s och 1.1:s stories ändras inte.

| Alternativ | Insats | Risk | Bedömning |
| --- | --- | --- | --- |
| 1. Ny Epic 9 | Låg till medel | Låg | Vald |
| 2. Återställning | – | – | Inte gångbar. Inget behöver göras om. |
| 3. MVP-översyn | – | – | Inte gångbar. 1.0 är klar. |

### Val inom alternativ 1

| Fråga | Vald | Andra alternativ och skäl |
| --- | --- | --- |
| Hur erbjudandena kommer in | Inklistrad text och foto (eller skärmbild) | **Länk som servern hämtar:** strider mot att Matkoll aldrig anropar en butik, receptimportens regler gäller receptsajter, erbjudandesidor byggs ofta i webbläsaren och villkoren är inte kontrollerade. Öppen fråga 8. **Automatisk hämtning:** utanför 1.2, öppen fråga 9. |
| Var erbjudandena bor | Ny modul `offers` med `store_offer` | `settings` (butiker är inställningar, erbjudanden ändras varje vecka), `shopping` (listan läser inte erbjudanden i 1.2). |
| Hur länge de sparas | En vecka (måndag–söndag). Veckor som är slut tas bort vid nästa sparande | Ett schemalagt jobb (onödigt för en användare), att spara allt för 1.3 (inget behov ännu). |
| Vilken vecka som gäller | Den senaste inlagda veckan som inte är slut | Alltid den här veckan, vilket blir fel på söndagen när nästa veckas blad är inlagt. Öppen fråga 10. |
| Koppling till katalogen | `matchIngredients` vid träff, annars bara namnet | Att skapa katalogingredienser, vilket fyller katalogen med varor som aldrig lagas. |
| AI-metod och schema | `extractOffers` för text eller bild, `{ label, name, price }` per post, kontrollerad för sig | Att återanvända `analyzeImage` (fel prompt och onödiga fält), att låta AI:n tolka veckan. |
| Hur förslagen väger erbjudandena | Prompten prioriterar, servern räknar och sorterar | Ett hårt krav i schemat (fler ogiltiga svar nära tidsgränsen), att låta erbjudandena påverka rangordningen ur biblioteket. |
| Var ingången finns | Raden i Recept vid AI-förslagen | Inställningar (veckoinnehåll hör inte dit), en egen flik (ingen femte flik i v1). |

**Insats:** låg till medel. Story 9.1 är störst, eftersom den lägger tabellen, porten och arket. 9.2–9.4 är små.
**Risk:** låg. Migrationen bara lägger till en tabell. Den största osäkerheten är hur bra och snabbt den lokala modellen läser ett riktigt blad (T7), och den mäts i 9.1 och 9.3.
**Tidsplan:** Epic 9 byggs efter att Epic 8 är ihopslagen, story för story, i grenen `epic/9-erbjudanden`.

## 4. Ändringar i detalj

Alla ändringar nedan är införda i dokumenten.

### 4.1 PRD

- `addendum.md`: nytt avsnitt **"Version 1.2: Veckans erbjudanden"** med mål, UJ-7, ordlista, FR-34–FR-36, NFR-10, effektmål och motmåttet SM-C4, vad som ligger utanför 1.2 och datamodellen.
- `prd.md` §8: en ny punkt, 8.3, "Efter 1.0", som hänvisar till addendumet. `updated` sätts till 2026-10-26.

**Exempel, FR-23:**

```
FÖRE: Pontus kan be om AI-förslag utifrån lagret.
EFTER (addendum, FR-36): AI-förslagen prioriterar rätter som använder varor på erbjudande i vald butik den här veckan. Utan inlagda erbjudanden är AI-förslagen som i 1.0.
```

Skäl: "AI-förslagen prioriterar varor som är på erbjudande i en vald butik den här veckan" (`docs/backlog-efter-1-0.md`, punkt 2).

### 4.2 Arkitektur (`ARCHITECTURE-SPINE.md`)

- Frontmatter: `scope` omfattar Epic 1–9, och `binds` får FR-29–FR-36, NFR-9 och NFR-10. FR-29–FR-33 och NFR-9 kommer från Epic 8.
- Modultabellen: `offers` äger `store_offer`.
- **AD-25 (ny), Veckans erbjudanden.**
- Tillägg märkta "(1.2, AD-25)" i AD-9, AD-15 och AD-18.
- Källträdet, datamodellen (ER-diagram och kolumntabell), Capability Map och Deferred.
- `.memlog.md`: beslutet loggat.

**Exempel, AD-9:**

```
FÖRE: src/server/ai/ exporterar AiService med parseRecipe, analyzeImage och suggestDishes.
EFTER: Tillägg (1.2, AD-25): porten får en fjärde metod, extractOffers, med samma regler, och suggestDishes får veckans erbjudanden som namn bredvid lagret.
```

### 4.3 UX (`EXPERIENCE.md`)

- Foundation: begreppen "erbjudande" och "veckans erbjudanden".
- IA: raden Veckans erbjudanden och arket Veckans erbjudanden.
- Voice and Tone: texter för erbjudanden och veckor.
- Component Patterns: AI-etiketten får raderna om erbjudanden, och två nya rader (raden och arket).
- State Patterns: elva nya tillstånd.
- Ett nytt flöde, Flöde 7, "Veckans meny från reklambladet".
- Settings: varför erbjudanden inte ligger i Inställningar.

### 4.4 Epics (`epics.md`)

Ny `## Epic 9: Veckans erbjudanden` med:

1. **Story 9.1: Veckans erbjudanden från inklistrad text.** Tabellen, `extractOffers` för text, `/api/ai/offers`, raden, arket med granskning och sparande, och beskedet för en länk.
2. **Story 9.2: AI-förslag prioriterar veckans erbjudanden.** Erbjudandena till `suggestDishes`, sorteringen och raderna "På erbjudande".
3. **Story 9.3: Erbjudanden från foto av reklambladet.** Fliken Foto, `/api/ai/offers/photo` och bilden i porten.
4. **Story 9.4: Se och ta bort veckans erbjudanden.** Listan över inlagda erbjudanden, borttagning med "Ångra" och veckor som är slut.

Requirements Inventory, Additional Requirements, UX Design Requirements, FR Coverage Map och Epic List får FR34–FR36, NFR10, AD-25 och UX-DR19–UX-DR20.

### 4.5 Sprintstatus

`sprint-status.yaml` får:

```yaml
  epic-9: backlog
  9-1-veckans-erbjudanden-från-inklistrad-text: backlog
  9-2-ai-förslag-prioriterar-veckans-erbjudanden: backlog
  9-3-erbjudanden-från-foto-av-reklambladet: backlog
  9-4-se-och-ta-bort-veckans-erbjudanden: backlog
  epic-9-retrospective: optional
```

### 4.6 Epic-kontext och story-specar

- `_bmad-output/implementation-artifacts/epic-9-context.md` har samma form som `epic-8-context.md`.
- Utkast till story-specar (status `draft`), i samma mall som Epic 8:s:
  - `spec-9-1-veckans-erbjudanden-fran-inklistrad-text.md`
  - `spec-9-2-ai-forslag-prioriterar-veckans-erbjudanden.md`
  - `spec-9-3-erbjudanden-fran-foto-av-reklambladet.md`
  - `spec-9-4-se-och-ta-bort-veckans-erbjudanden.md`

### 4.7 Dokument i `docs/`

- `beslutslogg.md`: kursändringens beslut, överst.
- `oppna-fragor.md`: frågorna 8 (länk), 9 (automatisk hämtning) och 10 (vilken vecka som gäller), och den tekniska osäkerheten T7 (modellens läsning och tid).
- `backlog-efter-1-0.md`: punkt 2 är planerad som Epic 9.

### 4.8 Sammanslagning med Epic 8

Grenen utgår från `main`, och Epic 8:s grenar ändrar samma dokument. När Epic 8 är ihopslagen och Epic 9 slås ihop blir det konflikter där båda lägger till på samma ställe. Alla löses genom att behålla båda tilläggen, med 1.1 före 1.2:

- `addendum.md` (avsnitten 1.1 och 1.2), `prd.md` §8.3 (en rubrik med båda punkterna);
- `ARCHITECTURE-SPINE.md` (frontmatter från den här grenen, modultabellen, AD-24 före AD-25, datamodellen, Capability Map, Deferred) och `.memlog.md`;
- `EXPERIENCE.md` (frontmatter, IA, Voice and Tone, Component Patterns, State Patterns, Flöde 6 före Flöde 7, Settings);
- `epics.md` (FR29–FR33 före FR34–FR36, NFR9 före NFR10, UX-DR17–UX-DR18 före UX-DR19–UX-DR20, Epic 8 före Epic 9 i Epic List och sist i dokumentet);
- `sprint-status.yaml` (Epic 8 före Epic 9), `beslutslogg.md` (nyaste överst) och `oppna-fragor.md` (fråga 6–7 före 8–10).

## 5. Överlämning

- **Omfattning:** Moderate. En ny epic och nya planeringsdokument, men ingen ny plan för hela appen.
- **Mottagare:** utvecklingen (`bmad-build`), story för story i ordningen 9.1 → 9.4, utan att fråga mellan storyna, efter att Epic 8 är ihopslagen. Utkasten till story-specar finns redan och slutförs när storyn påbörjas.
- **Gren:** `epic/9-erbjudanden`, med PR till `main`. Alla kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten följer med i epic-grenen. Grenen behöver tas om på `main` (rebase eller merge) efter Epic 8, med konflikterna lösta enligt avsnitt 4.8.
- **E2E-användare (en per spec):** `e2e-erbjudanden@matkoll.test` (9.1), `e2e-erbjudande-forslag@matkoll.test` (9.2), `e2e-erbjudande-foto@matkoll.test` (9.3) och `e2e-erbjudanden-hantera@matkoll.test` (9.4).
- **Klart betyder:**
  - Pontus kan klistra in en erbjudandetext eller välja en bild av ett blad, granska erbjudandena och spara dem för vald butik och vecka.
  - Med erbjudanden för fläskfilé och broccoli står förslaget som använder båda först, med "På erbjudande: fläskfilé, broccoli" (e2e med mock).
  - Utan erbjudanden får modellen exakt samma meddelande som i 1.0 (test).
  - En länk hämtas aldrig, och inget i flödet anropar `fetch` (test).
  - Lagningsstatus, "Kan lagas nu", inköpslistan och exporten är oförändrade.
  - Alla sex kontroller passerar.
- **Pontus:** inga konton eller hemligheter behövs. Efter epicen provar Pontus Flöde 7 med ett riktigt blad och en text från butikens sida, och svarar på öppna frågor 8–10. T7 mäts med egna foton.
