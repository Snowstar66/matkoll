# Epic 7 Context: Varukorg

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan välja butik, spara vilka produkter hen brukar köpa och skicka inköpslistan till ICA Handla via en export som Claude in Chrome fyller varukorgen från (UJ-2, Flöde 2 steg 6). Epicen bygger butiken i Inställningar (FR-28), produktval per vara i listpostdetaljen (FR-27) och knappen "Skicka till ICA", som kopierar en varukorgsexport till urklipp (FR-26). Det är steg 1 och 2 i briefens Epic 7. Steg 3, en inbyggd agent, ingår inte (PRD 4.10 och 8.2).

Epicen bygger på det som redan finns: Inställningar med godkända receptsajter och `ensure_user_defaults()` (Story 1.12), inköpslistan med `computeList`, listnycklarna `r:`/`t:`/`c:`, bockar, egna varor, rättade och dolda poster, listpostdetaljen och "Lägg i lagret" (Story 3.3–3.7), och katalogens `formatQuantity` och `SECTIONS` (Story 1.5). Epicen har två nya tabeller: `store` (ägs av `settings`) och `product_choice` (ägs av `shopping`).

## Stories

- Story 7.1: Välja butik
- Story 7.2: Produktval per vara
- Story 7.3: Skicka till ICA

## Bindande beslut: flera butiker och produktval per butik

Beslutsloggen 2026-10-26, "Ordning för tilläggen efter 1.0", säger: "butiksmodellen ska klara flera butiker och produktval per butik, så att jämförelsen inte kräver ombyggnad" (se även `docs/backlog-efter-1-0.md`, punkt 3, föreslagen som 1.3). Därför gäller i hela epicen:

- **`store` är en tabell med många rader per användare**, en per butik. Det kan vara olika kedjor (ICA, Willys, Coop, Lidl med flera) och flera butiker i samma kedja (till exempel två ICA-butiker). `is_selected` markerar den butik som varukorgen och produktvalen gäller just nu. Högst en butik är vald per användare (partiellt unikt index).
- **Kedjan är ett eget fält med fasta värden** (`STORE_CHAINS` i `settings/domain`, `check` i databasen). Butikens id hos kedjan ligger i `external_store_id`. En butik identifieras av `(user_id, chain, external_store_id)`. En senare prisjämförelse kan alltså välja hur den läser priser per kedja utan att tolka fritext.
- **`product_choice` är unik på `(user_id, ingredient_id, store_id)`.** Samma katalogingrediens kan ha olika produktval i olika butiker. Ett produktval hör alltid till en butik och aldrig "till den valda butiken" i allmänhet.
- **Inget i `shopping` antar att det bara finns en butik.** Listan och exporten får butiken som argument (`exportBasket(lines, store, choices)`). Butiken eller dess id lagras aldrig i listnycklar, bockar, överstyrningar eller egna varor. Byts butik räknas listan inte om, utan bara produktvalen och exportens butik byts.
- **v1-gränssnittet använder en vald butik åt gången**, och exporten riktar sig till Claude in Chrome. Inställningar kan ändå visa och välja mellan flera butiker, så att modellen används som den är tänkt redan nu. En butik kan inte tas bort i v1 (se 7.1).

## Requirements & Constraints

