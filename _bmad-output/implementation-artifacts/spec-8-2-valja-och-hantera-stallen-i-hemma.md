---
title: 'Story 8.2: Välja och hantera ställen i Hemma'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-stallen-i-lagret-med-hemma-som-forsta-stalle.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-ta-bort-lagervara-med-angra.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-valja-butik.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 8.1 har varje användare stället Hemma, men Pontus kan inte lägga till Stugan, välja den eller se dess kyl, frys och skafferi (FR-29, FR-30, FR-31). Pontus vill kunna fylla stugans lager också hemifrån. Arket Lagervara och borttagningen sparar dessutom fortfarande på det ställe som är valt när anropet kommer fram, inte på det som Hemma visade (FR-33).

**Approach:**
- Tre nya Postgres-funktioner (`save_pantry_site`, `select_pantry_site` och `delete_pantry_site`) med Server Actions i `pantry/actions`.
- Hemma får en ställesväljare (`pantry/ui`):
  - Med ett ställe finns bara textknappen "Lägg till ställe" längst ned.
  - Med två eller fler finns filterpiller med ställenas namn ovanför platskorten och textknappen "Ställen".
- Arket Ställen lägger till, byter namn på och tar bort tomma ställen.
- Ett tryck på ett piller väljer stället direkt (optimistiskt), sparar valet på servern och visar ställets platser. Vald plats (`?plats=`) behålls.
- Hemma läser valt ställe på servern och skickar ställets id med varje skrivning från arket Lagervara, borttagningen och "Ångra".

## Boundaries & Constraints

**Always:**
- Ställena följer FR-29 och AD-24:
  - Namnet görs till en rad med `oneLine` och har 1–40 tecken (`charLength`).
  - Det är unikt per användare via `normalizeSiteName` (8.1), utan hänsyn till stora och små bokstäver.
  - Det får finnas högst 10 ställen (`maxSites`).
  - Ett ställe kan tas bort bara om det är tomt och inte valt, och det sista aldrig. Det tas bort utan fråga och utan "Ångra".
  - Ett nytt ställe väljs inte automatiskt.
- Funktionerna är `security invoker`, har `set search_path = ''` och tar `pantry_lock()` före allt annat (AD-24). Execute har bara `authenticated`. Ett byte sker i en transaktion i två steg: först slås alla användarens ställen av, sedan slås det nya på, eftersom det partiella unika indexet kontrolleras per rad. Efteråt är exakt ett ställe valt.
- Server Actions börjar med `requireUser()`, validerar med Zod och anropar `revalidateFor("pantry_site")` (AD-2, AD-18). `savePantrySite` används med `useActionState` och samma schema som formuläret.
- Id:t för ett nytt ställe väljs i klienten när arket öppnas och behålls tills namnet ändras, som för butiker (7.1). Ett nytt försök efter ett förlorat svar skapar därför aldrig två ställen.
- Ställesväljaren:
  - Den använder `FilterPills`. Pillren står i den ordning ställena skapades, och valt ställe är fyllt.
  - Raden radbryts och scrollar aldrig i sidled.
  - Live-regionen säger "Valt ställe: Stugan.".
  - Sidrubriken är "Hemma" som förut.
- Under ett byte är platskorten, kameraknappen, listan och "Töm kylen" `inert` med `aria-busy` tills sidan visar det nya stället, så att ingen skrivning startar i en vy som blandar två ställen.
- Arket Lagervara, borttagningen och "Ångra" skickar ställets id från vyn (FR-33):
  - Arket behåller det ställe det öppnades för.
  - "Ångra" sätter tillbaka på radens eget ställe också när ett annat har valts sedan dess.
  - En återställd rad visas bara i listan om den hör till det ställe och den plats som listan visar.
