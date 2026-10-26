---
title: 'Story 7.1: Välja butik'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Varukorgsexporten (7.3) och produktvalen (7.2) måste veta vilken butik de gäller. Pontus handlar i dag på Maxi ICA Stormarknad Östersund men vill kunna byta butik, även till en annan kedja. Enligt beslutet 2026-10-26 ("Ordning för tilläggen efter 1.0") ska modellen redan nu klara flera butiker, så att den senare butiksjämförelsen (backlog 1.3) inte kräver ombyggnad.

**Approach:** En ny tabell `store` i `settings` med en rad per butik och högst en vald per användare. `ensure_user_defaults()` lägger in Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733) som vald butik när användaren saknar butik, och migrationen gör samma sak för befintliga användare. Inställningar får sektionen "Butik": den valda butiken med namn, kedja, butiks-id, adress och URL, "Ändra", en lista med andra butiker och "Välj", och "Lägg till butik". Sparande och val sker med Postgres-funktionerna `save_store` och `select_store`, så att högst en butik är vald även vid samtidiga tryck. `settings/server.ts` får `getSelectedStore()` för 7.2 och 7.3.

## Boundaries & Constraints

**Always:**
- Flera butiker, i flera kedjor och flera i samma kedja, är normalfallet i modellen (beslutsloggen 2026-10-26, `docs/backlog-efter-1-0.md` punkt 3). Ingen kolumn, nyckel eller funktion antar en enda butik. `is_selected` är det enda som pekar ut den butik som v1 använder.
- `store` följer AD-4:
  - `user_id uuid not null default auth.uid() references auth.users on delete cascade`;
  - RLS med policyn `user_id = (select auth.uid())` för allt;
  - `revoke all` och sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`;
  - `unique (id, user_id)` för sammansatta främmande nycklar (7.2).
- Kolumner och regler:
  - `name text not null`, 1–100 tecken efter trimning;
  - `chain text not null` med `check` mot `STORE_CHAINS`;
  - `external_store_id text`, högst 40 tecken;
  - `address text`, högst 200 tecken;
  - `url text`, högst 2048 tecken och bara `https://`;
  - `is_selected boolean not null default false`;
  - `created_at`;
  - unik på `(user_id, chain, external_store_id)`;
  - partiellt unikt index `store_one_selected_per_user on (user_id) where is_selected`.
