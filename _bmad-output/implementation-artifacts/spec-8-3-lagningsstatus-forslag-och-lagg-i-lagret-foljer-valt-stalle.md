---
title: 'Story 8.3: Lagningsstatus, förslag och Lägg i lagret följer valt ställe'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'e540216bf3225de75595212c9d90754111568816'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-stallen-i-lagret-med-hemma-som-forsta-stalle.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-7-lagg-i-lagret-efter-handlingen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-kan-lagas-nu-rangordnat.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 8.1 räknar lagningsstatusen, "X av Y hemma", rangordningen och AI-förslagen redan mot valt ställe, eftersom `getPantrySnapshot()` utan argument gäller det. Men det syns inte vilket lager som gäller, så Pontus kan tro att ketchupen saknas hemma när det är Stugan som är vald. "Lägg i lagret" räknar dessutom om listan och lägger varorna på det ställe som är valt när anropet kommer fram, inte på det ställe som listan räknades mot (FR-19, FR-32, FR-33).

**Approach:**
- `recipes` och `mealplan` läser `getSelectedSite()` bredvid snapshoten, i samma förfrågan.
- När det finns fler än ett ställe visas raden "Lager: Stugan" (`{typography.meta}`) i receptbiblioteket med filtret "Kan lagas nu", i receptvyn under "X av Y hemma" och i matsedeln under sidrubriken.
- `getShoppingList` lämnar `site` (`{ id, name, siteCount }`) bredvid listan, som `store`.
- `putCheckedInPantry({ planId, siteId })` räknar om listan mot det stället och skickar det till `addToPantry(items, siteId)`. Kvittona och listnycklarna är oförändrade, så ett nytt försök lägger aldrig något två gånger.
- Bekräftelsen säger "Lagt 8 varor i lagret för Stugan." när det finns fler än ett ställe.

## Boundaries & Constraints

**Always:**
- `recipes`, `mealplan`, `suggestions` och `shopping` anropar `getPantrySnapshot()` utan argument och `getSelectedSite()` för raden "Lager" (AD-24). Båda är memoiserade per förfrågan, så raden alltid namnger det ställe som statusen räknades mot. Ingen modul utom `pantry` läser `pantry_site` (AD-1).
- Raden "Lager: <namn>" visas bara när `siteCount > 1`. Med ett ställe, eller när stället inte går att läsa, är allt som i 1.0 (UX-DR17). Raden annonseras inte när sidan laddas. Texten kommer från `siteLineText` i `pantry/domain/site.ts`, så att alla moduler skriver den likadant.
- `coverage`, `recipeStatus`, `computeList` och listnycklarna ändras inte (AD-7, AD-8). Stället ingår aldrig i en listnyckel, en bock, en överstyrning, en egen vara, ett produktval eller exporten.
- "Lägg i lagret" (FR-19, FR-33, AD-8):
  - Klienten skickar listans `site.id`.
  - Servern räknar om listan med `getPantrySnapshot(siteId)` och lägger varorna på katalogingrediensens plats på det stället (`addToPantry(items, siteId)` → `add_to_pantry(items, site)`).
  - Ett ställe som har bytts på en annan enhet efter att listan visades ändrar ingenting i det. Ett ställe som har tagits bort ger `pantry_site_gone`, inget skrivs, och bockarna står kvar.
  - Flödet är idempotent per kvitto (3.7): ett nytt försök efter ett avbrott lägger aldrig något två gånger, också om valt ställe har bytts under tiden.
