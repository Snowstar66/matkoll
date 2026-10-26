---
title: 'Story 7.2: Produktval per vara'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** "Grädde 3 dl" säger inte vilken förpackning som ska i varukorgen. Pontus köper oftast samma produkt, till exempel Arla Matlagningsgrädde 15 % 5 dl, och vill att Matkoll kommer ihåg det, så att exporten (7.3) och Claude in Chrome väljer rätt. Ett produktval gäller en viss butik, eftersom sortimentet skiljer sig mellan kedjor och butiker (beslutet 2026-10-26, flera butiker).

**Approach:** En ny tabell `product_choice` i `shopping`, unik på `(user_id, ingredient_id, store_id)`, med sammansatta främmande nycklar till `ingredient` och `store`. `getShoppingList` läser den valda butiken via `settings/server.ts` och butikens produktval, och lämnar dem bredvid listan. Listpostdetaljen för en receptpost och för en kopplad egen vara får sektionen "Produktval" med det sparade valet eller "Inget produktval i [butik].", och en knapp som öppnar arket "Produktval" (produkt, förpackning, länk). Arket ersätter detaljen. Sparande är en upsert per katalogingrediens och butik, och borttagning går att ångra.

## Boundaries & Constraints

**Always:**
- Ett produktval hör till en katalogingrediens och en butik. Samma ingrediens kan ha olika val i olika butiker, och detaljen och exporten visar bara valet för den butik som listan lästes med (beslutsloggen 2026-10-26).
- `product_choice` följer AD-4:
  - `user_id … references auth.users on delete cascade`;
  - RLS med policyn `user_id = (select auth.uid())`;
  - `revoke all` och sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`;
  - `unique (user_id, ingredient_id, store_id)`;
  - `foreign key (ingredient_id, user_id) references ingredient (id, user_id) on delete restrict`;
  - `foreign key (store_id, user_id) references store (id, user_id) on delete restrict` (AD-20).
- Kolumner och regler:
  - `product_name text not null`, 1–200 tecken efter trimning, utan radbrytningar och kontrolltecken;
  - `package_size text`, högst 40 tecken;
  - `url text`, högst 2048 tecken och bara `https://`;
  - `created_at`;
  - `updated_at`.