- `ensure_user_defaults()` förblir idempotent (AD-21): butiken läggs bara in när användaren saknar butik, med `on conflict do nothing`. Ett andra anrop ändrar inget, och en butik som Pontus har ändrat ersätts eller dupliceras aldrig. Receptsajterna behandlas som i dag.
- Ett byte av vald butik sker i en transaktion som låser användarens butiker (`for update`) innan något ändras (AD-1). Efteråt är exakt en butik vald.
- Skrivningar sker via Server Actions som börjar med `requireUser()`, validerar med samma Zod-schema som formuläret och anropar `revalidateFor("store")` (AD-2, AD-18).
- Butikens URL är text som Pontus har skrivit in. Den visas som en länk (`target="_blank"`, `rel="noopener noreferrer"`) och hämtas aldrig av servern, klienten eller testerna.
- Fel visas i en blå `Notice` i sektionen Butik. Om butikerna inte går att läsa fungerar receptsajterna och "Logga ut" ändå.
- E2E-specen har den egna e2e-användaren `e2e-butik@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inga anrop till ICA eller någon annan kedja, ingen skrapning, inget ICA-konto, inga inloggningsuppgifter och inga nya miljövariabler.
- Ingen borttagning av butiker i v1.
- Ingen kolumn för vald butik i någon annan tabell, och ingen butik i listnycklar eller listans överlägg.
- `store` läses och skrivs aldrig utanför `settings` (AD-1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Första inloggningen | Användaren saknar butik, och `auth/confirm` anropar `ensure_user_defaults()` | En butik: "Maxi ICA Stormarknad Östersund", kedja ICA, butiks-id 1003733, URL `https://handlaprivatkund.ica.se/stores/1003733`, adress tom, vald | Ett fel loggas som `settings_defaults_failed`, som i dag. Inloggningen lyckas ändå |
| Andra anropet | Standardbutiken finns redan | Inget ändras: samma id, samma uppgifter, fortfarande vald | N/A |
| Ändrad standardbutik | Pontus har ändrat butiks-id eller namn och loggar in igen | Inget läggs till, och ändringen står kvar | N/A |
| Befintlig användare | Användaren fanns före migrationen | Migrationen lägger in standardbutiken som vald | N/A |
| Visa butik | Inställningar öppnas | Sektionen "Butik" under receptsajterna visar namn (rubrik), "ICA · butiks-id 1003733", "Ingen adress angiven" och URL:en som länk, med textknappen "Ändra" | N/A |
| Ändra uppgifter | "Ändra" och sedan en ny adress, "Spara" | Arket stängs, kortet visar adressen, och den korta bekräftelsen "Butiken är sparad." visas | N/A |
| Lägg till och välj | "Lägg till butik" med Namn "Willys Lindhagen", Kedja Willys, "Använd för varukorgen" ikryssad (förval), "Spara" | Willys Lindhagen är vald och visas i kortet. Maxi ICA står under "Andra butiker" med "Välj". Exakt en butik har `is_selected` | N/A |
| Lägg till utan att välja | "Använd för varukorgen" avkryssad | Butiken hamnar under "Andra butiker", och den valda butiken är oförändrad | N/A |
| Välj annan butik | "Välj" på en rad | Den butiken blir vald direkt och visas i kortet. "Maxi ICA Stormarknad Östersund är vald." | N/A |
| Två snabba val | Två "Välj" i följd, eller i två flikar | Den sista vinner, och exakt en butik är vald | Ett låsfel eller `23505` ger `settings_save_failed` och listan läses om |
| Tomt namn | Namn är tomt eller bara mellanslag | "Ange butikens namn." vid fältet, och inget sparas | `validation` |
| För långt | Namn över 100, butiks-id över 40 eller adress över 200 tecken | "Texten får vara högst N tecken." vid fältet | `validation` |
| Fel URL | "handla.ica.se", "http://…", "javascript:…" | "Ange en adress som börjar med https://." | `validation` |
| Okänd kedja | Kedja som inte finns i `STORE_CHAINS` (manipulerat formulär) | Inget sparas | `validation`, och databasens `check` ger `23514` |
| Dubblett | Samma kedja och butiks-id som en annan av användarens butiker | "Butiken finns redan." vid Butiks-id | `settings_duplicate_store` |
| Butik som försvunnit | Pontus sparar en butik som inte längre finns (annan flik) | "Butiken finns inte längre." och listan läses om | `settings_store_gone` |
| Ändringar som inte sparats | Arket stängs med ändrade fält | "Släng ändringarna?" | N/A |
| Butikerna går inte att läsa | Frågan mot `store` misslyckas | En `Notice` i sektionen Butik: "Det gick inte att läsa butiken. Försök igen." Receptsajterna och "Logga ut" fungerar | `settings_store_unavailable` loggas |
| Ingen vald butik | Kan inte uppstå i v1, men `getSelectedStore()` ger `null` | Sektionen visar "Ingen butik är vald." och "Lägg till butik" | N/A |
| Annan användare | En annan användares butik | Syns inte och kan inte väljas eller ändras | RLS ger tomt resultat eller `42501` |
| Utloggad | Sessionen har gått ut | Omdirigering till inloggning | `unauthorized` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-7-context.md` -- flera butiker, moduler, regler och UX
- `supabase/migrations/20261025211316_settings.sql`, `20261025215824_settings_backfill_and_domain_labels.sql` -- mönster för tabell, RLS, grants, `ensure_user_defaults()` och backfill
- `supabase/migrations/20261026033405_shopping_custom_item.sql`, `20261025194532_catalog.sql` -- `unique (id, user_id)`, sammansatta nycklar, funktioner med id från klienten
- `src/features/settings/index.ts`, `server.ts`, `data/client.ts` (`SettingsDb`, `SettingsDataError`), `data/defaults.ts`, `data/queries.ts`, `data/sites.ts` -- modulens ingångar och dataläge
- `src/features/settings/actions/add-recipe-site.ts` (+ test) -- mönster för en Server Action med `useActionState`, `fail`, `revalidateFor`
- `src/features/settings/ui/recipe-sites.tsx` (+ test) -- sektionens rubrik, lista och formulär
- `src/features/settings/domain/domain-name.ts` -- mönster för ett Zod-schema i `domain`
- `src/app/(app)/installningar/page.tsx` -- sidan, `<Suspense>` och felvägen
- `src/features/auth/actions/confirm-email-link.ts` (+ test) -- anropar `ensureUserDefaults()`
- `src/lib/errors.ts`, `src/lib/revalidate.ts` -- felkoder och `routesByTable`
- `src/components/sheet.tsx`, `field.tsx`, `button.tsx`, `notice.tsx`, `toast.tsx` -- byggstenar
- `tests/integration/settings.test.ts`, `support.ts` (`expectRlsIsolation`, `createTestUser`) -- RLS och funktioner
- `tests/design/shopping-checks.test.ts` -- mönster för att låsa en `check` mot domänens lista
- `tests/e2e/settings.spec.ts`, `support.ts`, `global-setup.ts` -- e2e-användare och inloggning
- `src/lib/supabase/database.types.ts` -- genereras om

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<ts>_settings_store.sql` (skapad med `supabase migration new settings_store`):
  1. Tabellen `store` med kolumnerna, kontrollerna, `store_id_user_id_key unique (id, user_id)`, `store_user_id_chain_external_store_id_key unique (user_id, chain, external_store_id)` och det partiella unika indexet `store_one_selected_per_user`. Utan `nulls not distinct`, så att flera butiker utan id (till exempel Lidl) går att lägga in.
  2. RLS, policy, `revoke` och `grant` enligt AD-4.
  3. `save_store(store jsonb, make_selected boolean) returns public.store`: `security invoker`, `set search_path = ''`. Med ett id från klienten som inte finns läggs butiken till, och med ett id som finns ändras den. Med `make_selected` låses användarens butiker (`select … for update`), alla sätts till `is_selected = false` och den här till `true`. Ett id som en annan användare har ger `23505`.
  4. `select_store(store_id uuid) returns void`: låser på samma sätt och väljer butiken. En butik som inte finns för anroparen ger `P0002`.
  5. `ensure_user_defaults()` med receptsajterna som i dag och dessutom `insert into public.store (name, chain, external_store_id, url, is_selected) select 'Maxi ICA Stormarknad Östersund', 'ICA', '1003733', 'https://handlaprivatkund.ica.se/stores/1003733', true where not exists (select 1 from public.store where user_id = (select auth.uid())) on conflict do nothing`. Kommentaren uppdateras.
  6. Backfill: samma butik för varje användare i `auth.users` som saknar butik, med `user_id` satt (migrationen körs utan session).
  7. Execute bara för `authenticated`.

  Därefter genereras typerna om -- AD-4, AD-5, AD-21