- Ett byte av valt ställe revaliderar Hemma, Recept, Matsedel och Lista (`revalidateFor("pantry_site")`, AD-18, inlagt i 8.2).
- E2E-specen har den egna e2e-användaren `e2e-stalle-status@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen summering över ställen, och inget recept jämförs mot två ställen på en gång.
- Ingen knapp för att byta ställe i Recept, receptvyn eller Matsedel. Där är raden bara metadata.
- Ingen ändring av AI-porten, prompten eller indata till `suggestDishes` utöver att snapshoten gäller valt ställe (AD-9).
- Inget nytt fält i `pantry_addition`, och ingen ändring av kvittonas nycklar.
- Raden "Lager", "Byt" och texten för en tom lista i Inköpslistan ingår inte. De kommer i 8.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Status mot Stugan | Ketchup och korv hemma, bara korv i stugan, Stugan vald, receptet "Korv med ketchup" | Receptvyn: märket "Saknar 1 vara", "1 av 2 hemma" och raden "Lager: Stugan". Ketchup är markerad som saknad | N/A |
| Biblioteket | Samma läge, filtret "Kan lagas nu" | Raden "Lager: Stugan" under sidrubriken, och receptet rangordnas som "Saknar 1 vara" | N/A |
| Andra filter | Filtret "Alla" eller "Favoriter" | Ingen rad "Lager". Statusmärkena räknas ändå mot Stugan | N/A |
| Matsedeln | Rätten på matsedeln, Stugan vald | Raden "Lager: Stugan" under sidrubriken, och rätten visar "Saknar 1 vara" | N/A |
| Tillbaka till Hemma | Hemma väljs i Hemma | Recept, receptvyn och Matsedel visar "Kan lagas nu" och "Lager: Hemma" utan omladdning | N/A |
| Ett ställe | Bara Hemma | Ingen rad "Lager" någonstans. Allt är som i 1.0 | N/A |
| AI-förslag | Stugan vald | Förslagen utgår från stugans lager. Ett tomt stugförråd ger samma text som ett tomt lager i 1.0 | `suggest_empty_pantry` |
| Lägg i lagret | Listan räknad mot Stugan, 8 avbockade poster | Varorna läggs på katalogingrediensens plats på Stugan. "Lagt 8 varor i lagret för Stugan." Hemmas lager är orört | N/A |
| Lägg i lagret med ett ställe | Bara Hemma | "Lagt 8 varor i lagret." som i 1.0 | N/A |
| Bytt på annan enhet | Listan visar Stugan, och Hemma väljs på en annan enhet innan Pontus trycker "Lägg i lagret" | Varorna hamnar på Stugan | N/A |
| Nytt försök | Första körningen lade varorna i lagret men fick inget svar. Pontus trycker igen, också efter att valt ställe har bytts | Inget läggs till två gånger. Bockarna tas bort som i 3.7 | Som i 3.7 |
| Stället borttaget | Listan räknades mot Stugan, som har tagits bort på en annan enhet | Inget läggs i lagret, och bockarna står kvar. "Stället finns inte längre. Välj ett annat ställe." och listan läses om | `pantry_site_gone` |
| Stället går inte att läsa | `getSelectedSite()` kastar | Recept och Matsedel visas utan status och utan rad "Lager", som när lagret inte går att läsa i 1.0 | `pantry_unavailable` loggas |
| Förfalskad indata | `siteId` som inte är ett uuid | Inget skrivs | `validation` |
| Annan användares ställe | `siteId` som en annan användare har | Inget skrivs | `MK410` blir `pantry_site_gone` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-8-context.md` -- modulgränser, raden "Lager" och listan
- `spec-8-1-…md`, `spec-8-2-…md` -- `getSelectedSite()`, `getPantrySnapshot(siteId?)`, `MK410`, `pantry_site_gone` och `revalidateFor("pantry_site")`
- `spec-3-7-lagg-i-lagret-efter-handlingen.md` (inklusive Review Triage Log) -- kvitton, idempotens och städningen av bockar
- `src/features/pantry/server.ts` (`addToPantry`, `getSelectedSite`), `data/add.ts` (`addToPantryIn`), `domain/site.ts` -- "Lägg i lagret" och raden "Lager"
- `src/features/recipes/server.ts` (`listLibrary`, `getRecipeWithPantry`), `data/pantry-snapshot.ts`, `actions/search-recipes.ts`, `domain/recipe-list.ts` (`RecipeLibrary`) -- statusen i biblioteket och receptvyn
- `src/features/recipes/ui/library.tsx`, `recipe-body.tsx` -- var raden visas
- `src/app/(app)/recept/page.tsx`, `recept/[id]/page.tsx` -- sidorna
- `src/features/mealplan/server.ts` (`MealPlanView`, `pantrySnapshotOrNull`), `src/app/(app)/matsedel/meal-plan-content.tsx` -- matsedeln
- `src/features/suggestions/actions/suggest-from-pantry.ts` (+ test) -- AI-förslagen, oförändrade
- `src/features/shopping/server.ts` (`getShoppingList`, `pantrySnapshotOrNull`), `actions/put-checked-in-pantry.ts` (+ test), `data/put-in-pantry.ts` (+ test, `putInPantryWith`), `domain/list-text.ts` (`putInPantryText`), `ui/put-in-pantry.tsx` (`usePutInPantry`), `ui/shopping-list.tsx`, `src/app/(app)/lista/shopping-list-content.tsx`
- `src/lib/revalidate.ts` (+ test)
- `tests/e2e/cookable.spec.ts`, `put-in-pantry.spec.ts`, `mealplan.spec.ts`, `support.ts`, `global-setup.ts` -- mönster för seeds och e2e-användare

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/domain/site.ts` (+ test), `index.ts` -- `siteLineText(site: SelectedSite | null): string | null` ger "Lager: Stugan" när `siteCount > 1` och annars `null`. `siteSuffix(site)` ger " för Stugan" när `siteCount > 1` och annars "", för texter som "… i lagret för Stugan." -- EXPERIENCE.md, Voice and Tone
- [x] `src/features/pantry/server.ts`, `data/add.ts` (+ tester):
  - `addToPantry(items, siteId: string | null)` validerar `siteId` (`z.uuid().nullable()`) och skickar `site` till `add_to_pantry`.
  - `MK410` blir `pantry_site_gone`. Det loggas med felkoden, och inget läggs till.

  -- FR-19, FR-33, AD-19
- [x] `src/features/recipes/server.ts`, `data/pantry-snapshot.ts`, `actions/search-recipes.ts`, `domain/recipe-list.ts` (+ tester):
  - `selectedSiteOrNull()` läser `getSelectedSite()` och ger `null` vid `PantryDataError`, som loggas som `pantry_unavailable`.
  - `RecipeLibrary` får `site: SelectedSite | null`, både från `listLibrary()` och från `searchRecipes`.
  - `getRecipeWithPantry` lämnar `site` bredvid snapshoten.

  -- AD-1, AD-24
- [x] `src/features/recipes/ui/library.tsx`, `recipe-body.tsx` (+ tester):
  - I biblioteket visas `siteLineText(site)` under sidrubriken bara när filtret är "Kan lagas nu", och raden följer det senaste svaret från sökningen.
  - I receptvyn visas raden under "X av Y hemma", som `<p className="text-meta text-ink-2">`.
  - Raden syns inte när statusen saknas.

  -- FR-8, FR-20, FR-22, UX-DR17
- [x] `src/features/mealplan/server.ts`, `src/app/(app)/matsedel/meal-plan-content.tsx` (+ tester) -- `MealPlanView` får `site: SelectedSite | null`, och raden visas under sidrubriken när den inte är `null` och matsedeln har rätter -- FR-13, UX-DR17
- [x] `src/features/suggestions/actions/suggest-from-pantry.ts` (+ test) -- ingen kodändring. Ett test visar att `getPantrySnapshot` anropas utan argument, och därmed gäller valt ställe -- FR-23
- [x] `src/features/shopping/server.ts` (+ test) -- `getShoppingList` lämnar `site: SelectedSite | null` från `getSelectedSite()` bredvid listan. Ett fel där ger `site: null` och loggas som `pantry_unavailable`, och listan visas ändå -- AD-8, AD-24
- [x] `src/features/shopping/actions/put-checked-in-pantry.ts`, `data/put-in-pantry.ts` (+ tester):
  - `putInPantrySchema` blir `{ planId: z.uuid(), siteId: z.uuid().nullable() }`.
  - Källan `pantry` blir `() => getPantrySnapshot(siteId ?? undefined)`, och `addToPantry` blir `(items) => addToPantry(items, siteId)`.
  - `pantry_site_gone` från `addToPantry` lämnas vidare oförändrad, och de andra felen loggas som förut.
  - Svaret får `siteName: string | null` (namnet när `siteCount > 1`), läst med `listPantrySites()` efter skrivningen. Ett fel där ger `null` och loggas bara.

  Testerna täcker:
  - att listan räknas mot det angivna stället och att varorna skickas dit;
  - att ett nytt försök med kvitton inte lägger till något, också med ett annat `siteId`;
  - `pantry_site_gone` utan skrivning och med bockarna kvar;
  - `validation` för ett `siteId` som inte är ett uuid.

  -- FR-19, FR-32, FR-33, AD-8
- [x] `src/features/shopping/domain/list-text.ts` (+ test), `ui/put-in-pantry.tsx`, `ui/shopping-list.tsx` (+ tester), `src/app/(app)/lista/shopping-list-content.tsx`:
  - `putInPantryText(added, removed, siteName)` ger "Lagt 8 varor i lagret för Stugan." när `siteName` finns och annars texten från 1.0. "Tog bort 2 varor från listan." är oförändrad.
  - `ShoppingList` får `site` och skickar `site?.id ?? null` med `putCheckedInPantry`.
  - `pantry_site_gone` visas i listans `Notice` och läser om listan (som `planChanged`).

  -- FR-19, EXPERIENCE.md
- [x] `src/lib/revalidate.test.ts` (ny eller utökad) -- `revalidateFor("pantry_site")` revaliderar `/hemma` (page), `/recept` (layout), `/matsedel` (layout) och `/lista` (page) -- AD-18
- [x] `tests/e2e/site-status.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-stalle-status@matkoll.test` (`siteStatusEmail`, i `e2eEmails`). Före varje test seedar service role:
  - katalogingredienserna "ketchup" (Skafferi) och "korv" (Kyl);
  - receptet "Korv med ketchup" med båda;
  - stället Stugan;
  - ketchup och korv på Hemma, och bara korv på Stugan;
  - en matsedel med rätten.

  Hemma väljs. Testerna kontrollerar:
  - att ett val av Stugan i Hemma ger "Saknar 1 vara", "1 av 2 hemma" och "Lager: Stugan" i receptvyn, och raden i biblioteket med "Kan lagas nu" men inte med "Alla";
  - att raden och statusen syns i Matsedel;
  - att ett val av Hemma igen ger "Kan lagas nu" utan omladdning;
  - att det inte finns någon rad "Lager" när Stugan har tagits bort;
  - att "Lägg i lagret" med Stugan vald och ketchup avbockad ger "Lagt 1 vara i lagret för Stugan." och ketchup på Stugan i Skafferi (service role), med Hemmas rader oförändrade;
  - i ett eget test: att ketchup hamnar på Stugan när service role väljer Hemma efter att listan visades.

  -- matrisen
- [x] `tests/e2e/put-in-pantry.spec.ts`, `cookable.spec.ts`, `mealplan.spec.ts` -- går igenom oförändrade, med ett ställe.
- [x] `docs/beslutslogg.md` -- en post för storyn: var raden "Lager" visas, `siteLineText`, och att "Lägg i lagret" räknar om listan mot listans ställe.

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): `putCheckedInPantry` räknar om listan mot `siteId`, inte mot valt ställe.** Servern räknar alltid om listan i stället för att lita på klienten (3.7). Om den räknade mot det ställe som är valt när anropet kommer fram kunde en post som Pontus bockade av i stugans lista vara täckt i Hemmas lager och aldrig hamna i stugan. Med listans ställe stämmer det som läggs i lagret med det Pontus såg.
- **Beslut (förslag): kvittona ändras inte.** `pantry_addition` är unik på `(user_id, key)` och nyckeln är bockens id, utan ställe. Ett nytt försök efter ett avbrott lägger därför aldrig något två gånger. Om det andra försöket skickar ett annat ställe, för att vyn har bytts, ligger varan kvar på det första stället. Det är rätt, eftersom den bara köptes en gång.
- **Beslut (förslag): `siteId` får vara `null`.** `getShoppingList` ger `site: null` när användaren saknar ställen eller när stället inte gick att läsa. Då gäller valt ställe, och `add_to_pantry` skapar Hemma vid behov (8.1). Ny kod skickar annars alltid stället (AD-24).
- **Beslut (förslag): bekräftelsen namnger stället efter skrivningen,** med det namn och antal ställen som gäller då. Ett ställe som bytte namn under tiden får sitt nya namn. Ett fel vid läsningen ger texten från 1.0 i stället för ett fel.
- **Beslut (förslag): raden "Lager" i biblioteket följer filtret "Kan lagas nu"** (EXPERIENCE.md). Med "Alla" och "Favoriter" räknas märkena ändå mot valt ställe, men raden visas inte, för att inte fylla biblioteket. Om Pontus blandar ihop lagren läggs raden till på alla filter (öppen fråga 6 gäller samma sak).
- **Beslut (förslag): ingen kodändring i `suggestions`.** AI-förslagen läser `getPantrySnapshot()`, som gäller valt ställe från och med 8.1. Ett test låser det. Förslagen visas i biblioteket, där raden "Lager" redan syns med "Kan lagas nu".
- **Risk: valt ställe byts mellan sidladdning och sökning.** `searchRecipes` räknar status mot det ställe som är valt vid sökningen och lämnar dess namn, så raden och märkena stämmer alltid med varandra.
- Loggar innehåller bara felkoder och antal, aldrig ställenas eller varornas namn.
- **Från granskningen av 8.1:** kontrollera om kvittona i `pantry_addition` behöver nycklar per ställe. I dag är nyckeln per användare, så samma rad som läggs i lagret på två ställen räknas som redan tillagd på det andra.

## Spec Change Log

### Vid bygget

- **8.3 byggdes samtidigt som 8.2,** på grenen `story/8-3` från `epic/8-flera-stallen` (e540216). Därför finns tre saker från 8.2 också här, i den minsta form som 8.3 behöver. De ger konflikter som löses när grenarna slås ihop:
  - `revalidateFor("pantry_site")` i `src/lib/revalidate.ts`, med samma fyra vägar och samma ordning som i 8.2:s spec, eftersom testet ingår i 8.3:s uppgifter;
  - felkoden `pantry_site_gone` i `src/lib/errors.ts`, med texten från epic-kontexten;
  - översättningen av `MK410`, bara i `addToPantryIn`. Den kastar `PantryDataError("site_gone")`, och konstanterna `siteGoneCode` och `siteGoneDetail` ligger i `pantry/data/client.ts`.
- **Väljaren i Hemma finns inte än,** så e2e-specen väljer ställe med service role. Den gör en upsert av användarens alla ställen i en sats, med det valda sist, så att det partiella unika indexet och `pantry_site_one_selected` håller. Specen laddar om sidan efter ett byte. Kontrollen att "Kan lagas nu" kommer tillbaka utan omladdning när Hemma väljs kräver väljaren och läggs till när 8.2 finns på grenen.
- **I biblioteket står raden direkt under filterpillren,** inte direkt under sidrubriken. Raden visas bara med "Kan lagas nu". Under rubriken skulle den flytta ned sökfältet och pillren när "Kan lagas nu" trycks, så att pillret flyttar sig under fingret.
- **I biblioteket följer raden serverns ställe före sökningens,** inte alltid det senaste svaret från sökningen. Raderna tar sin status från serverns lista i första hand (`byId.get(id) ?? recipe`), och raden ska namnge det ställe som märkena räknades mot. Sökningens ställe används när serverns lista saknade status. En sökning utan träffar läser inte lagret och ger `site: null`. Ändrat efter granskningen, se Review Triage Log.
- **I Matsedel visas raden av `MealPlanList`** (`siteLine`, från `siteLineText(view.site)` i `meal-plan-content.tsx`), först i listan. Då försvinner den samtidigt som den sista rätten när rätten tas bort, och tomläget "Ingen rätt på matsedeln än." har ingen rad. Ändrat efter granskningen, se Review Triage Log.
- **`site` är `null` när lagret inte går att läsa,** i `toLibrary`, i `getMealPlanView` och i receptvyn (`pantryForStatus()` i `recipes/data/pantry-snapshot.ts`). Så visas raden aldrig utan status. `getShoppingList` lämnar stället oberoende av snapshoten, som specen säger. Ändrat efter granskningen, se Review Triage Log.
- **`shownSiteName(site)`** i `pantry/domain/site.ts` är basen för `siteLineText` och `siteSuffix`. `putCheckedInPantry` använder den för `siteName`, och `putInPantryText` skriver " för Stugan" med namnet.
- **`siteName` läses bara när något lades i lagret** (`added > 0`). Annars namnger texten inget ställe. Ändrat efter granskningen, se Review Triage Log.
- **Kvittona behöver inte nycklar per ställe** (punkten från granskningen av 8.1). Nyckeln är bockens id. Kvittot glöms när bocken har rensats, och en ny bock får ett nytt id. Samma nyckel kommer därför bara igen när ett avbrutet försök görs om. Då har varan redan köpts och lagts på det första stället, och den ska inte läggas på det andra. `tests/integration/put-in-pantry-site.test.ts` låser det, och visar också att listan räknas mot listans ställe, att ett byte på en annan enhet inte ändrar något och att ett borttaget ställe eller en annan användares ställe ger `pantry_site_gone` utan skrivning.

## Review Triage Log

Iteration 1. Tre granskare gick igenom a02a163. Ingen migration.

**Patch:**
- **Ställe och lager läses i en följd:**
  - `pantry/server` har `getPantryForStatus()`. Den läser valt ställe en gång och sedan lagret för just det stället (`getPantrySnapshot(site.id)`), så att raden "Lager" alltid namnger det ställe som statusen räknades mot. Det gäller också i en Server Action, där React `cache` inte memoiserar.
  - Går stället eller lagret inte att läsa, är båda `null`: ingen status och ingen rad, som raden "Stället går inte att läsa" i matrisen säger. Det loggas som `pantry_unavailable`, bara med orsaken.
  - `recipes` (`listRecipes`, `listLibrary`, `getRecipeWithPantry`, `searchRecipes`), `mealplan` (`getMealPlanView`), `shopping` (`getShoppingList`) och `suggestions` (`suggestFromPantry`) använder den. De kopierade omslagen `pantrySnapshotOrNull` och `selectedSiteOrNull` är borta, liksom `recipes/data/pantry-snapshot.ts`.
  - Testerna som visade status utan ställe visar nu `snapshot: null, site: null`. Ett test i `pantry/server.test.ts` visar att ett fel vid läsningen av stället ger båda `null`.
  - `getShoppingList` läser lagret även när matsedeln saknar rätter, eftersom stället och lagret läses tillsammans.
- **"Lägg i lagret":**
  - `siteId` är `nullish`, så att en klient från bygget före 8.3, som bara skickar `{ planId }`, fungerar.
  - Utan `siteId` läses valt ställe en gång när åtgärden börjar. Listan räknas mot det stället, varorna läggs där och bekräftelsen namnger det, så att skrivningen och namnet alltid gäller samma ställe.
  - `siteNameOrNull` kastar aldrig efter en lyckad skrivning. Den loggar `pantry_unavailable` med bara koden och ger `null`.
  - Stället namnges bara när lagret tog emot något i just det här anropet. `putInPantryWith` lämnar `handled`, antalet som `add_to_pantry` lade till utan de som hoppades över för sitt kvitto. Ett nytt försök där alla varor hade kvitton namnger alltså inget ställe.
  - Ett `pantry_site_gone` redan när listan läses (om 8.2 kastar det för ett borttaget ställe) ger samma svar som från skrivningen.
- **Raden i biblioteket:**
  - Medan sökträffar visas följer raden sökningens `site` och `pantryUnavailable`, annars serverns `site`. Skiljer sig sökningens ställe från serverns visas sökningens.
  - Ingen rad vid noll träffar, efter en misslyckad sökning eller utan status.
- **Raden i Matsedel** visas bara när minst en visad rätt har status, alltså ett recept och ett lager. Den visas aldrig på en tom matsedel eller ovanför rätter utan märken.
- **AI-förslagen är knutna till ett ställe:**
  - `suggestFromPantry` läser lagret med `getPantryForStatus` och lämnar `siteId`, det ställe som förslagen gjordes från.
  - Biblioteket döljer förslagen medan det visar ett annat ställe (`site?.id`), och visar dem igen om det stället visas igen. Ett `null` på någon sida döljer inget.
- **`pantry_site_gone` i Inköpslistan** säger "Stället finns inte längre. Listan har räknats om mot Hemma. Tryck Lägg i lagret igen." Namnet kommer från `putCheckedInPantry` (`fields.site`, med `shownSiteName`). Med ett ställe, eller utan namnet, står det "Listan har räknats om." utan namn. Den allmänna texten gäller fortfarande på andra ställen. Meddelandet visas i den blå `Notice`.
- **`addToPantry` ger `validation`** för `invalid_site` från data-lagret, inte `pantry_add_failed`.
- **E2E för det borttagna stället:** listan räknas mot Stugan. Sedan väljer service role Hemma, tömmer Stugan och tar bort den. Ett tryck på "Lägg i lagret" ger meddelandet, listan räknas om mot Hemma och bocken står kvar. Inget skrivs i lagret och inga kvitton skapas. Ett andra tryck lägger ketchup i Hemma.

**Uppskjutet:**
- Raden "Lager" i Inköpslistan hör till 8.5 enligt specen.
- `getPantrySnapshot(siteId)` med ett främmande eller borttaget id som kastar `pantry_site_gone` byggs i 8.2. Kastar 8.2 det, översätter `putCheckedInPantry` det redan (`isPantrySiteGone`).
- E2E-kontrollen att vyerna följer ett byte av ställe utan omladdning läggs till när 8.2:s väljare finns på grenen.

**Avvisat:**
- Kvitton per ställe för fallet att ett ställe töms och tas bort mellan ett avbrutet försök och det nya. Det är för osannolikt.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: raden "Lager: Stugan" radbryts under rubriken i Recept, receptvyn och Matsedel, också med ett namn på 40 tecken, utan vågrät scroll.
- Med VoiceOver: raden läses som vanlig text efter rubriken och annonseras inte när sidan laddas.
- Flöde 6, del 1: välj Stugan i Hemma, öppna ett recept och matsedeln, välj Hemma igen. Statusen följer valet, och raden försvinner när Stugan tas bort.