- Bara `shopping` läser och skriver `product_choice`. Butiken läses bara via `settings/server.ts` (`getSelectedStore()`). Ingen katalogingrediens skapas eller ändras (AD-1, AD-6).
- Produktval sparas bara för poster med katalogingrediens: receptposter (`r:<id>:<enhet>` och vaga `r:<id>:-`) och egna varor som är sparade med koppling (`c:` med `ingredientId`).
- Skrivningar sker via Server Actions som börjar med `requireUser()`, validerar med samma Zod-schema som formuläret och anropar `revalidateFor("product_choice")` (AD-2, AD-18).
- Listan fungerar som i dag när butiken eller produktvalen inte går att läsa. Bara sektionen Produktval visar felet.
- Länken visas som en länk (`target="_blank"`, `rel="noopener noreferrer"`) och hämtas aldrig, varken av servern, klienten eller testerna.
- E2E-specen har den egna e2e-användaren `e2e-produktval@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inga anrop till ICA eller någon annan kedja, ingen sökning i butikens sortiment och inga nya miljövariabler.
- Produktvalet lagras aldrig i `ShoppingLine`, i listnyckeln eller i listans överlägg, och listan räknas inte om när ett produktval ändras.
- Inga produktnamn eller länkar i loggar.
- Arket Produktval staplas aldrig ovanpå detaljen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inget val ännu | Detaljen för receptposten "Grädde 3 dl", vald butik Maxi ICA | Sektionen "Produktval" med "Inget produktval i Maxi ICA Stormarknad Östersund." och sekundärknappen "Ange produktval" | N/A |
| Ange val | "Ange produktval", sedan Produkt "Arla Matlagningsgrädde 15 %", Förpackning "5 dl", Länk tom, "Spara" | Arket "Produktval" (titel "Produktval för grädde", undertitel butikens namn) stängs. Den korta bekräftelsen säger "Produktvalet är sparat." Raden `(ingredient, store)` finns | N/A |
| Nästa gång | Detaljen öppnas igen | "Arla Matlagningsgrädde 15 % · 5 dl" och "Ändra produktval" | N/A |
| Med länk | Länk `https://…` sparad | Produktvalet visar också textlänken "Öppna produkten" (ny flik) | N/A |
| Ändra | "Ändra produktval", ny förpackning, "Spara" | Samma rad uppdateras (upsert på ingrediens och butik) | N/A |
| Ta bort | "Ta bort produktval" i arket | Arket stängs. "Produktvalet är borttaget." med "Ångra" i 5 s | N/A |
| Ångra | "Ångra" | Valet kommer tillbaka med samma id och samma uppgifter | Om ett nytt val har sparats under tiden: "Det gick inte att ångra." och det nya står kvar |
| Samma ingrediens, två enheter | `r:<grädde>:dl` och `r:<grädde>:förp` | Båda detaljerna visar samma produktval, eftersom valet gäller ingrediensen | N/A |
| Vag post | `r:<salt>:-` ("Finns hemma?") | Sektionen Produktval visas som för andra receptposter | N/A |
| Kopplad egen vara | Egen vara "Kaffe" sparad med koppling till katalogingrediensen kaffe | Detaljen (egna varans formulär) har sektionen Produktval under formuläret, för kaffe | N/A |
| Okopplad egen vara | "Diskmedel" utan koppling | I stället för sektionen: "Koppla varan till en ingrediens för att spara ett produktval." | N/A |
| Ändrad koppling | Pontus ändrar kopplingen i formuläret men har inte sparat | Sektionen gäller den sparade kopplingen tills formuläret är sparat | N/A |
| Receptrad utan ingrediens | `t:2 citroner` | Ingen sektion Produktval | N/A |
| Annan butik vald | Pontus väljer Willys i Inställningar och öppnar detaljen | "Inget produktval i Willys Lindhagen." Valet för Maxi ICA finns kvar och visas igen när Maxi ICA väljs | N/A |
| Tom produkt | Produkt tom eller bara mellanslag | "Ange produktens namn." vid fältet | `validation` |
| För långt | Produkt över 200 eller förpackning över 40 tecken | "Texten får vara högst N tecken." | `validation` |
| Fel länk | "arla.se/…", "http://…", "javascript:…" | "Ange en adress som börjar med https://." | `validation` |
| Osparade ändringar | Arket stängs med ändrade fält | "Släng ändringarna?" | N/A |
| Ändrad mängd i detaljen | Pontus har ändrat mängden och trycker "Ange produktval" | "Släng ändringarna?" innan arket byts | N/A |
| Butiken går inte att läsa | `getSelectedStore()` kastar `SettingsDataError` | Listan visas. Sektionen Produktval visar `Notice`: "Det gick inte att läsa butiken. Försök igen." | `settings_store_unavailable` loggas |
| Produktvalen går inte att läsa | Frågan mot `product_choice` misslyckas | Listan visas. Sektionen Produktval visar `Notice`: "Det gick inte att läsa produktvalen. Försök igen." | `shopping_product_choices_unavailable` loggas |
| Ingen vald butik | `getSelectedStore()` ger `null` | "Välj en butik i inställningarna för att spara produktval." med länken "Öppna inställningar" | N/A |
| Butiken bytt under tiden | Arket sparar med butikens id från när listan lästes, och en annan butik har valts sedan dess | Valet sparas för den butik vars namn arket visade. Listan läses om | N/A |
| Sparande misslyckas | Supabase-fel | "Det gick inte att spara produktvalet. Försök igen." i arket, och fälten står kvar | `shopping_product_choice_save_failed` |
| Annan användares id | `ingredientId` eller `storeId` som inte är anroparens | Inget sparas | `23503` blir `validation` |
| Utloggad | Sessionen har gått ut | `router.refresh()` och omdirigering till inloggning | `unauthorized` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-7-context.md` -- flera butiker, moduler, regler och UX
- `_bmad-output/implementation-artifacts/spec-7-1-valja-butik.md` -- `store`, `Store`, `getSelectedStore()`, `settings_store_unavailable`
- `supabase/migrations/20261026033405_shopping_custom_item.sql` (+ `_hardening`) -- mönster för en tabell i `shopping` med sammansatta nycklar och `restrict` mot katalogen
- `src/features/shopping/server.ts` (`getShoppingList`, `ShoppingList`, felvägar som ger `null`), `data/queries.ts` (`loadShoppingList`), `data/client.ts` (`ShoppingDataError`), `data/custom-items.ts`
- `src/features/shopping/domain/compute-list.ts` (`ShoppingLine.ingredientId`, `isCustom`), `line-key.ts` (`parseLineKey`), `custom-item.ts` (gränser och feltexter), `list-text.ts`
- `src/features/shopping/actions/remove-custom-item.ts`, `restore-custom-item.ts` (+ tester) -- mönster för "Ta bort" med "Ångra" och samma id
- `src/features/shopping/ui/line-detail-sheet.tsx` (`RecipeLineDetail`, kommentaren "No product choice here (Epic 7)."), `custom-item-sheet.tsx`, `shopping-list.tsx` (`detail`-tillståndet, `openDetail`), `line-removal.ts`, `own-changes.ts`
- `src/app/(app)/lista/shopping-list-content.tsx` (+ test) -- skickar data till `ShoppingList`
- `src/features/settings/server.ts` -- `getSelectedStore()` från 7.1
- `src/lib/errors.ts`, `src/lib/revalidate.ts`
- `src/components/sheet.tsx` (`isDirty`, `preventClose`), `field.tsx`, `toast.tsx` (`toastWithUndoDurationMs`), `notice.tsx`
- `tests/integration/shopping.test.ts`, `support.ts` -- RLS och constraints
- `tests/e2e/shopping.spec.ts`, `support.ts`, `global-setup.ts` -- seedning av matsedel och recept med service role, e2e-användare

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<ts>_shopping_product_choice.sql` (skapad med `supabase migration new shopping_product_choice`):
  1. Tabellen `product_choice` med kolumner, kontroller, `product_choice_user_id_ingredient_id_store_id_key` och de två sammansatta främmande nycklarna med `on delete restrict`.
  2. Index på `(user_id, store_id)` för listans läsning och på `(store_id, user_id)` och `(ingredient_id, user_id)` för nycklarnas uppslag.
  3. RLS, policy, `revoke` och `grant` enligt AD-4.
  4. En trigger eller `default now()` med uppdatering i upserten för `updated_at`.

  Därefter genereras typerna om -- AD-4, AD-5, AD-20
