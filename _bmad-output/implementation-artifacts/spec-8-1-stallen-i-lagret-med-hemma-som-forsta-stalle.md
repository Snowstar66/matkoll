---
title: 'Story 8.1: Ställen i lagret med Hemma som första ställe'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'f61cb23c4d02bf6cb0e792de517a4edbae30649c'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-flera-stallen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-3-tom-en-plats.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-valja-butik.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/addendum.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lagret har i 1.0 en enda nivå under användaren: `pantry_item(user_id, ingredient_id, location, amount, unit)`. Pontus vill ha lager på flera ställen, till exempel Hemma och Stugan (FR-29), men det som redan är inlagt får inte flyttas, ändras eller försvinna (NFR-9). Datamodellen måste därför få ställen innan något kan visas eller väljas, och 1.0-koden måste fungera mot det nya schemat under driftsättningen (AD-5).

**Approach:** En migration som bara lägger till, i en transaktion (AD-24):
- Tabellen `pantry_site`, som ägs av `pantry`, med "Hemma" som valt ställe för varje användare.
- `pantry_item.site_id` (`not null`, sammansatt nyckel mot `pantry_site (id, user_id)`, `on delete restrict`), fylld med användarens Hemma. Raderna behåller id, mängd och enhet.
- En ny unik nyckel med `site_id`, så att regeln "obegränsad eller mängder" gäller per ställe och plats (AD-19).
- `site_id` på de sparade raderna i `pantry_removal`.
- De sju pantry-funktionerna får parametern `site uuid default null` sist. `null` betyder valt ställe, så 1.0:s anrop gäller Hemma som förut.

`pantry/server.ts` får `getSelectedSite()` och `listPantrySites()`, och `getPantrySnapshot`, `listPantry` och `countPantryItems` får `siteId?`. Utan `siteId` gäller valt ställe, och inget summeras över ställen. `ensure_pantry_defaults()` skapar Hemma vid inloggning. Inget syns för Pontus: med ett ställe är allt som i 1.0.

## Boundaries & Constraints

**Always:**
- Migrationen skapas med `supabase migration new pantry_site` och bara lägger till (AD-5, NFR-9). Den tar inte bort några rader och byter inga id. Den fungerar med 1.0-koden, som körs mot det nya schemat medan koden driftsätts.
- `pantry_site` följer AD-4, med samma regler för text som `store` (7.1):
  - `id uuid primary key default gen_random_uuid()`;
  - `user_id uuid not null default auth.uid() references auth.users on delete cascade`;
  - `name text not null`: trimmad, på en rad, 1–40 tecken (`char_length`), utan tecknen i `refusedCodePoints` (`src/lib/one-line.ts`). Tecknen skrivs som `\uXXXX`, aldrig direkt (designtestet för osynliga tecken);
  - `normalized_name text not null`, inte tom;
  - `is_selected boolean not null default false`;
  - `created_at timestamptz not null default now()`;
  - `pantry_site_id_user_id_key unique (id, user_id)` och `pantry_site_user_id_normalized_name_key unique (user_id, normalized_name)`;
  - det partiella unika indexet `pantry_site_one_selected_per_user on (user_id) where is_selected`;
  - RLS med policyn `user_id = (select auth.uid())` för allt, och `revoke all` följt av `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`.
- Normaliseringen görs bara av `pantry/domain/site.ts` (AD-24). SQL lagrar det som domänen ger och jämför aldrig själv med `lower()`. Det enda undantaget är bokstavliga `'Hemma'` och `'hemma'` i migrationen och hjälpfunktionen, och ett designtest låser dem mot `normalizeSiteName(defaultSiteName)`.
- `pantry_item.site_id`:
  - Den är `uuid not null`, med `pantry_item_site_fkey foreign key (site_id, user_id) references public.pantry_site (id, user_id) on delete restrict`.
  - Den unika nyckeln `pantry_item_user_id_ingredient_id_location_unit_key` ersätts av `pantry_item_user_id_site_id_ingredient_id_location_unit_key unique nulls not distinct (user_id, site_id, ingredient_id, location, unit)`.
  - Indexet `pantry_item_user_id_location_idx` ersätts av `pantry_item_user_id_site_id_location_idx (user_id, site_id, location)`.
  - Ett nytt index, `pantry_item_ingredient_id_user_id_idx`, ger katalognyckeln den uppslagning som den gamla unika nyckeln gav.
