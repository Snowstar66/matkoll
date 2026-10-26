---
title: 'Kursändring: version 1.1 "Flera ställen"'
date: 2026-10-26
status: godkänd (headless enligt docs/autonomi.md)
trigger: docs/backlog-efter-1-0.md, punkt 1, och beslutet "Ordning för tilläggen efter 1.0" (2026-10-26)
scope: Moderate
branch: epic/8-flera-stallen
---

# Kursändring: version 1.1 "Flera ställen"

Läge: batch och headless. Pontus har beslutat att 1.1 ska byggas, och i vilken ordning tilläggen efter 1.0 kommer. Alla val i det här förslaget går att ändra senare, så enligt grundregeln i `docs/autonomi.md` fattas de utan att fråga. Valen står i `docs/beslutslogg.md` och frågorna i `docs/oppna-fragor.md`.

## 1. Sammanfattning av ändringen

### Vad som utlöste ändringen

Version 1.0 (Epic 1–7, med Story 6.3 och 6.4) är klar och ihopslagen i `main` (PR #45). Pontus beslutade 2026-10-26 att det första tillägget efter 1.0 är **flera ställen**. Lagret delas upp på ställen, till exempel hemmet och vinterstugan, och varje ställe har sin egen kyl, frys och sitt eget skafferi.

**Huvudsyftet med Pontus egna ord:** att komma ihåg vad som finns i stugans kyl, frys och skafferi, så att Pontus handlar rätt inför resan dit och varken köper dubbelt (två ketchup) eller saknar något (senap). Det betyder:

- Inköpslistan ska kunna räknas mot det ställe Pontus ska till, inte mot hemmet.
- Det ska gå att se ett ställes lager utan att vara på plats.
- "Lägg i lagret" lägger varorna på det valda stället.
- Pontus väljer vilket ställe som gäller. Valet styr Hemma, lagningsstatusen, avdraget på inköpslistan och "Lägg i lagret".

### Typ av ändring

Ett nytt krav från Pontus efter 1.0. Det är inget fel i det som är byggt och ingen ändring av målen. 1.0:s krav gäller fortfarande, men alla krav som läser lagret avgränsas till ett ställe.

### Underlag

- Lagret i 1.0 har en enda nivå under användaren: `pantry_item(user_id, ingredient_id, location, amount, unit)`, unik på `(user_id, ingredient_id, location, unit)`. `location` är Kyl, Frys eller Skafferi (AD-12, AD-19).
- `getPantrySnapshot()` summerar hela lagret över platserna (AD-19). Snapshoten används av lagningsstatusen i receptbiblioteket, receptvyn och matsedeln (AD-7), av rangordningen och AI-förslagen (Epic 5), av inköpslistan (`computeList`, AD-8) och av "Lägg i lagret" (3.7).
- Bildanalysen (6.1–6.4), "Töm en plats" (6.3) och inventeringen (6.4) arbetar mot en plats via Postgres-funktionerna `set_pantry_items`, `add_to_pantry`, `restore_pantry_item`, `pantry_place_has_item`, `empty_pantry_place`, `restore_pantry_removal` och `apply_pantry_inventory`. Alla tar `pantry_lock()` och tillämpar regeln att en ingrediens på en plats antingen är obegränsad eller har mängder.
- Alla skrivningar till `pantry_item` går via dessa funktioner. Läsningarna går via PostgREST i `pantry/data/queries.ts` (`listPantryIn`, `countPantryIn`, `loadPantrySnapshot`) och `remove.ts`.
- `settings` har redan ett mönster för "flera, en vald": `store.is_selected` med ett partiellt unikt index och Postgres-funktionen `select_store` (Story 7.1).

## 2. Konsekvensanalys

### 2.1 Checklista

| # | Punkt | Status | Not |
| --- | --- | --- | --- |
| 1.1 | Utlösande story | [N/A] | Inget fel i en story. Utlöses av Pontus beslut om 1.1. |
| 1.2 | Problemformulering | [x] | Nytt krav: lagret delas på ställen, och inköpslistan räknas mot det ställe Pontus ska till. |
| 1.3 | Underlag | [x] | `docs/backlog-efter-1-0.md`, beslutsloggen, koden i `pantry` och `shopping` (avsnitt 1). |
| 2.1 | Pågående epic | [N/A] | Epic 1–7 är klara. Inget pågår. |
| 2.2 | Ändringar på epic-nivå | [x] | Ny Epic 8: Flera ställen, med 5 stories. |
| 2.3 | Kommande epics | [x] | 1.2 (erbjudanden) läser lagret via AI-förslagen och får det valda stället automatiskt. 1.3 (butiksjämförelse) berörs inte. |
| 2.4 | Ogiltiga eller nya epics | [x] | Inga epics blir ogiltiga. En ny epic. |
| 2.5 | Ordning | [x] | Epic 8 före 1.2 och 1.3, enligt Pontus beslut. |
| 3.1 | PRD | [!] | Nya krav FR-29–FR-33 och NFR-9 i addendumet. Ordlistan får "Ställe" och "Valt ställe". FR-8, FR-12, FR-13, FR-15, FR-19, FR-20, FR-22–FR-25 avgränsas till valt ställe. 1.0:s MVP påverkas inte. |
| 3.2 | Arkitektur | [!] | Ny AD-24. AD-19 ändras (unik nyckel och snapshot per ställe), liksom AD-7, AD-8, AD-18 och AD-21. Modultabellen, datamodellen och Capability Map uppdateras. |
| 3.3 | UX | [!] | Ställesväljare i Hemma, hantera ställen (ark), raden "Lager: Stugan" i listan, biblioteket, receptvyn och matsedeln när det finns fler än ett ställe, och nya texter. |
| 3.4 | Andra artefakter | [!] | Ny migration, typer, RLS-test för `pantry_site`, designtester, e2e-användare, `revalidateFor`. Ingen ny miljövariabel och ingen ändring av CI. `docs/varukorgsexport.md` påverkas inte. |
| 4.1 | Direkt justering | Gångbar | Ny epic inom den befintliga strukturen. Medel insats, låg till medel risk. |
| 4.2 | Återställning | Inte gångbar | Inget behöver göras om. Det som finns byggs ut. |
| 4.3 | MVP-översyn | Inte gångbar | 1.0 är klar. 1.1 lägger till, utan att minska något. |
| 4.4 | Vald väg | [x] | Alternativ 1: direkt justering med en ny Epic 8. |
| 5.1–5.5 | Förslagets delar | [x] | Avsnitt 1, 2, 3, 4 och 5 nedan. |
| 6.1–6.2 | Granskning | [x] | Förslaget stämmer med de uppdaterade dokumenten. |
| 6.3 | Godkännande | [x] | Headless: godkänt enligt grundregeln i `docs/autonomi.md`, eftersom allt går att ändra. Pontus beslutade själva tillägget. |
| 6.4 | `sprint-status.yaml` | [x] | `epic-8: backlog`, fem stories och `epic-8-retrospective: optional`. |
| 6.5 | Överlämning | [x] | Avsnitt 5. |

### 2.2 Epics

- **Epic 1–7:** inga ändringar i det som är byggt, utom att lagret avgränsas till ett ställe. Ändringarna görs i Epic 8:s stories, inte som omarbetning av gamla stories.
- **Epic 8 (ny):** Flera ställen, med fem stories i ordning (avsnitt 4.4).
- **1.2 (erbjudanden):** AI-förslagen (Epic 5) läser snapshoten för valt ställe. Det behövs inget mer.
- **1.3 (butiksjämförelse):** berörs inte. Stället påverkar vilka poster listan har, men inte butiken eller produktvalen.

### 2.3 Påverkan på stories som redan är byggda

Följande beteenden ändras av Epic 8. Story-filerna för 1.0 skrivs inte om. Epic 8:s stories pekar på dem.

| Byggt i | Beteende i 1.0 | I 1.1 |
| --- | --- | --- |
| 2.1, 2.2, 2.3 | Hemma visar platserna för hela lagret | Hemma visar platserna för valt ställe. Arket Lagervara sparar på det ställe Hemma visar. |
| 2.4, 4.1, 5.1, 5.2, 3.1 | Lagningsstatus, "X av Y hemma", rangordning och AI-förslag räknas mot hela lagret | Räknas mot valt ställe |
| 3.3 | Inköpslistan drar av hela lagret | Drar av lagret för valt ställe |
| 3.7 | "Lägg i lagret" lägger på katalogingrediensens plats | Lägger på katalogingrediensens plats på det ställe listan räknades mot |
| 6.1–6.4 | Foto, bekräftelse, tömning och inventering gäller en plats | Gäller en plats på ett ställe. "Ångra" sätter tillbaka på samma ställe. |
| 7.3 | Exporten | Oförändrad. Posterna är de som listan har efter avdraget. |

### 2.4 PRD

- **Ordlistan (§3):** nya begrepp: **Ställe** (där Pontus har ett lager, till exempel Hemma eller Stugan, med platserna Kyl, Frys och Skafferi) och **Valt ställe** (det ställe som gäller just nu). "Lager" betyder lagret för ett ställe.
- **Nya krav** (addendumet, avsnittet "Version 1.1: Flera ställen"):
  - FR-29: hantera ställen;
  - FR-30: välja ställe;
  - FR-31: se ett ställes lager på distans;
  - FR-32: inköpslistan räknas mot valt ställe, och stället syns och kan bytas från listan;
  - FR-33: skrivningar hamnar på det ställe som vyn visade;
  - NFR-9: migrering utan dataförlust, och snabbt byte av ställe.
- **Ändrade konsekvenser:** FR-8, FR-12, FR-13, FR-15, FR-19, FR-20, FR-22, FR-23, FR-24 och FR-25 gäller valt ställe (tabell i addendumet). Texten i `prd.md` är oförändrad, utöver en hänvisning i §8.
- **Effektmål:** SM-1 (mindre matsvinn, inga dubbelköp) blir mer träffsäkert. Inget nytt effektmål. Ett nytt motmått (SM-C3): Matkoll gissar aldrig var Pontus är.
- **Utanför 1.1:** att flytta eller kopiera varor mellan ställen, att välja ställe automatiskt med plats (GPS), att summera lager över ställen, en matsedel per ställe och ställen som delas med andra.

### 2.5 Arkitektur

- **Ny AD-24, "Ställen i lagret":** datamodellen (`pantry_site` som ägs av `pantry`, `pantry_item.site_id`, `is_selected`), avgränsningen av snapshoten, hur andra moduler väljer ställe, migreringen till "Hemma" och modulgränserna. Hela texten står i spine:n.
- **Ändrade AD:**
  - AD-19: den unika nyckeln får `site_id`, och snapshoten gäller ett ställe.
  - AD-7: `coverage` jämför mot snapshoten för ett ställe.
  - AD-8: `computeList` får snapshoten för valt ställe. Stället ingår aldrig i listnycklarna.
  - AD-18: `revalidateFor('pantry_site')`.
  - AD-21: startdata för `pantry` skapas av `ensure_pantry_defaults()`, som ägs av `pantry`.

  Id:n för befintliga AD ändras inte.
- **Modultabellen:** `pantry` äger `pantry_item`, `pantry_site`, `pantry_addition` och `pantry_removal`. Tabellen hade tidigare bara `pantry_item`, så den kompletteras.
- **Datamodellen och ER-diagrammet:** `pantry_site` läggs till, och `pantry_item` får `site_id`.

### 2.6 UX

- **Hemma:** en ställesväljare ovanför platskorten. Med ett ställe är det bara textknappen "Lägg till ställe". Med två eller fler är det filterpiller med ställenas namn och knappen "Ställen" för arket "Ställen" (lägg till, byt namn, ta bort ett tomt ställe).
- **Inköpslistan:** raden "Lager: Stugan" med textknappen "Byt" under rubriken när det finns fler än ett ställe. Det tomma läget blir "Allt finns i Stugan.".
- **Receptbiblioteket (med filtret "Kan lagas nu"), receptvyn och matsedeln:** samma rad, "Lager: Stugan", som metadata, utan knapp, när det finns fler än ett ställe.
- **Texter:** ställets namn nämns bara när det finns fler än ett ställe. Exempel: "Lagt 8 varor i lagret för Stugan.", "Ta bort alla 14 varor i kylen för Stugan?".
- DESIGN.md: inga nya tokens eller komponenter. Ställesväljaren använder Filterpiller, och arket använder Ark.

### 2.7 Kod och drift (ingen kod ändras i den här kursändringen)

- **Migration (Story 8.1):** `pantry_site` med RLS, grants och RLS-test. "Hemma" läggs in som valt ställe för varje användare. `pantry_item.site_id` fylls i och blir `not null`. Den unika nyckeln och indexet byts. Raderna i `pantry_removal` får `site_id`. Pantry-funktionerna får parametern `site` (sist, med `default null`, där `null` betyder valt ställe), så att 1.0-koden fungerar mot det nya schemat (AD-5).
- **Typer:** genereras om. **Designtester:** låser gränserna (antal ställen och namnets längd) mot domänen.
- **`revalidateFor`:** `pantry_site` → `/hemma`, `/recept` (layout), `/matsedel` (layout), `/lista`.
- **Ingen ny miljövariabel, ingen ny AI-funktion och ingen ändring av AI-porten.** `analyzeImage` får platsen som förut.
- **E2E:** nya e2e-användare per spec (avsnitt 5).
- **Drift:** migrationen körs med `supabase db push` före koddriftsättningen, som tidigare (AD-23).

## 3. Rekommenderad väg

**Alternativ 1, direkt justering:** en ny Epic 8 med fem små stories i ordning. 1.0:s stories ändras inte.

| Alternativ | Insats | Risk | Bedömning |
| --- | --- | --- | --- |
| 1. Ny Epic 8 | Medel | Låg till medel | Vald |
| 2. Återställning | – | – | Inte gångbar. Inget behöver göras om. |
| 3. MVP-översyn | – | – | Inte gångbar. 1.0 är klar. |

### Modellval inom alternativ 1

| Modell | Beskrivning | Bedömning |
| --- | --- | --- |
| **A. Ett valt ställe som styr allt** | Ett ställe per användare är valt och sparas på servern (`pantry_site.is_selected`). Hemma, lagningsstatusen, rangordningen, AI-förslagen, inköpslistans avdrag och "Lägg i lagret" följer det. Pontus byter i Hemma eller från listan. | **Vald.** Det är det Pontus beskrev ("Pontus väljer vilket ställe som gäller: det styr Hemma, lagningsstatusen, avdraget på inköpslistan och Lägg i lagret"). Det är ett begrepp och en inställning, och samma mönster som vald butik. |
| B. Valt ställe och ett eget ställe för listan | Listan (eller matsedeln) har ett eget ställe, skilt från det som lagningsstatusen räknar mot | Mer flexibelt, men två begrepp som kan säga emot varandra. Kräver att `mealplan` eller `shopping` lagrar ett ställe. Kan läggas till senare utan att ändra AD-24. |
| C. Hemma visar ett ställe via adressen, utan att byta valt ställe | `?stalle=` i Hemma för att titta på distans | Två begrepp i samma vy ("visas" och "gäller"). Öppen fråga till Pontus efter användning. |
| D. Ställe som en fjärde nivå i `location` ("Stugan/Kyl") | Inget nytt bord | Bryter AD-12 (fasta platser) och designtester, och gör det omöjligt att namnge ställen fritt. |

**Insats:** medel, ungefär som Epic 6. Migreringen och de sju Postgres-funktionerna är den största delen (8.1).
**Risk:** låg till medel. Migreringen rör befintliga rader, men den lägger bara till en kolumn och fyller den. Inget tas bort. Den körs mot lokal Supabase och i CI innan den går till molnet.
**Tidsplan:** Epic 8 byggs direkt, story för story, i grenen `epic/8-flera-stallen`.

## 4. Ändringar i detalj

Alla ändringar nedan är införda i dokumenten.

### 4.1 PRD

- `addendum.md`: nytt avsnitt **"Version 1.1: Flera ställen"** med mål, ordlista, FR-29–FR-33, NFR-9, ändrade konsekvenser för befintliga krav, motmåttet SM-C3, vad som ligger utanför 1.1 och datamodellen.
- `prd.md` §8: en ny punkt, 8.3, "Version 1.1", som hänvisar till addendumet. `updated` sätts till 2026-10-26.

**Exempel, FR-19:**

```
FÖRE: Varje avbockad listpost blir en lagervara (eller ökar en befintlig med samma enhet) på katalogingrediensens plats.
EFTER (addendum, ändrade konsekvenser): … på katalogingrediensens plats på det ställe som listan räknades mot (FR-32, FR-33).
```

Skäl: "Lägg i lagret lägger varorna på det valda stället" (Pontus, 2026-10-26).

### 4.2 Arkitektur (`ARCHITECTURE-SPINE.md`)

- Frontmatter: `scope` omfattar Epic 1–8, och `binds` får FR-29–FR-33 och NFR-9.
- Modultabellen: `pantry` äger `pantry_item`, `pantry_site`, `pantry_addition` och `pantry_removal`.
- **AD-24 (ny), Ställen i lagret.**
- Tillägg märkta "(1.1, AD-24)" i AD-7, AD-8, AD-18, AD-19 och AD-21.
- Datamodellen: `pantry_site` i ER-diagrammet och kolumntabellen, och `site_id` på `pantry_item`.
- Capability Map: en ny rad för FR-29–FR-33.
- `.memlog.md`: beslutet loggat med `memlog.py append`.

**Exempel, AD-19, läsning:**

```
FÖRE: Läsning sker med getPantrySnapshot(): Map<…>, summerad över platser …
EFTER: Tillägg (1.1, AD-24): getPantrySnapshot(siteId?) gäller ett ställe (valt ställe om inget anges), summerat över ställets platser. Lagret summeras aldrig över ställen.
```

### 4.3 UX (`EXPERIENCE.md`)

- IA: nya ytor, nämligen Ställesväljaren i Hemma, arket Ställen, arket Byt ställe från listan och raden "Lager: <namn>".
- Component Patterns: Ställesväljare och raden "Lager".
- State Patterns: ett ställe, flera ställen, bytt ställe, tomt ställe, ett ställe som inte kan tas bort, och listan efter byte.
- Ett nytt flöde, Flöde 6, "Handla inför resan till stugan".
- Voice and Tone: texter för ställen.

### 4.4 Epics (`epics.md`)

Ny `## Epic 8: Flera ställen` med:

1. **Story 8.1: Ställen i lagret med Hemma som första ställe.** Datamodellen, migreringen och valt ställe. Avgränsningen syns inte.
2. **Story 8.2: Välja och hantera ställen i Hemma.** Ställesväljaren och arket Ställen. Lägga till, byta namn, ta bort ett tomt ställe och välja ställe.
3. **Story 8.3: Lagningsstatus, förslag och Lägg i lagret följer valt ställe.** Det valda stället syns, och skrivningarna går till rätt ställe.
4. **Story 8.4: Foto, inventering och tömning per ställe.**
5. **Story 8.5: Inköpslista inför resan till ett annat ställe.**

Requirements Inventory, FR Coverage Map och Epic List får FR29–FR33 och NFR9.

### 4.5 Sprintstatus

`sprint-status.yaml` får:

```yaml
  epic-8: backlog
  8-1-ställen-i-lagret-med-hemma-som-första-ställe: backlog
  8-2-välja-och-hantera-ställen-i-hemma: backlog
  8-3-lagningsstatus-förslag-och-lägg-i-lagret-följer-valt-ställe: backlog
  8-4-foto-inventering-och-tömning-per-ställe: backlog
  8-5-inköpslista-inför-resan-till-ett-annat-ställe: backlog
  epic-8-retrospective: optional
```

### 4.6 Epic-kontext

`_bmad-output/implementation-artifacts/epic-8-context.md` har samma form som `epic-7-context.md`.

## 5. Överlämning

- **Omfattning:** Moderate. En ny epic och nya planeringsdokument, men ingen ny plan för hela appen.
- **Mottagare:** utvecklingen (`bmad-build`), story för story i ordningen 8.1 → 8.5, utan att fråga mellan storyna. En story-spec skrivs när storyn påbörjas.
- **Gren:** `epic/8-flera-stallen`, med PR till `main`. Alla kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten följer med i epic-grenen.
- **E2E-användare (en per spec):** `e2e-stallen@matkoll.test` (8.2), `e2e-stalle-status@matkoll.test` (8.3), `e2e-stalle-foto@matkoll.test` (8.4) och `e2e-stalle-lista@matkoll.test` (8.5).
- **Klart betyder:**
  - Befintligt lager ligger i "Hemma" utan förlust (radantal och mängder är oförändrade före och efter migreringen, i ett integrationstest).
  - Pontus kan lägga till "Stugan", välja den och se dess lager.
  - Med Stugan vald räknas inköpslistan mot stugans lager. Ketchup som bara finns hemma hamnar på listan, och senap som finns i stugan gör det inte (e2e).
  - "Lägg i lagret", foto, inventering och tömning hamnar på rätt ställe.
  - Alla sex kontroller passerar.
- **Pontus:** inga konton eller hemligheter behövs. Två frågor till efter användning står i `docs/oppna-fragor.md` (6 och 7).