- [ ] `src/features/shopping/domain/product-choice.ts` (+ test), `index.ts`:
  - `ProductChoice = { id, ingredientId, storeId, productName, packageSize, url }`.
  - `productChoiceFormSchema` (`ingredientId` och `storeId` som `z.guid()`, produkt trimmad 1–200 utan kontrolltecken med enkla mellanslag, förpackning ≤ 40, länk med `https` och värdnamn ≤ 2048). Tomma valfria fält blir `null`.
  - `productChoiceFieldErrors(error)`.
  - `canHaveProductChoice(line)` (receptpost med `ingredientId`, eller egen vara med sparat `ingredientId`).
  - `productChoiceText(choice)`, alltså "Arla Matlagningsgrädde 15 % · 5 dl", eller bara namnet utan förpackning.
  - Texterna `noProductChoiceText(storeName)`, `unlinkedCustomItemText`, `noStoreText`, `productChoiceSavedText`, `productChoiceRemovedText` och `productChoiceTitle(label)` ("Produktval för grädde", med varans namn i gemener enligt `toLocaleLowerCase("sv-SE")`).

  -- FR-27
- [ ] `src/features/shopping/data/product-choices.ts` (+ integrationstest):
  - `listProductChoicesIn(db, storeId)` ger `Record<ingredientId, ProductChoice>`.
  - `upsertProductChoiceIn(db, userId, form)` gör `upsert` med `onConflict: "user_id,ingredient_id,store_id"` och sätter `updated_at`.
  - `removeProductChoiceIn(db, id)` ger den borttagna raden.
  - `restoreProductChoiceIn(db, row)` sätter in med samma id. En konflikt på ingrediens och butik ger `conflict`.
  - `23503` blir `invalid_reference`.
  - Alla kastar `ShoppingDataError` för andra fel.

  -- AD-1, AD-20