- [x] `src/features/settings/domain/store.ts` (+ test), `index.ts`:
  - `STORE_CHAINS = ["ICA", "Willys", "Coop", "Lidl", "Hemköp", "City Gross", "Annan"] as const` och `storeChainSchema`.
  - `Store = { id, name, chain, externalStoreId, address, url, isSelected }`.
  - `storeFormSchema` (id som `z.guid()`, namn trimmat 1–100, kedja, butiks-id ≤ 40, adress ≤ 200, URL med `https` och värdnamn ≤ 2048, `makeSelected`). Tomma valfria fält blir `null`.
  - `storeFieldErrors(error)` med texterna i matrisen.
  - `storeSummaryText(store)`, alltså "ICA · butiks-id 1003733", eller "Willys" utan id.
  - `noAddressText = "Ingen adress angiven"`.
  - `selectedStoreText(name)`, alltså "Maxi ICA Stormarknad Östersund är vald.".
  - `compareStores` (vald först, sedan namn med `localeCompare("sv")`).

  -- FR-28
- [x] `tests/design/settings-checks.test.ts` -- låser `store_chain_check` i den senaste migrationen som definierar den mot `STORE_CHAINS`, i samma ordning, som `shopping-checks.test.ts` gör -- AD-12-mönstret
- [x] `src/features/settings/data/stores.ts` (+ integrationstest), `data/queries.ts`, `server.ts`:
  - `loadStores(db)` och `loadSelectedStore(db)` mappar raderna till `Store`.
  - `saveStoreIn(db, form)` och `selectStoreIn(db, id)` anropar funktionerna och översätter `23505` på `store_user_id_chain_external_store_id_key` till `duplicate` och `P0002` till `gone`.
  - `server.ts` exporterar `listStores()` (sorterad med `compareStores`) och `getSelectedStore(): Promise<Store | null>`. Båda kastar `SettingsDataError`.

  -- AD-1
- [x] `src/features/settings/actions/save-store.ts`, `select-store.ts` (+ tester):
  - `saveStore(previous, formData)` för `useActionState`. Den börjar med `requireUser()`, validerar med `storeFormSchema`, anropar `saveStoreIn` och `revalidateFor("store")` och ger `ok({ store })` eller `fail` med `validation` (fältfel), `settings_duplicate_store` (fält `externalStoreId`), `settings_store_gone` eller `settings_save_failed`.
  - `selectStore({ id })` gör samma sak med `selectStoreIn`.

  -- AD-2, AD-13