- Ett ställe som har tagits bort ger `pantry_site_gone` och ingen skrivning. Felet visas i en blå `Notice`, aldrig i rött.
- Inmatningsfälten har minst 16 px text och tryckytorna minst 44 × 44 px. Allt fungerar från 375 px och på dator, i ljust och mörkt läge och med 200 % text. Ark staplas aldrig.
- När Hemma göms efter en navigering (React Activity) stängs arket Ställen, och ett namn som inte har sparats släpps.
- E2E-specen har den egna e2e-användaren `e2e-stallen@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Valt ställe lagras aldrig i adressen, i en cookie eller i `localStorage` (AD-24). `?plats=` är oförändrad.
- Matkoll byter aldrig ställe på egen hand och använder aldrig position (SM-C3).
- Inget "Ångra" för att ta bort ett ställe, och ingen fråga i förväg.
- Ingen flytt eller kopiering av varor mellan ställen.
- `pantry_site` läses eller skrivs aldrig utanför `pantry` (AD-1).
- Lagerförslag, inventering och "Töm kylen" ingår inte. De skickar ställets id från och med 8.4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ett ställe | Bara Hemma | Ingen ställesväljare. Textknappen "Lägg till ställe" längst ned, under "Töm kylen" | N/A |
| Lägg till | "Lägg till ställe", sedan "Stugan" i "Nytt ställe" och "Lägg till" | Stugan skapas och väljs inte. "Lade till Stugan. Välj det för att se och fylla dess lager." Hemma visar pillren Hemma (fyllt) och Stugan och textknappen "Ställen" | N/A |
| Dubblett | "stugan" eller " STUGAN " när Stugan finns | Inget sparas. Under fältet: "Det finns redan ett ställe som heter Stugan." | `pantry_site_name_taken` |
| Tomt namn | Tomt, bara mellanslag eller bara osynliga tecken | Inget sparas. Under fältet: "Ange ett namn på stället." | `validation` |
| För långt | 41 tecken | Inget sparas. Under fältet: "Namnet får vara högst 40 tecken." | `validation` |
| Elfte stället | 10 ställen finns | Under fältet: "Du kan ha högst 10 ställen." Fältet och "Lägg till" är inaktiva. En förfalskad begäran sparar inget | `pantry_site_limit` (`MK422` i SQL) |
| Välj | Tryck på Stugan | Pillret fylls direkt, valet sparas, och platskorten och listan visar stugans lager med samma plats vald (`?plats=frys` står kvar). Live-regionen: "Valt ställe: Stugan." | N/A |
| Valet misslyckas | Servern svarar inte eller nekar | Pillret går tillbaka till det förra stället, och en `Notice`: "Det gick inte att spara stället. Försök igen." | `pantry_site_failed` |
| Två snabba tryck | Stugan och sedan Hemma i följd | Det sista vinner, och exakt ett ställe är valt | Låset gör att valen körs efter varandra |
| Annan enhet | Stugan vald på mobilen, och Matkoll öppnas på datorn | Datorn visar Stugan som valt ställe | N/A |
| Nytt, tomt ställe | Stugan vald utan varor | Korten visar "0 varor", och den tomma platsen visar som förut "Inget i kylen än." med "Lägg till vara" och "Fotografera kylen" | N/A |
| Lägg till vara på distans | Stugan vald, "+" och sedan mjölk 1 l i Kyl | Raden sparas på Stugan. Hemmas kyl är orörd | N/A |
| Bytt på annan enhet | Hemma visar Stugan, och Hemma väljs på en annan enhet. Pontus sparar, ändrar eller tar bort en vara och trycker "Ångra" i den gamla vyn | Allt sparas på Stugan | N/A |
| Ångra efter byte | En vara på Stugan tas bort, Pontus väljer Hemma och trycker "Ångra" inom 5 s | Raden kommer tillbaka på Stugan med samma id och syns inte i Hemmas lista | Krock: "Det gick inte att ångra." som i 2.3 |
| Byt namn | Tryck på "Stugan" i arket, sedan "Vinterstugan" och "Spara" | Pillret och raden heter Vinterstugan. "Stället heter nu Vinterstugan." | Dubblett och längd som ovan |
| Ta bort | "Ta bort" på ett tomt ställe som inte är valt | Stället försvinner direkt. "Tog bort Stugan." | N/A |
| Kan inte tas bort | Valt ställe, ett ställe med varor, eller det sista stället | Ingen "Ta bort". Raden visar "Valt" eller antalet varor ("12 varor") | En förfalskad begäran ger `pantry_site_in_use` (`MK423`) |
| Stället försvann | Ett ställe som tagits bort i en annan flik väljs, får nytt namn eller får en vara | Inget sparas. "Stället finns inte längre. Välj ett annat ställe." och sidan läses om | `pantry_site_gone` |
| Varor kom till | Ett tomt ställe får varor i en annan flik innan "Ta bort" | Inget tas bort. "Stället har varor eller är valt och kan inte tas bort." och arket läses om | `pantry_site_in_use` |
| Hemma göms | Pontus går till Recept med arket Ställen öppet | Arket stängs, och ett osparat namn släpps | N/A |
| Utloggad | Sessionen har gått ut | Omdirigering till inloggning | `unauthorized` |
| Annan användare | Ett ställe som tillhör någon annan | Syns inte och kan inte väljas, ändras eller tas bort | `MK410` blir `pantry_site_gone` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-8-context.md` -- Hemma, arket Ställen, felkoder och e2e-användare
- `spec-8-1-…md` -- `pantry_site`, `pantry_lock()`, `MK410`, `getSelectedSite()`, `listPantrySites()` och parametern `site`
- `supabase/migrations/20261026110955_settings_store_hardening.sql` -- `save_store` (lägena `add` och `change`) och `select_store` (två steg, lås först) som mönster
- `src/app/(app)/hemma/page.tsx`, `home-content.tsx` -- `HomePlace`, providerna, `<Suspense key>` och felvägen
- `src/features/pantry/ui/pantry-place.tsx`, `location-cards.tsx`, `pantry-list.tsx`, `empty-place.tsx` -- Hemmas delar och var "Lägg till ställe" hamnar
- `src/features/pantry/ui/pantry-item-sheet.tsx` (`PantrySheetProvider`, `AddPantryItemButton`) -- arket Lagervara
- `src/features/pantry/ui/pantry-removal.tsx` (`usePantryRemoval`, `applyPantryChanges`, `report`) -- borttagning, "Ångra" och väntande ändringar per plats
- `src/features/pantry/actions/set-pantry-item.ts`, `remove-pantry-item.ts`, `restore-pantry-item.ts` (+ tester) -- skrivningarna som får ställets id
- `src/features/pantry/data/set.ts`, `remove.ts`, `queries.ts`, `sites.ts` (8.1) -- data-lagret
- `src/features/pantry/domain/pantry-item-form.ts` (`pantryItemFormSchema`, `pantryRowSchema`), `pantry-item.ts` (`PantryItem`), `places.ts` (`itemCountText`), `site.ts` (8.1)
- `src/features/settings/ui/store-settings.tsx`, `store-sheet.tsx`, `src/features/settings/actions/save-store.ts`, `select-store.ts` -- mönster för ark, `useActionState`, id från klienten och val
- `src/components/filter-pills.tsx`, `sheet.tsx`, `field.tsx`, `button.tsx`, `notice.tsx`, `toast.tsx`, `badges.tsx` -- byggstenar
- `src/lib/errors.ts`, `src/lib/revalidate.ts`, `src/lib/one-line.ts`
- `tests/integration/pantry-site.test.ts` (8.1), `support.ts` -- databastester
- `tests/e2e/pantry.spec.ts`, `support.ts`, `global-setup.ts` -- mönster för Hemma och e2e-användare

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<ts>_pantry_site_manage.sql` (`supabase migration new pantry_site_manage`), `database.types.ts` (`pnpm db:types`). Funktionerna, alla `security invoker`, med `set search_path = ''`, `pantry_lock()` först och execute bara för `authenticated`:
  1. `save_pantry_site(site_id uuid, site_name text, site_normalized_name text, mode text) returns public.pantry_site`:
     - Den nekar `null`-anropare (`42501`) och saknade värden eller ett okänt läge (`22023`).
     - Den anropar `pantry_selected_site()`, så att Hemma finns.
     - Läget `add`: ett ställe med id:t som anroparen redan har får namnet (ett nytt försök). Annars ger 10 ställen `MK422`, och i övrigt läggs stället in med `is_selected = false`.
     - Läget `rename`: anroparens ställe med id:t får namnet, och saknas det ges `MK410`.
     - Samma normaliserade namn som ett annat av anroparens ställen ger `23505` på `pantry_site_user_id_normalized_name_key`, och tabellens kontroller ger `23514`. Ett id som en annan användare har ger `23505` på primärnyckeln.
  2. `select_pantry_site(site_id uuid) returns public.pantry_site`: ett ställe som anroparen saknar ger `MK410`. Annars sätts alla anroparens ställen till `is_selected = false` och sedan det här till `true`. Ett val av det redan valda stället ändrar inget.
  3. `delete_pantry_site(site_id uuid) returns boolean`: ett ställe som anroparen saknar ger `false` (redan borttaget). Valt ställe, ett ställe med varor och det sista stället ger `MK423`. Annars tas stället bort och `true` returneras. Poster i `pantry_removal` med rader på stället får stå kvar. Deras "Ångra" hoppar över raderna (8.1).

  -- AD-4, AD-24, FR-29, FR-30
- [ ] `src/features/pantry/domain/site.ts` (+ test), `index.ts`:
  - `siteFormSchema`: `id` som `z.guid()`, `name` med `oneLine` och 1–40 tecken, och `mode: "add" | "rename"`.
  - `siteFieldErrors(error)`.
  - Texterna:
    - `emptySiteNameText`: "Ange ett namn på stället.";
    - `siteNameTooLongText`: "Namnet får vara högst 40 tecken.";
    - `siteNameTakenText(name)`: "Det finns redan ett ställe som heter Stugan.";
    - `siteLimitText`: "Du kan ha högst 10 ställen.";
    - `addedSiteText(name)`: "Lade till Stugan. Välj det för att se och fylla dess lager.";
    - `renamedSiteText(name)`: "Stället heter nu Vinterstugan.";
    - `removedSiteText(name)`: "Tog bort Stugan.";
    - `selectedSiteText(name)`: "Valt ställe: Stugan.";
    - `selectedSiteLabel`: "Valt".
  - `canRemoveSite(site, sites)`: tomt, inte valt, och inte det sista.
  - `PantrySite` får `itemCount`.

  -- FR-29, EXPERIENCE.md, Voice and Tone
- [ ] `tests/design/pantry-site-checks.test.ts` (från 8.1) -- låser också gränsen 10 i `save_pantry_site` mot `maxSites` -- AD-12-mönstret
- [ ] `src/features/pantry/data/sites.ts` (+ integrationstest), `server.ts`:
  - `saveSiteIn(db, form)`, `selectSiteIn(db, id)` och `deleteSiteIn(db, id)` anropar funktionerna. De översätter `MK410` till `gone`, `23505` på namnnyckeln till `name_taken`, `MK422` till `limit` och `MK423` till `in_use`, och allt annat till `failed <code>` (`PantryDataError`).
  - `countSiteItemsIn(db, siteIds)` räknar varor per ställe med en `head`-fråga per ställe, parallellt (högst 10).
  - `server.ts` exporterar `listPantrySitesWithCounts()`. Den kastar `PantryDataError`.

  -- AD-1
- [ ] `src/features/pantry/actions/select-pantry-site.ts`, `save-pantry-site.ts`, `delete-pantry-site.ts` (+ tester):
  - `selectPantrySite({ id })` ger `ok({ site: { id, name } })`, `pantry_site_gone` eller `pantry_site_failed`.
  - `savePantrySite(previous, formData)` är för `useActionState`. Den ger `ok({ site, mode })`, `validation` (fältfel), `pantry_site_name_taken` (fältet `name`, med `siteNameTakenText`), `pantry_site_limit` (fältet `name`), `pantry_site_gone` eller `pantry_site_failed`.
  - `deletePantrySite({ id })` ger `ok({ removed: boolean })`, `pantry_site_in_use` eller `pantry_site_failed`.
  - Alla anropar `revalidateFor("pantry_site")` efter en lyckad skrivning, och också efter `gone` och `in_use`, så att en inaktuell vy läses om.
  - Loggarna har bara felkoden och Postgres-koden, aldrig namn.

  -- AD-2, AD-13, AD-18
- [ ] `src/lib/errors.ts` -- nya koder:
  - `pantry_site_gone`: "Stället finns inte längre. Välj ett annat ställe.";
  - `pantry_site_name_taken`: "Det finns redan ett ställe med det namnet." Fältet visar `siteNameTakenText` med namnet;
  - `pantry_site_limit`: "Du kan ha högst 10 ställen.";
  - `pantry_site_failed`: "Det gick inte att spara stället. Försök igen.";
  - `pantry_site_in_use`: "Stället har varor eller är valt och kan inte tas bort.".

  -- AD-13
- [ ] `src/lib/revalidate.ts` -- `pantry_site: [{ path: "/hemma", type: "page" }, { path: "/recept", type: "layout" }, { path: "/matsedel", type: "layout" }, { path: "/lista", type: "page" }]`, med en kommentar om att ett byte ändrar allt som räknas mot lagret -- AD-18
- [ ] Skrivningarna från Hemma får ställets id (FR-33):
  - `pantryItemFormSchema` får `siteId: z.uuid()`.
  - `PantryItem` och `PantryRow` får `siteId`.
  - `listPantryIn`, `removePantryItemIn` och `toPantryRow` läser `site_id`.
  - `setPantryItemsIn(db, items, replaceId, siteId)` och `restorePantryItemIn(db, row)` skickar `site`. `restore_pantry_item` får `site_id` i raden.
  - `savePantryItem` och `restorePantryItem` översätter `MK410` till `pantry_site_gone`.
  - `removePantryItem(id)` tar bort på id som förut. Raden har sitt ställe, så den behöver inget.

  Testerna täcker:
  - att ställets id skickas och att `pantry_site_gone` ges;
  - att `confirmPantrySuggestions` och `confirmPantryInventory` går igenom oförändrade (8.4 ändrar dem).

  -- FR-33, AD-19, AD-24
- [ ] `src/features/pantry/ui/pantry-removal.tsx` (+ test) -- väntande ändringar och `report` gäller ställe och plats. `applyPantryChanges(items, siteId, location, changes)` visar en återställd rad bara när den hör till det ställe och den plats som visas, och en borttagen rad döljs på id som förut -- FR-33, AD-20
- [ ] `src/features/pantry/ui/pantry-item-sheet.tsx` (+ test) -- `PantrySheetProvider` får `site`. Arket sparar sitt id i målet när det öppnas och skickar det med "Lägg till vara" och "Spara ändringar", också om Hemma byter ställe medan arket är öppet. Ett `pantry_site_gone` visas i arket, och sidan läses om -- FR-33
- [ ] `src/features/pantry/ui/site-switch.tsx` (+ test) -- `SiteSwitch({ sites, selected, children })` (klient):
  - Med fler än ett ställe visas `FilterPills` (etikett "Ställe") med ställenas namn och sist textknappen "Ställen".
  - Ett tryck gör ett optimistiskt val (`useOptimistic` i en transition), anropar `selectPantrySite` och säger `selectedSiteText` i live-regionen. Vid fel går pillret tillbaka, och `Notice` visar felet.
  - Medan valet pågår är `children` `inert` med `aria-busy="true"`.
  - Ett svar som kommer efter ett senare tryck ignoreras.

  -- FR-30, FR-31, UX-DR17
- [ ] `src/features/pantry/ui/sites-sheet.tsx` (+ test), `add-site-button.tsx` -- arket Ställen (`Sheet`, titel "Ställen"):
  - En rad per ställe i skapad ordning. Raden har namnet som knapp (`aria-label="Byt namn på Stugan"`), `itemCountText` och märket "Valt" för valt ställe.
  - Ett tryck på namnet ger fältet "Namn" med "Spara" och "Avbryt" (`useActionState`, läget `rename`). Ett namn i taget kan ändras.
  - "Ta bort" (textknapp, `aria-label="Ta bort Stugan"`) finns bara när `canRemoveSite` gäller. Bekräftelsen säger `removedSiteText`.
  - Under listan finns fältet "Nytt ställe" (platshållare "Till exempel Stugan") och knappen "Lägg till", med läget `add` och id:t från arkets öppning. Vid 10 ställen är fältet och knappen inaktiva, och texten under fältet säger `siteLimitText`.
  - Fel visas under fältet eller i en `Notice` överst i arket.
  - Efter ett nytt ställe töms fältet, ett nytt id väljs, och bekräftelsen säger `addedSiteText`.
  - Arket stängs när Hemma göms (Activity).
  - `AddSiteButton` är textknappen "Lägg till ställe" som öppnar arket när det bara finns ett ställe.

  -- FR-29, UX-DR16
- [ ] `src/app/(app)/hemma/page.tsx`, `home-content.tsx` -- `HomePlace` gör så här:
  - Den anropar `requireUserOrRedirect(next)` och läser `listPantrySitesWithCounts()`.
  - Valt ställe skickas till `PantrySheetProvider` och `HomeContent`.
  - `SiteSwitch` hamnar under sidrubriken, runt ``<Suspense key={`${site.id}:${location}`}>``. Ett byte visar alltså skelettrader i stället för det förra ställets varor.
  - `PantrySuggestionsProvider` ligger kvar ovanför, utan nyckel.
  - `HomeContent` läser `countPantryItems(site.id)` och `listPantry(location, site.id)`.
  - `PantryPlace` får `site` och lägger `AddSiteButton` sist när det bara finns ett ställe.
  - Om ställena inte går att läsa visas `pantry_unavailable` som förut, utan väljare.

  -- AD-18, FR-12, FR-31
- [ ] `tests/integration/pantry-site.test.ts` (utökad):
  - `save_pantry_site` i båda lägena: ett nytt försök med samma id, gränsen 10 (`MK422`), dubbletten och `MK410`;
  - `select_pantry_site`: exakt ett valt efteråt, också med två samtidiga anrop;
  - `MK410` för en annan användares ställe;
  - `delete_pantry_site`: valt, med varor, sista (`MK423`), redan borttaget (`false`) och tomt (`true`);
  - att `anon` nekas.

  -- AD-4, AD-24
- [ ] `tests/e2e/pantry-sites.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-stallen@matkoll.test` (`sitesEmail`, i `e2eEmails`, med storage state). Före varje test tar service role bort användarens varor och alla ställen utom Hemma, och väljer Hemma. Testerna kontrollerar:
  - att det inte finns någon väljare med ett ställe, och att "Lägg till ställe" finns;
  - att "Stugan" läggs till med bekräftelsen, att den inte är vald och att pillren syns;
  - texterna för dubblett, tomt, 41 tecken och det elfte stället (nio ställen seedade);
  - att ett val av Stugan med `?plats=frys` behåller Frys och ger live-texten och "0 varor";
  - att en ny sida i en andra webbläsarkontext för samma användare visar Stugan som vald;
  - att mjölk tillagd på Stugan har stugans `site_id` (service role) och att Hemmas kyl är orörd;
  - att en vara på Stugan, efter att service role har valt Hemma, ändras, tas bort och ångras i den gamla vyn och hamnar på Stugan;
  - att namnbyte och borttagning av ett tomt ställe fungerar, och att "Ta bort" saknas för valt ställe, ett ställe med varor och det sista stället.

  -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn: att ett nytt ställe inte väljs, texterna, att vyn är `inert` under bytet och den nya felkoden `pantry_site_in_use`.

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): `save_pantry_site` har lägena `add` och `rename`,** som `save_store` efter 7.1:s granskning. Ett nytt försök med samma id efter ett förlorat svar ändrar namnet i stället för att lägga till ett ställe till. Ett namnbyte på ett ställe som har försvunnit ger `pantry_site_gone` i stället för att skapa det igen.
- **Beslut (förslag): det normaliserade namnet skickas från domänen** (`site_normalized_name`), eftersom normaliseringen bara görs i `pantry/domain/site.ts` (8.1). Tabellens kontroll av `name` gäller ändå, så en förfalskad begäran kan inte spara ett ogiltigt namn. En förfalskad normalisering kan bara ge användaren själv två ställen som ser lika ut.
- **Beslut (förslag): en femte felkod, `pantry_site_in_use`,** med texten "Stället har varor eller är valt och kan inte tas bort.". Knappen "Ta bort" visas bara när borttagningen är möjlig, så felet kommer bara när någon annan flik har ändrat stället under tiden. `pantry_site_failed` talar om att spara, vilket blir fel för en borttagning.
- **Beslut (förslag): "Ta bort" på ett ställe som redan är borttaget ger `ok`.** Resultatet är det Pontus ville, och ett nytt försök efter ett förlorat svar är ofarligt.
- **Beslut (förslag): namnbytet bekräftas med "Stället heter nu Vinterstugan."** UX nämner ingen text för namnbyte. Den följer mönstret att bekräftelser säger vad som blev gjort.
- **Beslut (förslag): vyn är `inert` medan ett byte pågår.** Pillret byts optimistiskt, men listan visar det förra stället tills servern har svarat. Ett tryck på "+" eller en svepning under den tiden skulle annars spara på det gamla stället medan pillret visar det nya. Med `<Suspense key>` på stället och platsen visas sedan skelettrader tills det nya stället har lästs.
- **Beslut (förslag): antalet varor per ställe räknas med en `head`-fråga per ställe.** Det är högst 10 frågor, parallellt, och bara i Hemma. Valt ställe får sina antal från platskorten. Alternativ: en Postgres-funktion som räknar alla på en gång.
- **Beslut (förslag): arket Lagervara behåller sitt ställe** när Hemma byter ställe medan arket är öppet, på samma sätt som butiksarket behåller sin butik (7.1). Det som Pontus såg när arket öppnades är det som sparas (FR-33).
- **Avgränsning inom epicen:** lagerförslag, inventering och "Töm kylen" sparar fortfarande på det ställe som är valt när anropet kommer fram, tills 8.4. Epicen slås ihop med `main` i en PR, så den här mellanversionen når aldrig produktion.
- **Risk: optimistiska val och långsamt nät.** NFR-7 kräver svar inom en sekund. Om ett byte tar längre tid syns skelettrader, och vyn är `inert`. Det mäts i den manuella kontrollen.
- Ställesväljaren importeras bara av `/hemma` i den här storyn. `/lista` använder arket Byt ställe i 8.5.
- **Från granskningen av 8.1:**
  - Skrivningar mot `pantry_site` kan gå direkt via PostgREST, så gränsen `maxSites` (10) hålls av en trigger i databasen och inte bara i funktionen.
  - `normalized_name` kan bara kontrolleras i domänen (`normalizeSiteName`). En direkt skrivning med ett annat värde är en accepterad risk, eftersom RLS begränsar den till användarens egna data.
  - Läsningar med ett `siteId` som är en annan användares eller borttaget ger `pantry_site_gone`. I 8.1 ger de ett tomt lager, och ett `siteId` som inte är ett uuid ger `PantryDataError("invalid_site")`.
  - Arket Lagervara skickar `site` till `set_pantry_items`, också när `replace_id` används.
  - "Ett valt ställe" hålls av databasen (`pantry_site_one_selected`, kontrollerad vid commit, `23514`), så `select_pantry_site` slår av och på i samma transaktion.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `supabase gen types --local --schema public > src/lib/supabase/database.types.ts && git diff --exit-code src/lib/supabase/database.types.ts` -- expected: ingen skillnad

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: pillren radbryts utan vågrät scroll, också med tio ställen med 40 tecken långa namn. Arket Ställen får plats, och tryckytorna är minst 44 × 44 px.
- Med VoiceOver: pillren läses som en grupp med valt ställe markerat, "Valt ställe: Stugan." läses upp efter ett tryck, och "Byt namn på Stugan" och "Ta bort Stugan" går att nå.
- Byt mellan Hemma och Stugan med nätverket strypt till "Fast 4G" i webbläsaren. Det nya stället ska synas inom en sekund (NFR-7), och vyn ska inte gå att använda medan bytet pågår.