- **Butik (FR-28, UX-DR16):** Inställningar har en sektion "Butik" under "Godkända receptsajter". Den visar den valda butiken med namn, kedja, butiks-id, adress och URL. Uppgifterna kan ändras, och en ny butik kan läggas till och väljas, även i en annan kedja. Förvald är Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733), som `ensure_user_defaults()` lägger in (AD-21).
- **Produktval (FR-27):** i listpostdetaljen för en receptpost eller en kopplad egen vara anger Pontus produktnamn, förpackningsstorlek och eventuell länk. Valet sparas för katalogingrediensen i den valda butiken och visas i detaljen nästa gång. Det följer med i exporten (EXPERIENCE.md, Settings: "gäller för den katalogingrediensen i vald butik").
- **Skicka till ICA (FR-26, AD-16):** knappen kopierar en text till urklipp. Texten börjar med `Matkoll varukorgsexport v1`, följd av butikens namn, kedja, butiks-id, adress och URL. Sedan kommer poster som inte är avbockade, dolda eller vaga, grupperade i avdelningsordning med mängd och produktval. Sist kommer instruktionen ordagrant, med "Beställ inte" och "rapportera varor du är osäker på i en separat lista". Formatet dokumenteras i `docs/varukorgsexport.md` och låses med ett golden-file-test. En ändring av formatet höjer versionen.
- **Matkoll gör aldrig något i butiken själv** (PRD 6, brief): inga anrop till ICA eller någon annan kedja, varken från servern, klienten eller CI, ingen skrapning, inget ICA-konto, inga inloggningsuppgifter och inga nya miljövariabler (AD-14 är oförändrad). Butikens URL och produktlänkar är text som Pontus har skrivit in. De hämtas aldrig och används aldrig i `safeFetch` (AD-11 gäller bara receptsajter). Det som händer i ICA Handla gör Pontus egen Claude in Chrome i Pontus inloggade webbläsare, eller Pontus för hand.
- **Allt som kräver Pontus konton eller test för hand** läggs som punkt i `docs/oppna-fragor.md` och byggs inte. Det gäller att kontrollera standardbutikens URL och adress (7.1) och att prova exporten med Claude in Chrome på ICA Handla (T2, 7.3).
- **Svarstider (NFR-7):** Inställningar och listan svarar inom en sekund. Exporten byggs i klienten av redan laddad data, utan anrop till servern.
- **Plattform:** allt fungerar från 375 px och på dator, i ljust och mörkt läge, med 200 % textförstoring utan vågrät scroll och på svenska. Tryckytorna är minst 44 × 44 px. Inget rött.

## Technical Decisions

- **Moduler (AD-1):** enligt Capability Map ("FR-26–FR-28 Varukorgsexport – `shopping`, `settings`").
  - `settings` äger `store`. Det exporterar typen `Store`, `STORE_CHAINS` och formulärschemat via `index.ts`, och `getSelectedStore()` och `listStores()` via `server.ts`. Skrivningar sker med Server Actions i `settings/actions` (`saveStore`, `selectStore`).
  - `shopping` äger `product_choice`. Det läser den valda butiken via `settings/server.ts` och skriver bara sin egen tabell. `exportBasket` ligger i `shopping/domain` och är ren.
  - `catalog` skrivs inte av epicen. Ett produktval pekar på en katalogingrediens som redan finns.
