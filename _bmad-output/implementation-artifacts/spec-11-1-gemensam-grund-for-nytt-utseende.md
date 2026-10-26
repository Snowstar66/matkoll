---
title: 'Story 11.1: Gemensam grund för nytt utseende'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: '2789f7d'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/matkoll-mobil.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/lagersaldo.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/inkopslista.html'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-app-skal-navigering-och-designtokens.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att appen ser proffsigare ut, med varorna i kategorier med ikon (FR-40). Lagersaldo, Inköpslista, Recept och Matsedel ska byggas om i 11.3–11.5, och de behöver samma kategorier, samma tokens och samma byggstenar, så att allt ser likadant ut.

**Approach:**
- `catalog/domain/categories.ts` räknar fram kategorin ur avdelningen och namnet (AD-12). Ingenting sparas.
- Nya tokens i `globals.css` enligt `DESIGN.md`: plattornas färger, måtten och `overlay`.
- Nya byggstenar i `src/components/`: Kategorirubrik, Listgrupp, Listrad, Soptunna och Mätare.
- Flikfältet och sidomenyn får en kundvagn för Inköpslista och ett kylskåp för Lagersaldo.

## Boundaries & Constraints

**Always:**
- `displayCategory(section, name)` är en ren funktion och den enda regeln för kategorin. `CATEGORIES` har ordningen Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck, Övrigt.
- Såser & smaksättare gäller bara varor i Skafferi. Namnet normaliseras med `normalizeIngredientText`. Det träffar när hela namnet är ett ord i `SAUCE_WORDS`, eller när namnets sista ord slutar på ett av dem.
- En okänd avdelning ger Övrigt, som `toSection`.
- Ikonen och plattans färg per kategori väljs bara i `category-header.tsx`. Ikonen är emoji med `aria-hidden="true"`, och plattan har ingen text för skärmläsare.
- Kategorirubriken är ett `h2` med namnet. Antalet står som text och läses som "3 varor" (`aria-label` på antalet eller dold text), och 1 ger "1 vara".
- Listraden är minst 56 px hög. Raden under har en rad med "…" när den inte får plats, men hela texten finns för skärmläsare.
- Soptunnan är en `button` med tryckytan 44 × 44 px, en linjeikon i `ink-3`, `aria-label` från anroparen ("Ta bort Gräddfil"), synlig fokusram och `hairline` vid tryck och hovring.
- Mätaren tar ett värde 0–1, har `aria-hidden="true"` och två höjder (`meter-height`, `meter-height-small`).
- Tokens finns bara i `globals.css`, i ljust och mörkt läge, och mappas med `@theme inline` (AD-17). `tests/design/tokens.ts` och `contrast.test.ts` uppdateras.
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text.