- [ ] `src/features/shopping/server.ts`, `data/queries.ts` (+ tester):
  - `getShoppingList` läser `getSelectedStore()` och, när det finns en butik, `listProductChoicesIn(db, store.id)`. Båda läses parallellt med listan.
  - Resultatet får `store: Store | null`, `storeUnavailable: boolean`, `productChoices: Record<string, ProductChoice>` och `productChoicesUnavailable: boolean`.
  - `SettingsDataError` loggas som `settings_store_unavailable`, och `ShoppingDataError` från produktvalen som `shopping_product_choices_unavailable`. Ingen av dem stoppar listan.

  -- AD-8, AD-18
- [ ] `src/features/shopping/actions/save-product-choice.ts`, `remove-product-choice.ts`, `restore-product-choice.ts` (+ tester):
  - `saveProductChoice` börjar med `requireUser()`, validerar med `productChoiceFormSchema` och ger `ok({ choice })` eller `fail` med `validation` (fältfel, och `invalid_reference`), `shopping_product_choice_save_failed` eller `unauthorized`.
  - `removeProductChoice({ id })` ger raden för "Ångra".
  - `restoreProductChoice(row)` validerar raden med Zod och ger `shopping_restore_failed` vid konflikt.
  - Alla anropar `revalidateFor("product_choice")`.

  -- AD-2, AD-13
- [ ] `src/lib/errors.ts` -- nya koder:
  - `shopping_product_choice_save_failed`: "Det gick inte att spara produktvalet. Försök igen.";
  - `shopping_product_choices_unavailable`: "Det gick inte att läsa produktvalen. Försök igen.".

  -- AD-13
- [ ] `src/lib/revalidate.ts` -- `product_choice: [{ path: "/lista", type: "page" }]` -- AD-18
- [ ] `src/features/shopping/ui/product-choice-section.tsx` (+ test) -- `ProductChoiceSection` är `<section aria-labelledby>` med h3 "Produktval". Den visar `productChoiceText` och länken "Öppna produkten" när en sådan finns, och knappen "Ändra produktval". Annars visar den `noProductChoiceText` och "Ange produktval". Varianterna är:
  - okopplad egen vara (`unlinkedCustomItemText`, ingen knapp);
  - ingen butik (`noStoreText` med länk till `/installningar`);
  - butiken eller valen går inte att läsa (`Notice role="status"` med felets text, ingen knapp).

  -- FR-27
- [ ] `src/features/shopping/ui/product-choice-sheet.tsx` (+ test) -- `ProductChoiceSheet` är ett `Sheet` med titeln `productChoiceTitle(label)` och butikens namn under titeln. Fälten är Produkt, Förpackning (platshållare "t.ex. 5 dl") och Länk (`type="url"`, `inputMode="url"`). Knapparna är "Spara" och "Avbryt", och "Ta bort produktval" (textknapp) finns när ett val finns. Arket använder `useActionState`, `isDirty` och `preventClose` medan det sparar. Efter "Spara" stängs det med en kort bekräftelse. Efter "Ta bort produktval" stängs det med en kort bekräftelse med "Ångra" -- FR-27, UX-DR4, UX-DR5
- [ ] `src/features/shopping/ui/line-detail-sheet.tsx`, `custom-item-sheet.tsx`, `shopping-list.tsx` (+ tester):
  - `RecipeLineDetail` visar `ProductChoiceSection` under ursprunget när `canHaveProductChoice(line)`. `CustomItemSheet` visar den under formuläret för en sparad egen vara.
  - "Ange produktval" och "Ändra produktval" ber `ShoppingList` byta arket: detaljen stängs (med "Släng ändringarna?" om den har ändringar) och `ProductChoiceSheet` öppnas för samma post.
  - `ShoppingList` får `store`, `storeUnavailable`, `productChoices` och `productChoicesUnavailable` från `ShoppingListContent`.
  - Kommentaren "No product choice here (Epic 7)." tas bort.

  -- FR-27, UX-DR4
- [ ] `src/app/(app)/lista/shopping-list-content.tsx` (+ test) -- skickar de nya fälten vidare -- AD-18
- [ ] `tests/integration/shopping.test.ts`:
  - `expectRlsIsolation("product_choice", …)`, där ägaren först får en ingrediens och en butik;
  - unikheten på ingrediens och butik (`23505`);
  - att samma ingrediens kan ha val i två butiker;
  - att en annan användares ingrediens eller butik ger `23503`;
  - kontrollerna (`23514` för tomt namn och länk utan `https://`);
  - att ingrediensen och butiken inte kan tas bort medan ett val pekar på dem (`23503`, `restrict`).

  -- AD-4, AD-20
