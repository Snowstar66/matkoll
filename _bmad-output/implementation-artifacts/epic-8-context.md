# Epic 8 Context: Flera ställen

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Version 1.1. Pontus kan ha lager på flera ställen, till exempel Hemma och Stugan, och väljer vilket ställe som gäller. Valet styr Hemma, lagningsstatusen, rangordningen, AI-förslagen, inköpslistans avdrag, "Lägg i lagret" och bildanalysen.

Huvudsyftet är Pontus eget: att komma ihåg vad som finns i stugans kyl, frys och skafferi, så att Pontus handlar rätt inför resan dit och varken köper dubbelt (två ketchup) eller saknar något (senap). Det kräver tre saker:

- Inköpslistan räknas mot det ställe Pontus ska till.
- Ett ställes lager går att se på distans.
- "Lägg i lagret" lägger på valt ställe.

Det motsvarar UJ-6 och Flöde 6 i EXPERIENCE.md, och kraven FR-29–FR-33 och NFR-9 i PRD-addendumet ("Version 1.1: Flera ställen").

Epicen bygger på det som redan finns:

- `pantry` med `pantry_item`, `pantry_lock()`, regeln "obegränsad eller mängder" per plats, `getPantrySnapshot`, `addToPantry` med kvitton i `pantry_addition`, och "Ångra" via `pantry_removal` (Epic 2, 3.7, 6.3, 6.4);
- bildanalysen och inventeringen (6.1–6.4);
- inköpslistan med `computeList` och listnycklarna (3.3–3.7);
- mönstret för "flera, en vald" i `store`, med `is_selected` och `select_store` (7.1).

Epicen har en ny tabell, `pantry_site`, som ägs av `pantry`, och en ny kolumn, `pantry_item.site_id`. Arkitekturen står i AD-24. Kursändringen står i `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-flera-stallen.md`.

## Stories

- Story 8.1: Ställen i lagret med Hemma som första ställe
- Story 8.2: Välja och hantera ställen i Hemma
- Story 8.3: Lagningsstatus, förslag och Lägg i lagret följer valt ställe
- Story 8.4: Foto, inventering och tömning per ställe
- Story 8.5: Inköpslista inför resan till ett annat ställe

## Bindande beslut: ett valt ställe som styr allt

Pontus beskrev det så här 2026-10-26: "Pontus väljer vilket ställe som gäller: det styr Hemma, lagningsstatusen, avdraget på inköpslistan och Lägg i lagret". Därför gäller i hela epicen:

- **Ett valt ställe per användare (`pantry_site.is_selected`),** sparat på servern och gemensamt för alla enheter. Det är samma mönster som vald butik: ett partiellt unikt index och en Postgres-funktion som byter (`select_pantry_site`). Matkoll byter aldrig ställe på egen hand och använder aldrig position.
- **Lagret summeras aldrig över ställen.** Snapshoten, platskorten och listan gäller ett ställe. Ett recept jämförs aldrig mot två ställen på en gång.
- **Pontus tittar på distans genom att välja stället** i Hemma, och väljer tillbaka efteråt. Valet gäller hela appen under tiden, och raden "Lager: Stugan" syns i listan, matsedeln, receptvyn och biblioteket (med "Kan lagas nu") när det finns fler än ett ställe. Att titta utan att byta (`?stalle=`) och ett eget ställe för listan ingår inte. Båda är öppna frågor till Pontus efter användning (`docs/oppna-fragor.md`, 6 och 7), och AD-24 tillåter dem senare utan ombyggnad.
- **Byte från listan är samma val** ("Byt" på raden "Lager: Hemma" i Inköpslistan). Det finns inget andra begrepp.
- **En skrivning hamnar på det ställe som vyn visade** (FR-33), inte på det som råkar vara valt när anropet kommer fram. Klienten skickar ställets id.
- **Stället ingår aldrig i listnycklar, bockar, överstyrningar, egna varor, produktval eller exporten.** Ett byte räknar om listan, och allt överlägg står kvar.

## Requirements & Constraints