- [x] `src/lib/errors.ts` -- nya koder:
  - `settings_store_unavailable`: "Det gick inte att läsa butiken. Försök igen.";
  - `settings_duplicate_store`: "Butiken finns redan.";
  - `settings_store_gone`: "Butiken finns inte längre.".

  -- AD-13
- [x] `src/lib/revalidate.ts` -- `store: [{ path: "/installningar", type: "page" }, { path: "/lista", type: "page" }]` (listan visar butikens produktval och export från 7.2) -- AD-18
- [x] `src/features/settings/ui/store-settings.tsx` (+ test), `store-sheet.tsx` (+ test):
  - `StoreSettings` är `<section aria-labelledby>` med h2 "Butik". Den visar den valda butikens kort med namnet (h3), `storeSummaryText`, adressen eller `noAddressText`, URL:en som länk och textknappen "Ändra".
  - När det finns fler butiker visas "Andra butiker" som en lista med namn, `storeSummaryText` och en sekundärknapp "Välj" (`aria-label="Välj Willys Lindhagen"`). Sist kommer textknappen "Lägg till butik".
  - `StoreSheet` är ett `Sheet` med titeln "Ändra butik" eller "Ny butik" och fälten Namn, Kedja (`<select>` med `STORE_CHAINS`), Butiks-id, Adress och URL (`type="url"`, `inputMode="url"`). Ny butik har också "Använd för varukorgen" (förvald). Knapparna är "Spara" och "Avbryt", och arket använder `isDirty`.
  - Id:t väljs i klienten (`crypto.randomUUID()`) när arket öppnas för en ny butik och behålls tills ett fält ändras, som för egna varor.
  - Efter sparande visas en kort bekräftelse: "Butiken är sparad." eller `selectedStoreText`.

  -- FR-28, UX-DR16
- [x] `src/app/(app)/installningar/page.tsx` -- sektionen Butik läses i en egen `<Suspense>` under receptsajterna med `listStores()`. `SettingsDataError` ger `Notice` med `settings_store_unavailable` bara i den sektionen. Kommentaren "The store arrives in Epic 7." tas bort -- AD-18
- [x] `tests/integration/settings.test.ts`:
  - `expectRlsIsolation("store", …)`;
  - standardbutiken efter `ensure_user_defaults()`, och att ett andra anrop ger samma rad (id, uppgifter, vald);
  - att en ändrad butik inte ersätts;
  - att två butiker med `is_selected = true` ger `23505`;
  - att `save_store` med `make_selected` och `select_store` lämnar exakt en vald;
  - att två samtidiga `select_store` lämnar exakt en vald;
  - kontrollerna (`23514` för okänd kedja och för URL utan `https://`);
  - dubbletten `(chain, external_store_id)`, och att två butiker utan id tillåts;
  - att `select_store` på en annan användares butik ger `P0002` och inte ändrar något.

  -- AD-4, AD-21
- [x] `tests/e2e/store.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-butik@matkoll.test`. Specen kontrollerar:
  - standardbutiken i Inställningar med namn, kedja, butiks-id, "Ingen adress angiven" och URL;
  - att en ändrad adress sparas och står kvar efter omladdning;
  - att "Lägg till butik" med Willys väljer den nya butiken och lägger Maxi ICA under "Andra butiker";
  - att "Välj" byter tillbaka;
  - att exakt en rad har `is_selected` (läst med service role);
  - texten "Ange en adress som börjar med https://.";
  - att ingen förfrågan går till en adress som slutar på `ica.se` under specen (`page.on("request")`).

  -- matrisen