- [ ] `tests/e2e/product-choice.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-produktval@matkoll.test`. Med service role seedas en matsedel med ett recept som har "grädde 3 dl" och "2 citroner", samt den egna varan "Kaffe" kopplad till kaffe och den okopplade egna varan "Diskmedel". Specen kontrollerar:
  - att ett produktval anges och sparas för grädde, och att det visas när detaljen öppnas igen och efter omladdning;
  - "Ta bort produktval" och "Ångra";
  - att Kaffe har sektionen och att Diskmedel har texten om koppling;
  - att citroner saknar sektionen;
  - att en ny vald butik (Willys, vald i Inställningar) ger "Inget produktval i Willys …", och att valet visas igen när Maxi ICA väljs igen;
  - texten "Ange en adress som börjar med https://.";
  - att ingen förfrågan går till en adress som slutar på `ica.se`.

  -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): produktvalet gäller katalogingrediensen, inte listposten.** AC:n och UX säger "för katalogingrediensen i vald butik". Två poster för samma ingrediens i olika enheter visar därför samma val. Listnyckeln innehåller enheten men inte butiken, och det ändras inte (AD-8).
- **Beslut (förslag): produktvalen lämnas bredvid listan och läggs inte in i `ShoppingLine`.** AD-16 ger `exportBasket(lines, store, choices)` separata argument, och listan ska inte räknas om när ett produktval ändras. Det håller också butiken utanför `computeList`, så att en senare jämförelse kan anropa exporten med en annan butik och dess val.
- **Beslut (förslag): arket Produktval ersätter detaljen** i stället för att lägga ett andra formulär i den. Ark staplas aldrig (UX-DR4), och detaljen har redan ett formulär med "Spara" för mängden. Efter "Spara" stängs arket och Pontus är tillbaka i listan. Alternativ: ett fält i detaljen, som skulle ge två "Spara" i samma ark.
- **Beslut (förslag): förpackningen är fritext och valfri.** "5 dl", "500 g" och "2-pack" ska alla gå att skriva, och många produktnamn innehåller redan storleken. Den tolkas aldrig och räknas aldrig om (AD-7, AD-12). Alternativ: mängd och enhet som tal.
- **Beslut (förslag): sparandet är en upsert på ingrediens och butik**, så ett dubbeltryck eller ett nytt försök efter ett förlorat svar ger samma rad. Därför behövs inget id från klienten. "Ångra" efter borttagning sätter tillbaka raden med samma id (AD-20). Om ett nytt val har sparats under tiden står det nya kvar.
- **Beslut (förslag): butikens id följer med från när listan lästes.** Arket visar butikens namn, så valet sparas för den butik Pontus ser. Om butiken har bytts under tiden gäller valet ändå den butiken, och listan läses om. Alternativ: läsa den valda butiken på servern vid sparandet, vilket kan spara i en annan butik än den arket visade.
- **Beslut (förslag): vaga poster kan få produktval.** De har en katalogingrediens, och valet behövs om Pontus senare köper varan. Exporten (7.3) tar ändå inte med vaga poster.
- **Beslut (förslag): en okopplad egen vara får en förklaring i stället för sektionen.** Ett produktval behöver en katalogingrediens (AD-6), och listan skapar aldrig katalogingredienser (beslutet 2026-10-26 om egna varor).
- **Beslut (förslag): produktvalet visas bara i detaljen, inte i listraden.** Listraden är redan full (namn, "från [rätt]", mängd). AC:n kräver detaljen.
- **Beslut (förslag): länken heter "Öppna produkten" och öppnas i en ny flik.** Den är Pontus egen text. Matkoll hämtar den aldrig och kontrollerar inte att den leder till butiken.
- Ett produktnamn kan innehålla tecken som `·` eller `–`. Exporten (7.3) måste därför skriva valet så att det inte går att förväxla med radens struktur. Det löses i 7.3.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `supabase gen types --local --schema public > src/lib/supabase/database.types.ts && git diff --exit-code src/lib/supabase/database.types.ts` -- expected: ingen skillnad

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: sektionen Produktval och arket får plats utan vågrät scroll, och en lång produkt bryts.
- Med VoiceOver: sektionen har rubriken "Produktval", knappen säger vad den gör, och "Ångra" går att nå i bekräftelsen.