- **Datamodell (AD-4, AD-5, AD-20):**
  - `store`: `id`, `user_id`, `name`, `chain`, `external_store_id` (valfri), `address` (valfri), `url` (valfri, https), `is_selected`, `created_at`. Den är unik på `(id, user_id)` för sammansatta främmande nycklar och på `(user_id, chain, external_store_id)`. Ett partiellt unikt index på `(user_id) where is_selected` ger högst en vald butik.
  - `product_choice`: `id`, `user_id`, `ingredient_id`, `store_id`, `product_name`, `package_size` (valfri), `url` (valfri, https), `created_at`, `updated_at`. Den är unik på `(user_id, ingredient_id, store_id)`. Båda främmande nycklarna är sammansatta med `user_id` och `on delete restrict`, eftersom de går till andra moduler (AD-20).
  - Båda tabellerna har RLS med policyn `user_id = (select auth.uid())`, `revoke all` och sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`, och ett RLS-test.
  - Migrationer skapas med `supabase migration new`. Typerna genereras om med `supabase gen types --local --schema public > src/lib/supabase/database.types.ts`. Kör aldrig `supabase db reset`.
- **Startdata (AD-21):** `ensure_user_defaults()` lägger in Maxi ICA Stormarknad Östersund som vald butik bara när användaren saknar butik. Ett andra anrop ändrar alltså inget, och en ändrad standardbutik kommer inte tillbaka (samma princip som "Receptsajter stängs av, raderas inte", 2026-10-25). Befintliga användare får butiken av migrationen.
- **Vald butik byts atomärt:** att välja en butik kräver två uppdateringar (den gamla av, den nya på). Det görs i Postgres-funktionerna `save_store` och `select_store` (`security invoker`, ägs av `settings`), som låser användarens butiker först (AD-1).
- **Listan och exporten (AD-8, AD-16):** `computeList` är fortfarande den enda källan till listposter. Exporten utgår från listnycklarna: `r:<id>:<enhet>` ger varan med mängd, `r:<id>:-` (vag) tas inte med, `t:<text>` ger radens text med faktor, och `c:<id>` ger den egna varan. Produktval kopplas på postens `ingredientId`, för receptposter och kopplade egna varor. `getShoppingList` lämnar den valda butiken och dess produktval bredvid listan, inte inuti `ShoppingLine`.
- **Urklipp (AD-16):** texten byggs i klienten av den data listan redan visar, inklusive en bock som ännu inte är sparad, och `navigator.clipboard.writeText` anropas direkt i tryckhändelsen, utan `await` före. Om webbläsaren nekar öppnas ett ark med texten markerad och knappen "Kopiera".
- **Resultat och fel (AD-13):** nya felkoder namnges `<område>_<orsak>` i `src/lib/errors.ts` med svensk text. Förväntade fel kastas aldrig till klienten. Loggar innehåller bara felkod och orsak, aldrig butiksuppgifter, produktnamn eller länkar.
- **Rendering (AD-18):** Inställningar och listan läser sessionen och data inuti `<Suspense>`. `revalidateFor` får `store` (`/installningar`, `/lista`) och `product_choice` (`/lista`).
- **Tester:**
  - Vitest bredvid koden för domänen, actions och klientkomponenter.
  - Integrationstester mot lokal Supabase i `tests/integration/` (RLS, constraints, funktionerna).
  - Ett designtest i `tests/design/` som låser `store_chain_check` mot `STORE_CHAINS`.
  - Golden-file-test för exporten.
  - Varje e2e-spec har en egen e2e-användare i `e2eEmails` i `tests/e2e/support.ts` och med storage state i `global-setup.ts`: `e2e-butik@matkoll.test` (7.1), `e2e-produktval@matkoll.test` (7.2) och `e2e-varukorg@matkoll.test` (7.3). E2E kontrollerar att ingen förfrågan går till någon ICA-adress.

## UX & Interaction Patterns

- **Inställningar** (EXPERIENCE.md, Settings): godkända receptsajter, sedan Butik, sist "Logga ut". Sektionen Butik har rubriken "Butik" (h2, `section-label`). Den visar den valda butiken som ett kort (namn, "ICA · butiks-id 1003733", adress och URL), med textknappen "Ändra". Under kortet finns "Andra butiker" med en rad per butik och knappen "Välj", och sist textknappen "Lägg till butik". Formuläret är ett ark.
- **Listpostdetalj** (EXPERIENCE.md, IA: "ange produktval"): detaljen för en receptpost eller kopplad egen vara får sektionen "Produktval" med det sparade valet eller "Inget produktval i Maxi ICA Stormarknad Östersund." och knappen "Ange produktval" eller "Ändra produktval". Knappen öppnar arket "Produktval", som ersätter detaljen, eftersom ark aldrig staplas.
- **Fast åtgärdsknapp** (EXPERIENCE.md, Component Patterns): "Skicka till ICA" står längst ned i listan. När minst en post är avbockad blir "Lägg i lagret" primärknapp ovanför, och "Skicka till ICA" blir sekundärknapp under den.
- **Kort bekräftelse:** "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla." visas i 4 s via live-regionen (EXPERIENCE.md, State Patterns: Export kopierad). Högst en bekräftelse visas i taget.
- **Urklipp nekat:** ett ark med exporttexten markerad och knappen "Kopiera" (State Patterns).
- **Allmänt:** fel visas i en blå `Notice`, aldrig i rött, överst i ytan där problemet uppstod och med en åtgärd när det finns en. Texten är kort och saklig, med du-tilltal och utan utropstecken. Knappar är verb. Formulär använder `useActionState`, och inmatningsfälten har minst 16 px text. Synlig fokusram och logisk tabbordning.

## Cross-Story Dependencies

- **Före epicen:** Epic 1–3 är byggda. Epic 4–6 behövs inte.
  - Inställningar, `ensure_user_defaults()`, `SettingsDataError`, `settings_unavailable` och mönstret i `recipe-sites.tsx` kommer från 1.12.
  - `computeList`, `lineKey`, `getShoppingList`, `LineDetailSheet`, `CustomItemSheet`, `ShoppingList`, `PutInPantryButton`, `FixedAction`, `useToast` och `lineAmountText` kommer från 3.3–3.7.
- **7.1 före 7.2:** `product_choice.store_id` refererar `store`, och produktval sparas i den valda butiken.
- **7.2 före 7.3:** exporten tar med produktvalen och använder butiken och valen som `getShoppingList` lämnar efter 7.2.
- **Gren:** epicen byggs i grenen `epic/7-varukorg` med PR till `main`. Alla sex kontroller och en kodgranskning krävs.
- **Efter epicen:** Pontus provar exporten med Claude in Chrome på ICA Handla (öppen fråga T2), enligt checklistan som 7.3 lägger i `docs/oppna-fragor.md`.