- [x] `docs/oppna-fragor.md` -- under "Checklista för Pontus" läggs en ny punkt: "Kontrollera standardbutiken i Inställningar → Butik. Öppna URL:en `https://handlaprivatkund.ica.se/stores/1003733` i din webbläsare och se att den leder till Maxi ICA Stormarknad Östersund i ICA Handla. Rätta den annars, och fyll i butikens adress." -- PRD 6

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): flera butiker redan i v1-gränssnittet.** Beslutet 2026-10-26 kräver bara att modellen klarar flera butiker. Med "Andra butiker" och "Välj" används modellen som den är tänkt, och AC:n "lägger till en ny butik och väljer den" uppfylls utan att den gamla butiken skrivs över. Alternativ: en enda redigerbar butik i gränssnittet och flera rader bara i databasen.
- **Beslut (förslag): kedjan är en fast lista** (`ICA`, `Willys`, `Coop`, `Lidl`, `Hemköp`, `City Gross`, `Annan`) i stället för fritext. En prisjämförelse (backlog 1.3) läser priser per kedja och behöver ett säkert värde att välja på. "Annan" täcker resten, och butikens namn säger vilken det är. Listan är `check` i databasen och låses mot domänen med ett designtest. Alternativ: fritext, som är enklare men måste tolkas senare.
- **Beslut (förslag): kedjan för standardbutiken är "ICA".** "ICA Handla" i AC:n är ICA:s webbutik, där varukorgen finns och dit URL:en leder. Kortet visar därför "ICA · butiks-id 1003733" och länken till ICA Handla. Alternativ: lagra "ICA Handla" som kedja, men då blir kedjan och webbutiken samma sak.
- **Beslut (förslag): standardbutikens URL är `https://handlaprivatkund.ica.se/stores/1003733` och adressen är tom.** Adressen och URL:en har inte kunnat kontrolleras utan att anropa ICA, vilket epicen inte gör. Pontus kontrollerar dem i sin webbläsare (ny punkt i checklistan) och rättar i Inställningar. Exporten och kortet säger "Ingen adress angiven" tills dess. Alternativ: lämna URL:en tom också.
- **Beslut (förslag): `ensure_user_defaults()` lägger bara in butiken när användaren saknar butik.** Med `on conflict` på `(chain, external_store_id)` skulle en standardbutik som Pontus har ändrat komma tillbaka vid nästa inloggning, samma problem som ledde till att receptsajter stängs av i stället för att raderas (2026-10-25). `on conflict do nothing` utan mål fångar också två samtidiga inloggningar.
- **Beslut (förslag): en ny butik väljs som förval** ("Använd för varukorgen" ikryssad), eftersom det oftast är därför Pontus lägger till den. Den kan kryssas ur för att förbereda en butik utan att byta.
- **Beslut (förslag): butiker kan inte tas bort i v1.** `product_choice.store_id` är `on delete restrict` (AD-20), så en borttagning skulle antingen misslyckas eller kräva att produktvalen tas bort i en annan modul. Det är inte med i AC:n. Alternativ: "Ta bort" för en butik som inte är vald och saknar produktval.
- **Beslut (förslag): att ändra kedja på en befintlig butik är tillåtet,** men produktvalen följer med raden. Hjälptexten under Kedja i "Ändra butik" säger: "Byter du kedja, lägg hellre till en ny butik, så behåller den här sina produktval."
- **Beslut (förslag): butiks-id är valfritt.** Lidl har ingen webbutik för mat, och andra kedjor visar inte alltid id. Två butiker utan id kolliderar inte, eftersom Postgres som standard behandlar `null` som olika i unika nycklar.
- **Beslut (förslag): "Välj" sparas direkt utan att fråga först** och visar en kort bekräftelse. Valet är ofarligt och kan göras om med ett tryck.
- **Beslut (förslag): sektionen Butik har en egen `<Suspense>` och felväg,** så att ett fel i `store` inte döljer receptsajterna. Det följer regeln att felet visas där problemet uppstod.
- Loggar innehåller bara felkod och orsak (`settings_store_unavailable`, Postgres-kod), aldrig butikens namn, adress eller URL.

## Spec Change Log

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- Id:t för en ny butik behålls så länge arket är öppet. Ett id som krockar ger ett nytt id. Reservgenerator för UUID.
- `save_store` har lägena `add` och `change`. Om butiken saknas vid `change` ger det P0002.
- Delete återkallas. Advisory-lås per användare. Den första butiken blir vald.
- Unikt butiks-id oavsett stora och små bokstäver. Strängare kontroll av text.
- En okänd kedja blir "Annan".
- Ändra finns på alla butiker. Arket behåller butiken det öppnades för. Välj är spärrat medan ett val pågår.
- Nya tester:
  - kapplöpning
  - `StoreContent`
  - startdata
  - backfill
  - refresh
  - fokus
  - ordning

**Reject:** att begränsa backfill till tillåtna användare, eftersom registrering är avstängd och bara `users:sync` skapar användare.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `supabase gen types --local --schema public > src/lib/supabase/database.types.ts && git diff --exit-code src/lib/supabase/database.types.ts` -- expected: ingen skillnad

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: kortet, "Andra butiker" och arket får plats utan vågrät scroll. En lång URL bryts.
- Med VoiceOver: "Välj Willys Lindhagen" går att nå, och den korta bekräftelsen läses upp.
- Pontus kontrollerar standardbutikens URL och adress (punkten i `docs/oppna-fragor.md`). Det görs inte i bygget.