- **Ställen (FR-29):**
  - Det första stället heter "Hemma", är valt och har allt befintligt lager.
  - Ett namn har 1–40 tecken och är unikt per användare, utan hänsyn till stora och små bokstäver. Normaliseringen görs i `pantry/domain/site.ts`.
  - Högst 10 ställen per användare.
  - Ett ställe kan byta namn. Det kan tas bort bara om det är tomt och inte valt. Det sista stället kan aldrig tas bort.
  - Varje ställe har Kyl, Frys och Skafferi (AD-12 är oförändrad).
- **Välja ställe (FR-30, FR-31):** ett tryck på ett filterpiller i Hemma väljer stället, sparar valet och visar ställets platser. Vald plats (`?plats=`) behålls.
- **Inköpslistan (FR-32):**
  - Listan drar av lagret för valt ställe.
  - När det finns fler än ett ställe visar den "Lager: <namn>" och "Byt".
  - Bockar, rättade mängder, dolda poster och egna varor står kvar vid byte.
  - "Lägg i lagret" lägger på listans ställe.
  - Exporten och dess format är oförändrade.
- **Skrivningar (FR-33):** arket Lagervara, borttagning med "Ångra", bekräftade lagerförslag, inventering, "Töm kylen" med "Ångra" och "Lägg i lagret" skickar ställets id från vyn. "Ångra" sätter tillbaka på radens eget ställe. Ett ställe som har tagits bort ger `pantry_site_gone` och ingen skrivning.
- **Migrering och svarstider (NFR-9):**
  - Migreringen bara lägger till, fungerar med 1.0-koden under driftsättningen (AD-5) och visas i ett integrationstest lämna lagret oförändrat: samma id, mängder och antal.
  - Byte av ställe svarar inom en sekund (NFR-7).
- **Ingen ny miljövariabel, ingen ny AI-funktion och ingen ändring av AI-porten.** `analyzeImage` får platsen som förut (AD-9, AD-14).
- **Plattform:**
  - Allt fungerar från 375 px och på dator, i ljust och mörkt läge och med 200 % textförstoring utan vågrät scroll. Ställesväljaren radbryts och scrollar aldrig i sidled.
  - Allt är på svenska, och tryckytorna är minst 44 × 44 px.
  - Inget rött.

## Technical Decisions

- **Moduler (AD-1, AD-24):**
  - `pantry` äger `pantry_site`, och ingen annan modul läser eller skriver tabellen.
  - `pantry/server.ts` exporterar `getSelectedSite()`, `listPantrySites()`, `getPantrySnapshot(siteId?)`, `listPantry(location, siteId?)` och `countPantryItems(siteId?)`, memoiserade per förfrågan med React `cache`. Utan `siteId` gäller valt ställe.
  - `pantry/actions` har `selectPantrySite`, `savePantrySite` och `deletePantrySite`.
  - `recipes`, `mealplan`, `suggestions` och `shopping` anropar `getPantrySnapshot()` utan argument och `getSelectedSite()` för raden "Lager".
  - Ställesväljaren, arket Ställen och arket Byt ställe ligger i `pantry/ui` och renderas av `/hemma` och `/lista`. `shopping/ui` importerar dem inte.