- Varje pantry-funktion är `security invoker`, har `set search_path = ''`, tar `pantry_lock()` före allt annat och kan bara köras av `authenticated` (AD-1, AD-19). `pantry_lock()` ändras inte och gäller fortfarande användarens skrivningar på alla ställen.
- Parametern `site` gäller så här: `null` är valt ställe, och ett id måste vara ett av anroparens ställen, annars `MK410` och ingen skrivning. Ett återställt "Ångra" går till radens eget `site_id` (AD-20, AD-24).
- `getPantrySnapshot`, `listPantry` och `countPantryItems` gäller ett ställe och summerar aldrig över ställen (AD-7, AD-19, AD-24). De memoiseras per förfrågan med React `cache`, och samma gäller `getSelectedSite` och `listPantrySites`, så att en sida läser valt ställe en gång.
- `ensure_pantry_defaults()` är idempotent (AD-21). Den skapar Hemma som valt bara när användaren saknar ställen, och ett andra anrop ändrar inget.
- Inget syns för Pontus. Inga texter, sidor eller komponenter ändras, och alla befintliga tester (Vitest, integration och e2e) passerar utan ändrade förväntningar.
- Typerna genereras om med `pnpm db:types`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen tabell, kolumn eller rad tas bort, och ingen rad i `pantry_item` får nytt id.
- Ingen läsning eller funktion summerar lagret över ställen.
- Ingen annan modul läser eller skriver `pantry_site` (AD-1).
- Ingen ny miljövariabel, inget AI-anrop och ingen ändring i AI-porten.
- Ingen funktion byter valt ställe i den här storyn. Det gör bara `select_pantry_site` (8.2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Befintligt lager | En användare med varor i Kyl, Frys och Skafferi före migrationen | Ett ställe, "Hemma", valt. Alla rader har samma id, ingrediens, plats, mängd och enhet som förut, och `site_id` är Hemma. Antalet rader är detsamma | N/A |
| Användare utan lager | En användare i `auth.users` utan lagervaror | Får "Hemma" som valt ställe | N/A |
| Sparad borttagning | En post i `pantry_removal` från "Töm kylen" före migrationen | Varje rad i `removed_rows` har `site_id` för användarens Hemma, och "Ångra" fungerar som förut | N/A |
| 1.0-anrop | `set_pantry_items(items)`, `add_to_pantry(items)`, `empty_pantry_place(place, operation_id)` och de andra utan `site` | Gäller valt ställe, alltså Hemma, med samma svar som i 1.0 | N/A |
| Två ställen | Samma ingrediens i Kyl på Hemma och på ett andra ställe (skapat i testet med service role) | Två rader. "Obegränsad eller mängder" gäller per ställe och plats: att göra mjölken obegränsad på det ena stället ändrar inte det andra | N/A |
| Läsning per ställe | Varor på två ställen, Hemma valt | `getPantrySnapshot()`, `listPantry("Kyl")` och `countPantryItems()` ger bara Hemmas varor. Med ett id ges det stället. Inget summeras | N/A |
| Okänt ställe | En skrivfunktion med ett `site` som inte är anroparens (en annan användares, eller borttaget) | Inget skrivs | `MK410` |
| Ny användare | En användare utan ställen loggar in | `ensure_pantry_defaults()` skapar "Hemma" som valt. Ett andra anrop ändrar inget | Ett fel loggas som `pantry_defaults_failed`, och inloggningen lyckas ändå |
| Skrivning före startdata | En användare utan ställen sparar en vara (till exempel en testanvändare) | Skrivfunktionen skapar "Hemma" som valt och sparar där | N/A |
| Läsning före startdata | En användare utan ställen | `getSelectedSite()` ger `null`, och lagret är tomt | N/A |
| Direkt insättning | Service role lägger in en rad i `pantry_item` utan `site_id` (testernas seeds) | Raden hamnar på ägarens valda ställe, och Hemma skapas om det saknas | N/A |
| Ställe med varor | `delete` på ett ställe som har varor (direkt mot tabellen) | Nekas, och varorna står kvar | `23503` (`on delete restrict`) |
| Två valda | Två ställen med `is_selected = true` för samma användare | Nekas | `23505` |
| Fel namn | Ett namn som är tomt, har fler än 40 tecken, börjar eller slutar med mellanslag eller innehåller ett nekat tecken | Nekas | `23514` |
| Dubblettnamn | Två ställen med samma `normalized_name` för samma användare | Nekas | `23505` |
| Annan användare | Läsning eller skrivning av en annan användares ställe | Syns inte och kan inte ändras | RLS ger tomt resultat eller `42501` |
| Anonym | `anon` läser eller skriver `pantry_site` eller anropar en pantry-funktion | Nekas | `42501` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-8-context.md` -- bindande beslut, datamodell, migreringens steg och tester
- `supabase/migrations/20261026000446_pantry.sql` -- `pantry_item`, den unika nyckeln, indexet, RLS och grants
- `supabase/migrations/20261026010657_pantry_lock.sql` -- `pantry_lock()` och den senaste `set_pantry_items(jsonb, uuid)`
- `supabase/migrations/20261026051336_pantry_add_unlimited_fix.sql` -- den senaste `add_to_pantry(jsonb)` med kvitton i `pantry_addition`
- `supabase/migrations/20261026120231_pantry_empty_place.sql` -- `pantry_place_has_item(uuid, text, text)` och den senaste `restore_pantry_item(jsonb)`
- `supabase/migrations/20261026122008_pantry_removal.sql` -- `pantry_removal`, `empty_pantry_place(text, uuid)` och `restore_pantry_removal(uuid)`
- `supabase/migrations/20261026131054_pantry_apply_inventory_hardening.sql` -- den senaste `apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid)`, som anropar `set_pantry_items` inifrån
- `supabase/migrations/20261026105109_settings_store.sql`, `20261026110955_settings_store_hardening.sql` -- mönster för `is_selected`, partiellt unikt index, backfill från `auth.users` och textkontroller på en rad
- `src/features/pantry/server.ts`, `index.ts`, `data/client.ts`, `data/queries.ts` (`listPantryIn`, `countPantryIn`, `loadPantrySnapshot`, `allPages`) -- läsningarna som får `siteId`
- `src/features/pantry/domain/pantry-item.ts` (`toSnapshot`) -- oförändrad, men får bara ett ställes rader
- `src/lib/one-line.ts` (`oneLine`, `charLength`, `refusedCodePoints`) -- texten på en rad
- `src/features/settings/data/defaults.ts`, `src/features/auth/actions/confirm-email-link.ts` (+ test) -- mönster för startdata och var `ensurePantryDefaults()` anropas
- `src/lib/supabase/database.types.ts` -- genereras om
- `tests/integration/pantry.test.ts`, `support.ts` (`createTestUser`, `expectRlsIsolation`, `adminClient`) -- databastester
- `tests/design/pantry-checks.test.ts`, `product-choice-checks.test.ts`, `invisible-characters.test.ts` -- mönster för att låsa kontroller mot domänen
- `tests/e2e/*.spec.ts` -- seedar `pantry_item` direkt med service role, utan `site_id` (till exempel `pantry.spec.ts`, `empty-place.spec.ts`, `shopping.spec.ts`)
- `scripts/backup-counts.sql`, `docs/drift.md` -- mönster för kontrollfrågor och ordningen `supabase db push` före koddriftsättningen

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<ts>_pantry_site.sql` (`supabase migration new pantry_site`), i en transaktion, i den här ordningen:
  1. Tabellen `pantry_site` med kolumner, kontroller (`pantry_site_name_check`, `pantry_site_normalized_name_check`), nycklar, det partiella indexet, RLS och grants enligt Boundaries.
  2. Backfill: `insert into public.pantry_site (user_id, name, normalized_name, is_selected) select id, 'Hemma', 'hemma', true from auth.users on conflict do nothing`.
  3. `alter table public.pantry_item add column site_id uuid`, sedan `update … set site_id` till ägarens valda ställe, `alter column site_id set not null` och `pantry_item_site_fkey`.
  4. Byt den unika nyckeln och indexet, och lägg till `pantry_item_ingredient_id_user_id_idx`.
  5. `update public.pantry_removal` så att varje element i `removed_rows` som saknar `site_id` får ägarens Hemma, i samma ordning.
  6. Hjälpfunktioner (`security invoker`, `set search_path = ''`):
     - `pantry_selected_site(owner uuid default null) returns uuid`: ägaren är `coalesce(owner, auth.uid())`, och `null` ger `42501`. Den ger ägarens valda ställe. Saknar ägaren ställen skapas "Hemma" som valt (`on conflict do nothing`, och sedan läses det igen). Har ägaren ställen men inget valt, vilket bara kan hända efter en direkt skrivning mot tabellen, väljs det äldsta. Execute för `authenticated` och `service_role`, som triggern behöver. RLS gör att en annan ägare än anroparen aldrig går att läsa eller skapa.
     - `pantry_target_site(site uuid) returns uuid`: `null` ger `pantry_selected_site()`, och ett id ger anroparens ställe med det id:t, annars `raise … using errcode = 'MK410'`. Execute för `authenticated`.
     - Triggern `pantry_item_fill_site` (`before insert`, för varje rad): när `new.site_id is null` sätts den till `pantry_selected_site(new.user_id)`. Den finns för insättningar som inte går via funktionerna (testernas seeds med service role) och ändrar inget när `site_id` är satt.
  7. Ersätt de sju funktionerna. En ny parameter kan inte läggas till med `create or replace`, som skulle skapa en överlagring där 1.0:s anrop blir tvetydiga. Därför görs först `drop function` med den gamla signaturen och sedan `create function` med `site uuid default null` sist, och samma `revoke` och `grant execute … to authenticated`. Varje funktion behåller sitt beteende, sina felkoder och sitt svar, och dessutom:
     - tar `pantry_lock()` och sedan `target := public.pantry_target_site(site)` innan något läses eller skrivs;
     - har `site_id = target` i varje `where` mot `pantry_item` och sätter `site_id` vid varje `insert`;
     - använder den nya nyckeln i `on conflict on constraint`;
     - har `site_id` i varje rad i `jsonb`-svaren och i `pantry_removal.removed_rows`.

     Funktionerna:
     - `set_pantry_items(items jsonb, replace_id uuid default null, site uuid default null)`: `replace_id` tas bara bort när raden ligger på `target`.
     - `add_to_pantry(items jsonb, site uuid default null)`: kontrollen "redan obegränsad" gäller ingrediensen på `target`. Kvittona i `pantry_addition` är oförändrade.
     - `pantry_place_has_item(ingredient uuid, place text, item_unit text, site uuid default null)`: förblir `stable` och skriver inget. `null` läser valt ställe och skapar inget.
     - `restore_pantry_item(item jsonb, site uuid default null)`: raden går tillbaka till `item ->> 'site_id'`, annars `site`, annars valt ställe. Stället kontrolleras som i `pantry_target_site`.
     - `empty_pantry_place(place text, operation_id uuid, site uuid default null)`: tar bara bort rader på `target`. Samma operations-id igen ger den sparade posten som förut.
     - `restore_pantry_removal(operation_id uuid, site uuid default null)`: varje rad går tillbaka till sitt eget `site_id` (`site` och sedan valt ställe bara när raden saknar det). En rad vars ställe inte längre finns hoppas över och räknas i `skipped`.
     - `apply_pantry_inventory(place text, items jsonb, replace_ids uuid[], remove_ids uuid[], operation_id uuid default null, site uuid default null)`: ersätter och tar bort bara rader på `target`, och anropar `public.set_pantry_items(items, null, target)`.
  8. `ensure_pantry_defaults() returns void` (`security invoker`, tar `pantry_lock()`): anropar `pantry_selected_site()` och skapar alltså "Hemma" som valt bara när användaren saknar ställen. Execute för `authenticated`.

  Kommentarerna i migrationen förklarar varje steg på engelska. Därefter körs `pnpm db:types`.
  -- AD-4, AD-5, AD-19, AD-20, AD-21, AD-24, NFR-9
- [x] `src/features/pantry/domain/site.ts` (+ test), `index.ts`:
  - `defaultSiteName = "Hemma"`, `maxSiteNameChars = 40` och `maxSites = 10` (gränsen används från 8.2);
  - `normalizeSiteName(name)` är `oneLine(name).normalize("NFC").toLocaleLowerCase("sv")`;
  - `PantrySite = { id, name, isSelected }` och `SelectedSite = { id, name, siteCount }`;
  - `pantrySiteRowSchema` för databasens rader.

  Testerna täcker normaliseringen ("  Stugan ", "STUGAN" och "Stu  gan" blir "stugan" respektive "stu gan", och "Hemma" blir "hemma") -- AD-24
- [x] `src/features/pantry/data/sites.ts` (+ integrationstest), `data/queries.ts`, `server.ts`:
  - `loadPantrySitesIn(db)` läser användarens ställen sorterade på `created_at` och `id`. Det är högst några rader, så en fråga räcker.
  - `listPantryIn(db, location, names, siteId?)`, `countPantryIn(db, siteId?)` och `loadPantrySnapshot(db, siteId?)` filtrerar på `site_id`. Utan `siteId` används det valda stället. Saknas ett valt ställe ger de ett tomt lager och filtrerar aldrig bort villkoret.
  - `server.ts` exporterar `listPantrySites = cache(…)`, `getSelectedSite = cache(…): Promise<SelectedSite | null>` (läst från `listPantrySites`, så att sidan bara frågar en gång), `getPantrySnapshot = cache((siteId?: string) => …)`, `listPantry(location, siteId?)` och `countPantryItems(siteId?)`. Utan `siteId` använder de `getSelectedSite()`. Alla kastar `PantryDataError`.
  - Kommentarerna i `server.ts` säger att inget summeras över ställen.

  Anroparna i `recipes`, `mealplan`, `suggestions`, `shopping` och Hemma ändras inte och får valt ställe -- AD-1, AD-7, AD-19, AD-24
- [x] `src/features/pantry/data/defaults.ts`, `server.ts` (`ensurePantryDefaults()`), `src/features/auth/actions/confirm-email-link.ts` (+ test): efter `ensureUserDefaults()` anropas `ensurePantryDefaults()` i ett eget `try`. Ett fel loggas som `pantry_defaults_failed` med bara orsaken, och inloggningen lyckas ändå. Testet visar ordningen och att ett fel i den ena inte stoppar den andra -- AD-21
- [x] `tests/design/pantry-site-checks.test.ts` -- låser mot domänen, i den senaste migrationen som definierar dem:
  - att `pantry_site_name_check` har gränsen `maxSiteNameChars`;
  - att `pantry_site_name_check` nekar exakt `refusedCodePoints`, som `product-choice-checks.test.ts` gör;
  - att `'Hemma'` och `'hemma'` i migrationen är `defaultSiteName` och `normalizeSiteName(defaultSiteName)`.

  -- AD-12-mönstret
- [x] `tests/integration/pantry-site.test.ts` (ny fil, samma setup som `pantry.test.ts`):
  - `expectRlsIsolation("pantry_site", …)` och att `anon` nekas för tabellen och för alla nya funktioner;
  - kontrollerna (`23514` för tomt namn, 41 tecken, inledande mellanslag och varje tecken i `refusedCodePoints`), dubblettnamnet och två valda (`23505`);
  - att ett ställe med varor inte går att ta bort (`23503`);
  - `ensure_pantry_defaults()`: Hemma som valt, ett andra anrop ger samma rad, och en användare som redan har ett ställe får inget nytt;
  - att en skrivning utan ställen skapar Hemma, att en direkt insättning med service role utan `site_id` hamnar på ägarens valda ställe, och att `getSelectedSite()` ger `null` före startdata;
  - för alla sju funktionerna: samma ingrediens på två ställen (det andra skapat med service role), där ett anrop med `site` bara ändrar det stället och ett anrop utan `site` bara ändrar det valda. Regeln "obegränsad eller mängder" och `add_to_pantry`:s kontroll "redan obegränsad" gäller per ställe, och `restore_pantry_item` och `restore_pantry_removal` sätter tillbaka på radens eget ställe också när ett annat är valt;
  - att `MK410` ges för en annan användares ställe, och att inget skrivs då;
  - att en rad i `pantry_removal` vars ställe har tagits bort hoppas över och räknas i `skipped`;
  - att `listPantryIn`, `countPantryIn` och `loadPantrySnapshot` aldrig summerar över ställen;
  - eftervillkoren för migrationen: varje rad i `pantry_item` har ett ställe med samma `user_id`, varje användare med ställen har exakt ett valt, och varje element i `pantry_removal.removed_rows` har `site_id`.

  -- AD-4, AD-19, AD-20, AD-21, AD-24
- [x] `tests/integration/pantry.test.ts` och de andra befintliga testerna går igenom utan ändrade förväntningar. Det visar att 1.0:s anrop utan `site` fungerar (AD-5). Bara anrop som behöver ett nytt fält i svaret, till exempel `site_id` i en jämförelse med `toEqual`, får det tillagt.
- [x] `scripts/pantry-site-check.sql` och ett nytt steg i `docs/drift.md` -- en kontrollfråga som skriver varje rad i `pantry_item` (`id, user_id, ingredient_id, location, amount, unit`, sorterade på `id`) och antalet. Den körs före och efter `supabase migration up` lokalt och före och efter `supabase db push` i molnet, och de två utskrifterna ska vara identiska (`diff`). Efter migreringen kör skriptet också eftervillkoren från integrationstestet -- NFR-9
- [x] `docs/beslutslogg.md` -- en post för storyn: hjälpfunktionerna, triggern, felkoden `MK410` och att normaliseringen bara görs i domänen.

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): en ny parameter kräver `drop function` och `create function`.** `create or replace` med en extra parameter skapar en överlagring i stället för att ersätta. Då blir 1.0:s anrop utan `site` tvetydiga (`42725`). PostgREST matchar på parameternamn, så `{ items }` når den nya funktionen med `site = null`. Allt sker i samma transaktion, så det finns inget ögonblick utan funktion.
- **Beslut (förslag): `MK410` betyder att stället inte finns,** i samma familj som `MK409` från 6.4. Data-lagret i TypeScript översätter det till `pantry_site_gone` från och med 8.2, där stället först kan väljas och tas bort.
- **Beslut (förslag): normaliseringen görs bara i `pantry/domain/site.ts`,** som katalogens `normalized_name`. Postgres `lower()` beror på databasens kollation och kan skilja sig från JavaScript för å, ä och ö. Därför jämför SQL aldrig själv. De bokstavliga `'Hemma'` och `'hemma'` är låsta mot domänen med ett designtest.
- **Beslut (förslag): en `before insert`-trigger fyller `site_id` när den saknas.** Den finns för testernas seeds, som lägger in rader med service role i omkring 15 e2e-specar, och för eventuella direkta insättningar under driftsättningen. Utan den skulle de behöva skrivas om, och AC:n säger att befintliga tester passerar. Alla funktioner sätter `site_id` själva, så triggern gör inget för appens skrivningar, och TypeScript-lagret kräver `siteId` från och med 8.2. Alternativ: en hjälpare `siteIdFor(userId)` i `tests/e2e/support.ts` som alla seeds använder, och ingen trigger.
- **Beslut (förslag): `pantry_selected_site()` skapar Hemma när användaren saknar ställen,** så att en skrivning aldrig misslyckas för en användare som inte har loggat in sedan migreringen, till exempel testanvändare från `createTestUser`. Läsningar skapar inget: `getSelectedSite()` ger `null` och lagret är tomt, som AD-24 säger.
- **Beslut (förslag): ett "Ångra" vars ställe har tagits bort hoppas över** i `restore_pantry_removal` och räknas i `skipped`, som en rad vars katalogingrediens saknas. `restore_pantry_item` ger `MK410`, eftersom den gäller en enda rad. Det kan bara hända om stället töms och tas bort inom de 5 sekunder som "Ångra" visas.
- **Beslut (förslag): före och efter visas med ett skript och med eftervillkor.** CI kör migrationerna på en tom databas, så "före" finns bara lokalt och i molnet. Skriptet jämför raderna före och efter där det finns data, och integrationstestet låser eftervillkoren och 1.0:s anrop. Alternativ: en separat databas där migrationerna körs fram till 1.0, seedas och sedan uppdateras, men den lokala Supabase har `auth`-schemat bara i huvuddatabasen.
- **Risk: `pantry_lock()` gäller alla ställen.** Skrivningar på Hemma och Stugan för samma användare körs efter varandra. Det är avsiktligt (AD-24) och billigt för en användare.
- **Risk: kollation och sortering.** Ställena sorteras på `created_at` och `id`, inte på namn, så kollationen spelar ingen roll.
- Funktionerna loggar inget. Data-lagret loggar bara felkoder och Postgres-koder, aldrig ställenas namn.
- Storyn byggs på grenen `epic/8-flera-stallen`, där Story 6.5 byggs samtidigt. 6.5 ändrar inte några pantry-funktioner eller `pantry_item`. Om den gör det ändå, läggs 8.1:s migration efter 6.5:s och ersätter de senaste versionerna.

## Spec Change Log

### Vid bygget

- **`site_id` fick ett standardvärde i en andra migration,** `20261026151553_pantry_site_default.sql`. Utan ett standardvärde gav `pnpm db:types` typen `site_id: string` som krav vid insättning, och åtta direkta insättningar i `tests/integration/pantry.test.ts` och `shopping.test.ts` slutade typkontrolleras, fast triggern fyller värdet. Standardvärdet är `pantry_session_site()`, som ger den inloggades valda ställe utan att skapa något och `null` utan session eller valt ställe. Triggern fyller sedan `null` som förut, så resultatet är detsamma: ägarens valda ställe. Den första migrationen, `20261026150611_pantry_site.sql`, var redan körd lokalt och ändrades inte. I molnet körs båda med `supabase db push`, var och en i sin transaktion; mellan dem saknar `site_id` bara standardvärdet, och triggern fyller den ändå.
- **`pantry_place_has_item` tar inte `pantry_lock()`.** Den är `stable`, skriver inget och anropas av `restore_pantry_item` och `restore_pantry_removal`, som redan har låset, som i 6.3. Ett `site` som inte är anroparens ger `false` och inte `MK410`, eftersom den bara läser.
- **Grenen "väljs det äldsta" i `pantry_selected_site` är borta** (efter granskningen, i `20261026153024_pantry_site_hardening.sql`). Databasen håller nu "en användare med ställen har exakt ett valt" med en uppskjuten constraint-trigger (`pantry_site_one_selected`, `23514` vid commit), så grenen kunde inte nås. `pantry_selected_site` och därmed `ensure_pantry_defaults()` skapar "Hemma" bara när användaren saknar ställen, under ägarens lås (`pantry_owner_lock`, samma nyckel som `pantry_lock()`, som inte ändras).
- **`restore_pantry_removal` tar inte `pantry_target_site(site)` först** (efter granskningen; ersätter den tidigare avvikelsen att ett främmande `site` gav `MK410`). Reservstället letas upp först när en sparad rad saknar `site_id`. Ett gammalt eller borttaget `site` stoppar aldrig rader med eget ställe, och en rad utan ställe att gå till hoppas över och räknas i `skipped`.
- **`empty_pantry_place` läser den sparade posten innan stället löses upp** (efter granskningen). En upprepning ger posten som förut, också när stället har tagits bort (inte `MK410`). En upprepning med ett annat `site` än de sparade radernas ger `MK409`.
- **`pantry_item_site_fkey` är `on delete no action`, inte `on delete restrict`** som Boundaries säger (efter granskningen). Ett ställe med varor kan fortfarande inte tas bort (`23503`), men kontrollen görs i slutet av satsen, så kaskaden från `auth.users` aldrig beror på i vilken ordning den tar bort ställen och varor.
- **En tredje migration,** `20261026153024_pantry_site_hardening.sql`, med allt från granskningen i SQL. De två första var redan körda lokalt och ändrades inte. `pantry_target_site` håller stället `for key share` till transaktionens slut.
- **`PantryRow` har ett valfritt `siteId`.** `removePantryItem` lämnar radens ställe och `restorePantryItem` skickar det som `site_id`, så "Ångra" sätter tillbaka på radens eget ställe. Tre jämförelser med `toEqual` i `tests/integration/pantry.test.ts` fick `siteId: expect.any(String)`, som specen tillåter.
- **Före och efter lokalt:** de 48 rader som fanns före `supabase migration up` är oförändrade efteråt. Mellan körningarna lade Pontus lokala användare till 13 varor i appen (15:08:50 UTC, 16 sekunder innan migrationen kördes 15:09:06), och de fick "Hemma" av backfillen. Den andra migrationen gav ingen skillnad alls (`diff` tom, 61 rader). Den tredje gav heller ingen skillnad (`diff` tom, 35 rader och 3 poster i `pantry_removal`, med skriptet som också skriver `pantry_removal`).

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap. Ändringarna i SQL ligger i en tredje migration, `pantry_site_hardening`.

**Patch:**
- Valt ställe:
  - En användare med ställen har alltid exakt ett valt. En uppskjuten constraint trigger kontrollerar det vid commit (`23514`). Grenen "välj det äldsta" togs bort, och `ensure_pantry_defaults` skapar Hemma bara för den som saknar ställen.
  - `pantry_selected_site` tar ägarens lås (`pantry_owner_lock`) innan den skapar Hemma.
  - `pantry_target_site` låser stället `for key share`, så att det inte kan tas bort mitt i en skrivning.
- Ångra och tömning:
  - `restore_pantry_removal` letar bara reservställe för rader utan eget `site_id`. Ett inaktuellt `site` stoppar aldrig Ångra.
  - `empty_pantry_place` läser den sparade posten först. Ett nytt försök med samma id ger posten även om stället är borttaget, och med ett annat ställe ger det `MK409`.
  - `restore_pantry_item` har en dokumenterad ordning: radens eget ställe, sedan `site`, sedan valt.
  - Borttagning av en lagervara behåller radens `site_id`, så att Ångra lägger tillbaka den på rätt ställe.
- `pantry_item_site_fkey` är `on delete no action`, så att en användare som raderas aldrig fastnar på ordningen i cascade.
- Läsningar:
  - Alla läsningar av `pantry_item` filtrerar på ställe, och ett designtest låser det. Ett annat designtest låser att appens kod aldrig skriver direkt i `pantry_item`.
  - Ett `siteId` som inte är ett uuid ger `invalid_site`.
  - Valt ställe läses en gång per förfrågan, och läsningarna cachas per ställes id.
  - `zeroCounts()` finns på ett ställe.
- Kontrollskriptet och driften:
  - Skriptet jämför också `pantry_removal` före och efter, flaggar `removed_rows` som inte är en lista och kontrollerar bara användare med lager.
  - `docs/drift.md` säger att en återgång till 1.0-koden inte är säker när ett andra ställe finns. 1.0-koden skriver aldrig direkt i `pantry_item`, så den gamla unika nyckeln behövs inte.
- Nya tester:
  - regeln om ett valt ställe;
  - ordningen efter skapande;
  - `replace_id` på ett annat ställe;
  - startdata genom TypeScript-lagret;
  - `anon` nekas för de nya funktionerna;
  - rättigheter och `security invoker` för 14 funktioner;
  - eftervillkoren för `removed_rows`.

**Uppskjutet till senare stories** (en punkt finns i respektive spec under Implementation Notes):
- 8.2:
  - gränsen `maxSites` i databasen;
  - `pantry_site_gone` för läsningar av ett främmande eller borttaget ställe;
  - att arket Lagervara skickar `site`.
- 8.3: om kvittona i `pantry_addition` ska gälla per ställe.
- 8.4: att analysen returnerar ställets id och att bekräftelsen skickar det.

**Avvisat:**
- Data från 1.0 före migreringen i CI. Det täcks av kontrollskriptet, som kördes lokalt före och efter alla tre migreringarna utan skillnader.
- Skydd mot ogiltiga uuid i sparade rader. Bara funktionerna skriver dem.
- Att ändra kolumnens standardvärde. En session utan JWT får `null`, och triggern fyller i stället.
- Ett test av att React `cache` memoiserar. Det går inte att observera i testmiljön.
- `normalized_name` kan bara kontrolleras i domänen. Det är en accepterad risk, eftersom RLS begränsar det till användarens egna data.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas, utan ändrade förväntningar
- `supabase gen types --local --schema public > src/lib/supabase/database.types.ts && git diff --exit-code src/lib/supabase/database.types.ts` -- expected: ingen skillnad

**Manual checks (if no CLI):**
- Lokalt, med lagret från tidigare e2e-körningar: kör `scripts/pantry-site-check.sql` före och efter `supabase migration up` och jämför med `diff`. Expected: inga skillnader i raderna, och eftervillkoren håller. Kör aldrig `supabase db reset`.
- Logga in som Pontus lokalt efter migreringen. Hemma, receptbiblioteket, matsedeln och inköpslistan ser ut som före migreringen.