**Never:**
- Ingen migration och ingen ändring av `SECTIONS`, AI-scheman, promptar, exporten eller listans nycklar.
- Inget hex utanför `globals.css`, inget rött, inga skuggor och inga gradienter.
- Emoji aldrig i texter, i `errors.ts` eller i flikfältet.
- Inga ändringar av hur Lagersaldo, Inköpslista, Recept och Matsedel ser ut, utom flikfältets ikoner. Vyerna byggs om i 11.3–11.5.
- Inget komponentbibliotek och inget ikonpaket.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grönsak | `("Frukt och grönt", "Gurka")` | Frukt & grönt | N/A |
| Ost | `("Mejeri", "Ost")` | Mejeri & ägg | N/A |
| Chark | `("Chark", "Falukorv")` | Kött, fisk & chark | N/A |
| Fisk | `("Kött och fisk", "Lax")` | Kött, fisk & chark | N/A |
| Sås | `("Skafferi", "Sojasås")`, `("Skafferi", "Steaksås")` | Såser & smaksättare | N/A |
| Senap | `("Skafferi", "Dijonsenap")`, `("Skafferi", "Senap")` | Såser & smaksättare | N/A |
| Krydda | `("Skafferi", "Svartpeppar")`, `("Skafferi", "Flingsalt")`, `("Skafferi", "Spiskummin")` | Såser & smaksättare | N/A |
| Inte en sås | `("Skafferi", "Krossade tomater")`, `("Skafferi", "Saltgurka")`, `("Skafferi", "Pasta")` | Skafferi | N/A |
| Sås i kylen | `("Mejeri", "Bearnaisesås")` | Mejeri & ägg (bara Skafferi delas) | N/A |
| Okänd avdelning | `("Konserver", "Majs")`, `(null, "x")` | Skafferi via `toSection`, Övrigt för `null` | N/A |
| Stor bokstav och mellanslag | `("Skafferi", "  SOJASÅS ")` | Såser & smaksättare | N/A |
| Rubrik | `CategoryHeader` med Mejeri & ägg och 3 | 🥛 i ljusblå platta, "MEJERI & ÄGG", "3". VoiceOver: "Mejeri & ägg, rubrik nivå 2", "3 varor" | N/A |
| En vara | Antal 1 | "1 vara" för skärmläsare | N/A |
| Soptunna | `TrashButton` med `label="Ta bort Gräddfil"` | Knapp 44 × 44 px, namnet "Ta bort Gräddfil" | N/A |
| Mätare | `Meter value={0.43}` | 43 % fylld, dold för skärmläsare. Värden under 0 eller över 1 kläms | N/A |
| Mörkt läge | `prefers-color-scheme: dark` | Plattorna har sina mörka värden, texten `ink-2` på `bg` | N/A |
| 200 % text | Listrad med långt namn och lång rad under | Namnet radbryts, raden under får "…", ingen vågrät scroll | N/A |
| Flikfältet | Mobil, Inköpslista aktiv | Kundvagn i accent, `aria-current="page"` | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md` -- kategorierna, ikonerna, tokens och tester
- `mockups/lagersaldo.html`, `mockups/inkopslista.html` -- rubriken, listgruppen, raden och soptunnan
- `src/features/catalog/domain/sections.ts` (`SECTIONS`, `toSection`), `normalize.ts` (`normalizeIngredientText`), `index.ts`
- `src/app/globals.css` -- tokens (AD-17)
- `tests/design/tokens.ts`, `contrast.test.ts`, `no-hex.test.ts`
- `src/components/icons.tsx` -- linjeikonerna (`ListIcon`, `HomeIcon`, `FridgeIcon`)
- `src/components/app-shell/destinations.ts`, `tab-bar.tsx`, `side-menu.tsx`
- `src/components/check-circle.tsx`, `badges.tsx`, `search-field.tsx` -- mönster för små byggstenar
- `src/components/README.md` -- listan över byggstenar

## Tasks & Acceptance

**Execution:**
- [x] `src/features/catalog/domain/categories.ts` (+ test) -- `CATEGORIES`, `Category`, `categorySchema`, `SAUCE_WORDS`, `displayCategory(section, name)` och `compareCategories(a, b)` (ordningen). Exporteras från `catalog/index.ts`. Testet är en tabell med minst 40 namn, bland dem varje ord i `SAUCE_WORDS` och fallgroparna i matrisen -- FR-40, AD-12
- [x] `src/app/globals.css`, `tests/design/tokens.ts`, `tests/design/contrast.test.ts` -- `--tile-clay`, `--tile-lilac` (ljus och mörk), `--overlay`, `--tile-size`, `--row-min`, `--card-image`, `--dish-thumb`, `--meter-height`, `--meter-height-small`, mappade i `@theme inline`. Kontrasttestet tar med `ink-2` på `bg` för rubriken och `sky-ink` på `sky` för produktetiketten (11.4) -- AD-17, UX-DR23
- [x] `src/components/category-header.tsx` (+ test) -- `CategoryHeader({ category, count, id? })`: plattan, ikonen, `h2` och antalet enligt matrisen. Kartan kategori → ikon och platta ligger här -- UX-DR23
- [x] `src/components/list-group.tsx`, `list-row.tsx` (+ test) -- `ListGroup` (vitt kort, `rounded-lg`, avdelare i `hairline`) och `ListRow({ title, meta?, leading?, trailing?, onPress? | href? })` med raden under på en rad och hela texten för skärmläsare -- UX-DR24, UX-DR25
- [x] `src/components/trash-button.tsx` (+ test) -- `TrashButton({ label, onPress, disabled? })` och en ny `TrashIcon` i `icons.tsx` -- UX-DR24
- [x] `src/components/meter.tsx` (+ test) -- `Meter({ value, size: 'default' | 'small' })` -- UX-DR25, UX-DR26
- [x] `src/components/icons.tsx`, `app-shell/destinations.ts` (+ test) -- `CartIcon` för Inköpslista och `FridgeIcon` (finns) för Lagersaldo. Etiketterna är de som 10.4 satte
- [x] `src/components/README.md` -- de nya byggstenarna
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given byggstenarna i en tillfällig testsida eller i komponenttesterna, when de renderas vid 375 px i ljust och mörkt läge, then liknar de skisserna (skärmbilder utanför repot, jämförda i granskningen).

## Implementation Notes

- **Beslut (förslag): kategorin räknas fram och sparas inte.** En ny avdelning skulle kräva en migration, nya `check`, tre promptar, aliasen, omklassning av befintliga varor och en ny AI-utvärdering. Regeln gäller direkt för alla varor, och ett fel syns bara som fel rubrik. Öppen fråga 14.
- **Beslut (förslag): `SAUCE_WORDS` matchar hela namnet eller slutet på det sista ordet,** inte var som helst i namnet, så att "saltgurka" och "pepparkakor" inte blir smaksättare. Listan är en konstant med tabelltest och kan växa.
- **Beslut (förslag): emoji i plattorna, linjeikoner i flikfältet.** Skisserna har emoji, och Pontus godkände dem. Flikfältet har redan linjeikoner som passar sidomenyn på dator. Kartan i `category-header.tsx` kan bytas mot SVG utan annan ändring (öppen fråga 15).
- **Beslut (förslag): tokens för de exakta värdena i skisserna där de stämmer med `DESIGN.md`.** Skissernas 13 px under raden blir `meta` (14 px), och plattans hörn blir `rounded-sm` (10 px).
- **Risk: emoji ser olika ut** på Windows och Android. Det påverkar inte Pontus iPhone och Mac. Plattan har fast storlek, så layouten håller.
- Läs `node_modules/next/dist/docs/` före kod som rör Next.js. `node_modules` finns i huvudmappen, inte i en worktree.

## Spec Change Log

### Vid bygget

- **Byggd på `2789f7d`** (`baseline_commit`): Epic 11:s plan med Epic 10 ihopslagen, alltså med namnen Lagersaldo och Inköpslista från 10.4.
- **`SAUCE_WORDS` är längre än epic-kontextens lista** ("Listan börjar med"): "sauce", "oelek", "chili", "chilipulver", "lökpulver", "buljongtärning", "buljongtärningar", "harissa", "wasabi", "chutney", "masala", "kardemumma", "muskot", "muskotnöt", "nejlika", "nejlikor", "ingefära", "lagerblad", "saffran", "basilika", "rosmarin", "mejram", "dragon", "dill" och "kummin". Annars hamnar till exempel "Sambal oelek", "Buljongtärningar" och "Kardemumma" i Skafferi. "Pulver" och "tärning" ensamma är inte med (bakpulver, kakaopulver). Testet har 50 namn i tabellen och varje ord i `SAUCE_WORDS`, i Skafferi, med ett ord före och utanför Skafferi.
- **`category-header.tsx` importerar inte `Category`:** ESLint-regeln för AD-1 stoppar alla importer från `src/features` i `src/components`, också typer. Kartan har därför egna nycklar och typen `CategoryName`, och `tests/design/category-tiles.test.ts` kontrollerar att nycklarna är `CATEGORIES` i samma ordning (`expectTypeOf<CategoryName>().toEqualTypeOf<Category>()`), att plattorna är `DESIGN.md`:s och att varje kategori har en egen emoji. Kartan exporteras som `categoryTiles` för det testet.
- **Antalet** är en synlig siffra med `aria-hidden` och dold text ("3 varor", "1 vara") bredvid, i stället för `aria-label` på ett `span`, som skärmläsare inte läser pålitligt. Siffran är `text-meta` i `ink-2` (skissen har 13 px i `ink-3`, men `ink-3` når bara 4,3:1 mot `bg`).
- **`ListRow` har några valfria props utöver specens** för 11.3–11.5: `crossedOut` (I korgen), `as="div"` (inuti `<li><SwipeRow>` i 11.4), `pressProps` (`data-*`, `aria-haspopup`, `aria-describedby` på knappen eller länken) och `data-*` på raden. `TrashButton` tar `ref`, `className` och `data-*`, så att fokus kan flyttas till nästa soptunna. `ListGroup` tar `label` när ingen rubrik namnger listan.
- **Listradens namn för skärmläsare** är "Mellanmjölk Arla laktosfri", utan kommatecken. Ett dolt kommatecken gav "Mellanmjölk , Arla laktosfri" i Chrome. De två raderna är block, så VoiceOver pausar mellan dem, som i de befintliga listraderna.
- **Avdelarna** ligger på listans `li` (`divide-y`) och går kant i kant som i skisserna. Listgruppen klipper hörnen (`overflow-hidden`), så knappen i raden ritar fokusramen inuti sig (`-outline-offset-2`).
- **Flikfältet:** `CartIcon` (ny) och `FridgeIcon` (finns, samma som platskortet Kyl). `ListIcon` och `HomeIcon` användes inte längre och togs bort. `shell.spec` letar inte efter ikonerna och behövde ingen ändring. Testet för flikfältet och sidomenyn ligger i `app-shell/destinations.test.tsx`.
- **Tokens:** mappningen i `@theme inline` ger klasserna `bg-tile-clay`, `bg-tile-lilac`, `bg-overlay`, `size-tile`, `min-h-row`, `h-card-image`, `size-dish-thumb`, `h-meter` och `h-meter-small`. `tests/design/tokens.ts` fick `lengthTokens` och `rootToken`, och `tests/design/sizes.test.ts` kontrollerar måtten, `--overlay` och mappningen. Kontrasttestet har `tile-clay` och `tile-lilac` i båda lägena, nämner kategorirubriken (`ink-2` på `bg`) och produktetiketten (`sky-ink` på `sky`) och kontrollerar att varje platta skiljer sig från `bg` (minst 1,05:1; plattorna är dekor, så inget krav på 3:1).
- **Emoji med variantväljare** (Frys och Övrigt) står som `\u`-koder, eftersom U+FE0F är osynligt.
- **Kontrollerna** (alla under `scripts/with-test-lock.sh`): `pnpm lint`, `pnpm typecheck` och `pnpm test` (199 filer, 3 968 tester) lyckas. `AI_PROVIDER=mock pnpm build` lyckas, och `CI=1 pnpm test:e2e` med de berörda specarna `shell`, `smoke`, `pantry` och `shopping` ger 44 av 44. `pnpm test:integration` ger 426 av 427: `empty_pantry_place` i `pantry-site.test.ts` får `label` och `created_at` på de borttagna raderna, eftersom den lokala databasen redan har migrationen från 11.2 (byggs parallellt i en annan worktree). Storyn ändrar ingenting i databasen, och testet uppdateras i 11.2. Hela e2e-sviten kördes inte, eftersom bara flikfältets ikoner ändrades i vyerna.
- **Skärmbilder:** en tillfällig sida med alla byggstenar (inte incheckad) fotograferades med Playwright vid 375 px och 1280 px i ljust och mörkt läge, utanför repot. Soptunnan mättes till 44 × 44 px och raden till minst 56 px. Vid 188 px bredd (375 px med 200 % zoom) fick byggstenarna plats utan vågrät scroll; bara testsidans egen rubrik ("Byggstenar", ett långt ord i 34 px) gick utanför.

## Review Triage Log

Iteration 1. Granskare: två granskare (snabb variant). Ändringarna ligger i en andra commit, "fix: review fixes for Story 11.1". 11.4 och 11.5 byggs samtidigt ovanpå `a566fa1`, så alla ändringar i byggstenarnas API är tillägg eller bakåtkompatibla: inga exporterade namn har bytt namn eller tagits bort, och inga standardvärden har ändrats.

**Patch:**
- Kategorierna (`categories.ts`):
  - Förpackningsstorlekar tas bort före orden: "Sojasås 150 ml", "Flingsalt 250g" och "Coca-Cola Zero 33 cl".
  - Är det första ordet ett ord i `SAUCE_WORDS` är varan en sås eller smaksättare: "Senap grov", "Ketchup Heinz", "Peppar svart hel", "Buljong grönsak", "Soja japansk" och "Senap med honung". Undantag: "con" ("Chili con carne" är en rätt).
  - Delen före ett kommatecken prövas också: "Senap, söt", "Peppar, svart".
  - Ett bindeord före sista ordet (" i ", " med ", " och ", " & ", " con ") stoppar regeln om sista ordet: "Makrill i tomatsås", "Bönor i tomatsås", "Krossade tomater med basilika" och "Kidneybönor i chilisås" är Skafferi. Snacks med smaken sist är också Skafferi: "Chips dill", "Jordnötter chili", "Nötmix salt", "Cashewnötter salt" och "Popcorn salt" (första ordet slutar på chips, nötter, nötmix, popcorn, ostbågar, kex, crackers, mandlar, pinnar eller snacks).
  - Fler ord: såser, pepparkorn, svartpepparkorn, gurkmeja, kurkuma, koriander, anis, stjärnanis, mirin, miso, teriyaki, vanilj, chiliflingor, kanelstänger, fondkoncentrat, buljongkoncentrat och fänkålsfrö. Mönstret `(lök|vitlök|curry|ingefära|buljong|chili|paprika)s?pulver` (också "ingefärspulver"). Bakpulver och kakaopulver är kvar i Skafferi.
  - Jämförelsen bortser från diakritiska tecken på båda sidor, så "Sojasas" träffar "sås".
  - Den skrivna avdelningen prövas före `toSection`: en kategoris eget namn ("Mejeri & ägg", "Kött, fisk & chark", "Såser & smaksättare" …) ger den kategorin, och "kryddor", "krydda", "såser", "sås" och "smaksättare" ger Såser & smaksättare. "Skafferi" går fortfarande genom regeln för såser.
  - `compareCategories` sorterar en okänd kategori sist. Parametrarna tar nu också `string`.
  - Tabelltestet har alla fallen ovan (108 namn).
- Byggstenarna:
  - `ListGroup` har `role="list"`, eftersom VoiceOver i Safari tappar listan när `list-style` är `none`.
  - `CategoryHeader`: valfri `level` (2, 3 eller 4, standard 2); en okänd kategori får Övrigts platta i stället för ett fel; antalet blir ett heltal på minst 0; antalet är också rubrikens beskrivning (`aria-describedby`), så det hörs när man går mellan rubriker; emojins storlek är token `--tile-icon` (17 px, `text-tile-icon`), som `sizes.test.ts` kontrollerar.
  - `ListRow`: raden under får två rader med "…" (`line-clamp-2`) i stället för en; den visas för allt utom `null`, `undefined` och `""`, så 0 syns; ett tomt `href` ger vanlig text; valfria `srStatus` (till exempel "i korgen", bara för skärmläsare) och `pressRef`; `pressProps` tar också `aria-expanded`, `aria-controls`, `aria-current`, `aria-label` och `prefetch` (bara för länkar); kontrollerna till vänster och höger ritar fokusramen inuti sig.
  - `TrashButton`: `aria-labelledby` och `title` går inte att skicka in; fokusramen ritas inuti knappen; ett andra tryck på någon soptunna inom 400 ms (`trashPressGuardMs`) räknas inte, eftersom nästa rads soptunna glider upp under fingret och tar bort utan fråga. `onPress` får soptunnan som argument, vilket är bakåtkompatibelt.
  - Ny `focusAfterRemoval(soptunnaEllerRad, root?)`: fokus till nästa soptunna, annars den föregående, annars listans rubrik, annars sidans `h1`. En rubrik får `tabindex="-1"` och fokuseras nästa bildruta, när raden och en tömd kategori är borta.
  - `Meter`: Infinity ger 1 och andra icke-ändliga värden 0; spåret får en ram och fyllningen systemets markeringsfärg i tvingade färger. Den inbyggda bredden står kvar, med en kommentar om att v1 saknar CSP.
- README-mönstret: varje kategori ligger i en vanlig `div`, och bara listan namnges av rubriken, så det blir inget landmärke per kategori. Två rader med samma namn får raden under med i soptunnans namn ("Ta bort Mjölk, Arla"), och exemplet visar `focusAfterRemoval`.
- Kontrasten: statusetiketterna (`mint-ink`, `sky-ink`) och hjärtat (`accent`, `ink-3`) på `--overlay` kontrolleras med plattan lagd över svart och över vitt, i båda lägena. Etiketterna klarar 4,5:1 (minst 6,0:1). Hjärtat är en grafik och prövas mot 3:1 (WCAG 1.4.11): `accent` får 4,1:1 och `ink-3` 3,9:1 i ljust läge över svart, och 4,5:1 skulle kräva en nästan helt täckande platta. Opaciteten står kvar på 92 %.

**Avvikelser från listan:**
- Varningen i `ListRow` (både `onPress` och `href`, eller ett tryckmål utan namn) skrivs alltid, inte bara under utveckling, eftersom `process.env` är förbjudet i `src/` (AD-14). Den skrivs bara när en anropare gör fel.
- Antalet står kvar som dold text i flödet och är dessutom rubrikens beskrivning, så att det inte går förlorat om VoiceOver inte läser beskrivningar.

**Avfärdat:** inget.

**Kontrollerna efter granskningen** (under `scripts/with-test-lock.sh`, med produktionsbygge): `pnpm lint`, `pnpm typecheck` och `pnpm test` (199 filer, 4 090 tester) lyckas, `AI_PROVIDER=mock pnpm build` lyckas och `CI=1 pnpm test:e2e` med `shell`, `smoke`, `pantry` och `shopping` ger 44 av 44. `pnpm test:integration` ger 426 av 427, med samma fel som vid bygget: den lokala databasen har migrationen från 11.2.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- VoiceOver i Safari på komponenterna: rubriken läses som rubrik nivå 2 med antalet, ikonen och mätaren hoppas över, soptunnan läses "Ta bort Gräddfil, knapp".
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: ingen vågrät scroll, och plattorna syns mot bakgrunden i båda lägena.