- **Datamodell (AD-4, AD-5, AD-19, AD-20, AD-24):**
  - `pantry_site`: `id`, `user_id`, `name`, `normalized_name`, `is_selected` och `created_at`.
    - Den är unik på `(id, user_id)` och på `(user_id, normalized_name)`.
    - Ett partiellt unikt index, `(user_id) where is_selected`, ger högst ett valt ställe.
    - En `check` begränsar namnet till 1–40 tecken.
    - RLS med `user_id = (select auth.uid())`, `revoke all` och sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`. Ett RLS-test.
  - `pantry_item.site_id uuid not null` refererar `pantry_site (id, user_id)` via `(site_id, user_id)` med `on delete restrict`.
    - Den unika nyckeln blir `(user_id, site_id, ingredient_id, location, unit) nulls not distinct`.
    - Indexet `(user_id, site_id, location)` ersätter `(user_id, location)`.
  - Raderna som sparas i `pantry_removal.removed_rows` har `site_id`. `pantry_addition` ändras inte.
  - Migrationer skapas med `supabase migration new`. Typerna genereras om med `supabase gen types --local --schema public > src/lib/supabase/database.types.ts`. Kör aldrig `supabase db reset`.
- **Migrering (Story 8.1), en migration i en transaktion:**
  1. Skapa `pantry_site`.
  2. Lägg in "Hemma" som valt ställe för varje rad i `auth.users`.
  3. Lägg till `site_id`, fyll den, sätt `not null` och lägg till den sammansatta nyckeln.
  4. Byt den unika nyckeln och indexet.
  5. Lägg `site_id` på raderna i `pantry_removal.removed_rows`.
  6. Ersätt `set_pantry_items`, `add_to_pantry`, `restore_pantry_item`, `pantry_place_has_item`, `empty_pantry_place`, `restore_pantry_removal` och `apply_pantry_inventory` med versioner som har parametern `site uuid default null` sist, där `null` betyder valt ställe. En funktion med en ny parameter måste tas bort och skapas igen (`drop function` och sedan `create function`, med samma grants). PostgREST matchar anropen på parameternamn, så 1.0-kodens anrop fungerar.

  Pantry-läsningarna i 1.0-koden läser alla rader via PostgREST, vilket är detsamma som "Hemma" så länge det är det enda stället.
- **Valt ställe och skrivningar:**
  - `select_pantry_site`, `save_pantry_site` och `delete_pantry_site` är `security invoker`, tar `pantry_lock()` och låser användarens ställen.
  - Hjälpfunktionen `pantry_selected_site()` ger valt ställe och skapar "Hemma" som valt när användaren saknar ställen. Bara skrivfunktionerna anropar den.
  - `pantry_lock()` gäller fortfarande per användare, över alla ställen.
- **Startdata (AD-21):** `ensure_pantry_defaults()` (`security invoker`, idempotent) skapar "Hemma" som valt. `auth/confirm` anropar den efter `ensure_user_defaults()`, och testernas setup anropar båda.
- **Listan (AD-8):**
  - `computeList` får snapshoten för valt ställe och ändras inte.
  - `getShoppingList` lämnar `site` (`{ id, name, siteCount }`) bredvid listan, som `store`.
  - `putCheckedInPantry(siteId)` skickar listans ställe till `addToPantry`, och kvittona (nycklar) är oförändrade.
  - Bockar för poster som blir täckta efter ett byte stannar kvar, och 3.7:s städning av kvitton gäller som förut.
- **Bildanalysen (AD-9, AD-15):**
  - `/api/ai/analyze` tar emot `site` och `location` och läser platsen på det stället (`listPantry(location, siteId)`).
  - Förslagen bär med sig ställets id i klienten, och bekräftelser och inventering skickar det.
  - AI-porten och prompten är oförändrade.
- **Resultat och fel (AD-13):** nya felkoder i `src/lib/errors.ts` med svensk text:

  | Felkod | Text |
  | --- | --- |
  | `pantry_site_gone` | "Stället finns inte längre. Välj ett annat ställe." |
  | `pantry_site_name_taken` | "Det finns redan ett ställe som heter {namn}." |
  | `pantry_site_limit` | "Du kan ha högst 10 ställen." |
  | `pantry_site_failed` | "Det gick inte att spara stället. Försök igen." |

  Loggarna innehåller bara felkoder, aldrig ställenas namn.
- **Rendering (AD-18):** `revalidateFor('pantry_site')` → `/hemma`, `/recept` (layout), `/matsedel` (layout) och `/lista`. Allt läses inuti `<Suspense>`.
- **Tester:**
  - Vitest bredvid koden: domänen (`site.ts`), actions och klientkomponenter.
  - Integrationstester mot lokal Supabase i `tests/integration/`:
    - RLS för `pantry_site`;
    - migreringen före och efter;
    - samma ingrediens på två ställen i alla pantry-funktioner;
    - 1.0:s anrop utan `site`;
    - gränsen på 10 ställen och regler för borttagning.
  - Designtester i `tests/design/` låser namnets längd och gränsen på 10 ställen mot domänen.
  - E2E-användare, en per spec, i `e2eEmails` i `tests/e2e/support.ts` och `global-setup.ts`:
    - `e2e-stallen@matkoll.test` (8.2);
    - `e2e-stalle-status@matkoll.test` (8.3);
    - `e2e-stalle-foto@matkoll.test` (8.4);
    - `e2e-stalle-lista@matkoll.test` (8.5, med ketchup och senap).

## UX & Interaction Patterns

- **Hemma (EXPERIENCE.md, Ställesväljare):**
  - Med ett ställe finns ingen väljare, bara textknappen "Lägg till ställe" längst ned, under "Töm kylen".
  - Med två eller fler finns en rad med filterpiller med ställenas namn i den ordning de skapades, ovanför platskorten, och sist textknappen "Ställen". Valt ställe är fyllt.
  - Valet är optimistiskt, och live-regionen säger "Valt ställe: Stugan.".
  - Sidrubriken är "Hemma" som förut.
- **Arket Ställen:**
  - En rad per ställe med namn, antal varor och "Valt".
  - Ett tryck på namnet ger ett fält för nytt namn.
  - "Ta bort" finns bara för ett tomt ställe som inte är valt. Det tas bort utan fråga och utan "Ångra", eftersom inget går förlorat, och bekräftelsen säger "Tog bort Stugan.".
  - Fältet "Nytt ställe" (platshållare "Till exempel Stugan") och knappen "Lägg till". Ett nytt ställe väljs inte automatiskt, och bekräftelsen säger "Lade till Stugan. Välj det för att se och fylla dess lager.".
- **Raden "Lager" (1.1):** "Lager: Stugan" i `{typography.meta}`, bara när det finns fler än ett ställe.
  - Den står under sidrubriken i Inköpslistan (med "Byt"), i Matsedel och i Recept med filtret "Kan lagas nu", och under "X av Y hemma" i receptvyn.
  - "Byt" öppnar arket "Räkna listan mot". Ett val där stänger arket och visar "Listan räknas nu mot Stugan.".
- **Texter (Voice and Tone):** med ett ställe är allt som i 1.0. Med fler används mönstren "Lager: Stugan" och "… för Stugan.":
  - "Lagt 8 varor i lagret för Stugan."
  - "Ta bort alla 14 varor i kylen för Stugan?"
  - "Tog bort 14 varor ur kylen för Stugan."
  - "Allt finns i lagret för Stugan."
  - "Förslagen gäller Stugan." (när stället byts medan lagerförslagen visas)

  Matkoll skriver aldrig att Pontus *är* på ett ställe.
- **Allmänt:**
  - Fel visas i en blå `Notice`, aldrig i rött, och med en åtgärd när det finns en.
  - Ark staplas aldrig. Formulär använder `useActionState`, och inmatningsfälten har minst 16 px text.
  - Synlig fokusram och logisk tabbordning.

## Cross-Story Dependencies

- **Före epicen:** 1.0 (Epic 1–7) är klar och ihopslagen i `main`. Det som epicen bygger på:
  - `pantry_lock`, `pantry_removal`, `restore_pantry_removal` och `apply_pantry_inventory` (6.3, 6.4);
  - `addToPantry` och kvittona (3.7);
  - `select_store` som mönster (7.1);
  - `revalidateFor` (AD-18).
- **8.1 före allt annat:** datamodellen, migreringen och parametern `site`. Inget syns för Pontus.
- **8.2 före 8.3–8.5:** utan ett andra ställe går det inte att visa eller testa avgränsningen.
- **8.3 före 8.5:** `getShoppingList` lämnar `site` och "Lägg i lagret" tar emot ställets id i 8.3. 8.5 lägger till raden "Lager", "Byt" och texterna i listan.
- **8.4** kan byggas efter 8.2, oberoende av 8.3 och 8.5. Den ligger före 8.5 i ordningen.
- **Gren:** `epic/8-flera-stallen`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten för 1.1 följer med i grenen.
- **Efter epicen:** Pontus provar Flöde 6 inför nästa resa till stugan och svarar på öppna frågor 6 och 7.
