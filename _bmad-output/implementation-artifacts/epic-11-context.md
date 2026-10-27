# Epic 11 Context: Nytt utseende

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Tillägg till 1.1. Matkoll ska se ut och kännas som en välgjord app i mobilen. Pontus egna ord, 2026-10-26: "betydligt trevligare ux. Som ser proffsigare ut." Pontus godkände tre skisser, och de är målet:

- `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/lagersaldo.html`: "ja mycket snyggare enl din skiss";
- `mockups/inkopslista.html`: "inköpslistan börjar bli mkt bättre";
- `mockups/matkoll-mobil.html` (Recept, Matsedel, Inköpslista, Lagersaldo och appen på hemskärmen): "ja nu börjar du verkligen hitta ux som app. bravo. håll den stilen".

Pontus önskemål i Pontus egna ord:

- lagervaror i kategorier, "Kanske protein, mejeri, grönsaker osv. Du får vara lite kreativ. Kanske nån ikon.";
- "ta bort mängd i listan. jag kommer inte använda den tror jag. men fyll på med mer info om du har ngn";
- "en soptunna på varje iaf som raderar utan kontrollfråga";
- inköpslistan "behöver också lyftas";
- "gör hela look and feel som det kommer se ut i mobilen".

Skisserna är ritade med hårdkodade värden och påhittade varor. `DESIGN.md` och `EXPERIENCE.md` gäller när de inte stämmer överens med en skiss.

Det motsvarar UJ-9 och Flöde 9 i EXPERIENCE.md, och kraven FR-40–FR-44 och NFR-12 i PRD-addendumet ("Tillägg till 1.1: Nytt utseende"). Kursändringen står i `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-nytt-utseende.md`.

Epicen byggs efter Epic 10. Story 10.4 har då bytt namn på "Hemma" till "Lagersaldo" och "Lista" till "Inköpslista" och gett katalognamnen stor första bokstav, och 10.2 har lagt "Senaste foto … Visa" under kameraknappen. Rutterna (`/hemma`, `/lista`) är desamma som efter 10.4.

Epicen bygger på det som redan finns:

- tokens i `src/app/globals.css` och testerna i `tests/design/` (`contrast.test.ts`, `no-hex.test.ts`, `tokens.ts`);
- komponenterna i `src/components/` (`toast.tsx` med "Ångra" i 5 s, `check-circle.tsx`, `fixed-action.tsx`, `search-field.tsx`, `recipe-image.tsx`, `badges.tsx`, `heart-toggle.tsx`, `stepper.tsx`, `swipe-row.tsx`, `icons.tsx`, `app-shell/`);
- avdelningarna (`catalog/domain/sections.ts`) och normaliseringen (`normalize.ts`);
- borttagningen med "Ångra" i Lagersaldo (`pantry/ui/pantry-removal.tsx`, `remove_pantry_item`, `restore_pantry_item`, Story 2.3) och tömningen och inventeringen (`pantry_removal`, Epic 6);
- lagerförslagens etiketter (`labels`, Story 6.5);
- inköpslistans gruppering och texter (`shopping/domain/list-text.ts`, `compute-list.ts`), produktvalen (Story 7.2) och raden "Lager" (8.5);
- lagningsstatusen och "X av Y hemma" (`pantry/domain/recipe-status.ts`, Story 4.1);
- inloggningen med engångslänk (`auth`, `auth/confirm`, AD-3).

## Stories

- Story 11.1: Gemensam grund för nytt utseende
- Story 11.2: Märke och tid på lagervaror
- Story 11.3: Lagersaldo i nytt utseende
- Story 11.4: Inköpslistan i nytt utseende
- Story 11.5: Recept och Matsedel i nytt utseende
- Story 11.6: Matkoll på hemskärmen

## Bindande beslut

- **Kategorierna är en visningsregel och sparas aldrig.** `displayCategory(section, name)` i `catalog/domain/categories.ts` är den enda regeln (AD-12). Nio kategorier i butikens ordning: Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck, Övrigt.

  | Avdelning | Kategori |
  | --- | --- |
  | Frukt och grönt | Frukt & grönt |
  | Bröd | Bröd |
  | Mejeri | Mejeri & ägg |
  | Kött och fisk, Chark | Kött, fisk & chark |
  | Frys | Frys |
  | Skafferi | Skafferi, eller Såser & smaksättare när namnet är en sås eller smaksättare |
  | Dryck | Dryck |
  | Övrigt, okänd | Övrigt |

- **Såser & smaksättare** räknas fram ur namnet på en vara i Skafferi: det normaliserade namnet (`normalizeIngredientText`) är ett ord i `SAUCE_WORDS`, eller dess sista ord slutar på ett av dem. Listan börjar med: sås, senap, ketchup, majonnäs, aioli, dressing, vinäger, ättika, soja, buljong, fond, sambal, sriracha, tabasco, pesto, salsa, salt, peppar, krydda, kryddor, kryddmix, curry, paprikapulver, chiliflakes, kanel, oregano, timjan, spiskummin. "Sojasås", "chilisås" och "steaksås" träffar på "sås", "dijonsenap" på "senap", "svartpeppar" på "peppar" och "flingsalt" på "salt". Varor i andra avdelningar flyttas aldrig. Ingen migration, ingen ändring av AI-scheman, promptar eller exporten. En egen avdelning i katalogen är öppen fråga 14.
- **Ikoner och plattor:** emoji i en ljus platta, `aria-hidden`, valda bara i `src/components/category-header.tsx`:

  | Kategori | Ikon | Platta |
  | --- | --- | --- |
  | Frukt & grönt | 🥦 | `mint` |
  | Bröd | 🍞 | `sand` |
  | Mejeri & ägg | 🥛 | `sky` |
  | Kött, fisk & chark | 🥩 | `tile-clay` |
  | Frys | ❄️ | `sky` |
  | Skafferi | 🥫 | `sand` |
  | Såser & smaksättare | 🧂 | `sand` |
  | Dryck | 🥤 | `tile-lilac` |
  | Övrigt | 🛍️ | `border` |

  Plattorna är dekor. Kategorins namn står alltid som text. Emoji används aldrig i texter (AD-17). Flikfältet behåller linjeikonerna.
- **Ingen mängd i Lagersaldos lista.** Mängderna finns kvar i databasen, i arket Lagervara och för lagningsstatusen, inköpslistan och "Kan lagas nu". Inköpslistan behåller mängden.
- **Raden under en lagervara** är märket om det finns, annars "Tillagd …" efter `created_at` i svensk tid: "Tillagd idag", "Tillagd igår", "Tillagd för N dagar sedan" (2–13), "Tillagd 24 okt" (14 dagar eller äldre), "Tillagd 24 okt 2025" (annat år).
- **Märket** (`pantry_item.label`, 1–60 tecken eller `null`) kommer från fotots första etikett när ett förslag bekräftas eller rättas, och från fältet "Märke eller sort" i arket Lagervara. "Lägg i lagret" rör det aldrig.
- **`created_at` betyder "tillagd"** och står kvar när mängden ändras, när raden ersätts (ny enhet eller plats) och efter "Ångra".
- **Soptunnan** tar bort direkt, utan fråga, med "Tog bort Gräddfil." och "Ångra" i 5 s. Svepet tas bort i Lagersaldo. Soptunnan är grå.
- **Avbockade listposter** flyttas direkt till "I korgen" längst ned, som är hopfälld. En bock där tar tillbaka posten.
- **Inget rött, inga skuggor, inga gradienter.** Bilderna i receptkorten är receptens egna bilder.
- **Matkoll på hemskärmen** är samma webbapp: manifest, ikoner, temafärg och `appleWebApp`. Ingen service worker och ingen offline. Inloggning med sexsiffrig kod i samma mejl som länken.

## Requirements & Constraints

- **Kategorier (FR-40):** i Lagersaldo och Inköpslista, med rubrik, ikon och antal. Kategorier utan varor visas inte.
- **Lagersaldo (FR-41):** en rad per lagervara utan mängd, raden under, soptunna, sök i platsen.
- **Märke och tid (FR-42):** se Bindande beslut.
- **Inköpslistan (FR-43):** framstegsraden ("8 varor kvar", "6 av 14 i korgen", mätare), "I korgen", raden under (rätterna med " · ", "Egen vara", "Saknas i lagret" eller "Saknas i <ställe>" för en vag post), produktetiketten, de fasta knapparna i en rad.
- **Recept och Matsedel:** receptkort med bilden överst och statusetiketten och hjärtat på bilden; rättkort med 56 px bild, "6 av 8 hemma" och mätare, portionsväljaren kvar; "Visa inköpslistan" utan antal.
- **Hemskärmen (FR-44):** manifest, ikoner (192, 512, maskable 512, Apple 180), `appleWebApp`, proxyns undantag, tillbakaknappar, kod.
- **Tillgänglighetsgolvet (NFR-12), i varje story:**
  - 375 px och 1280 px, ljust och mörkt läge, 200 % text utan vågrät scroll;
  - VoiceOver och tangentbord, synlig fokusram;
  - tryckytor minst 44 × 44 px;
  - ikoner, plattor och mätare `aria-hidden`, samma sak i text;
  - React Activity: sökningen i Lagersaldo och "Visa" i I korgen står kvar när sidan göms och visas igen; ark stängs när sidan göms, som förut.
- **Allt på svenska.** Inget rött.

## Technical Decisions

- **Moduler (AD-1):**
  - `catalog/domain/categories.ts` (`CATEGORIES`, `Category`, `displayCategory`, `SAUCE_WORDS`), exporteras från `catalog/index.ts`.
  - Komponenter i `src/components/`: `category-header.tsx` (rubrik, platta, ikon, antal), `list-group.tsx` och `list-row.tsx`, `trash-button.tsx`, `meter.tsx`. Ingen data, inga feature-importer, bara tokenklasser.
  - `pantry` äger `label` och alla ändringar i Postgres-funktionerna. `listPantry` ger `label`, `createdAt` och katalogingrediensens `section` (från `catalog.getIngredientNames` eller motsvarande läsning).
  - `shopping/domain/list-text.ts` får texterna för raden under, framstegsraden och korgraden. `groupBySection` ersätts av en gruppering per kategori.
  - `auth` får `verifyEmailCode`.
  - `src/app/manifest.ts`, `icon.tsx`, `apple-icon.tsx`; `src/proxy.ts` (`matcher`).
- **Datamodell (11.2, AD-5, AD-19, AD-20):**
  - `alter table public.pantry_item add column label text` med `check (label is null or (label = btrim(label) and char_length(label) between 1 and 60))`.
  - `set_pantry_items(items jsonb, replace_id uuid default null, site uuid default null)` läser `label` per vara: saknad nyckel står kvar, `null` tar bort och text sätter. Vid `replace_id` får den nya raden den ersattas `created_at` och, om `label` saknas, dess `label`.
  - `apply_pantry_inventory` och `confirmPantrySuggestions`-vägen tar `label`.
  - `restore_pantry_item(item jsonb, site uuid default null)` och `restore_pantry_items(items jsonb)` tar `created_at` och `label` från raden. En `created_at` i framtiden blir `now()`.
  - `pantry_removal.removed_rows` sparar `label` och `created_at`, och `restore_pantry_removal` sätter tillbaka dem. Gamla poster utan dem ger `now()` och `null`.
  - Signaturerna ändras bara bakåtkompatibelt (AD-5): nya fält i `jsonb`, inga nya obligatoriska parametrar.
  - Migrationen skapas med `supabase migration new`. Typerna genereras om med `pnpm db:types`. Kör aldrig `supabase db reset`. Ta en säkerhetskopia av data först och kör `scripts/pantry-site-check.sql` före och efter, som i 8.1 och 10.1.
- **Tokens (11.1, AD-17):** `--tile-clay: #F1E3DD` och `--tile-lilac: #E6E1F2`, i mörkt läge `#3B2C27` och `#2C2840`; `--tile-size: 30px`, `--row-min: 56px`, `--card-image: 120px`, `--dish-thumb: 56px`, `--meter-height: 8px`, `--meter-height-small: 5px`; `--overlay: color-mix(in srgb, var(--surface) 92%, transparent)`. Mappas i `@theme inline`. `tests/design/tokens.ts` och `contrast.test.ts` får de nya värdena.
- **Hemskärmen (11.6, AD-27):**
  - `manifest.ts`: `name` och `short_name` "Matkoll", `description`, `lang: 'sv'`, `start_url: '/recept'`, `scope: '/'`, `display: 'standalone'`, `background_color` och `theme_color` från `themeColors.light` (hex beräknat i `theme-colors.ts`, inte inskrivet), ikonerna.
  - `layout.tsx`: `metadata.appleWebApp = { title: 'Matkoll', capable: true, statusBarStyle: 'default' }`.
  - `proxy.ts`: `matcher` utesluter `manifest.webmanifest`, `icon` och `apple-icon` (med och utan suffix). Ett e2e-test utan kakor visar 200 för dem och omdirigering för `/recept`.
  - Läs `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`, `app-icons.md` och `generate-metadata.md` (`appleWebApp`) före koden. `node_modules` finns i huvudmappen, inte i en worktree.
- **Kod vid inloggning (11.6, AD-3):** `supabase/templates/magic-link.html` får `{{ .Token }}` och texten "Eller skriv in koden i Matkoll: 123456". `verifyEmailCode({ email, code, next })`: Zod (`code` exakt sex siffror), `verifyOtp({ email, token: code, type: 'email' })`, sedan `isAllowedEmail` som i `confirmEmailLink`, annars utloggning och samma fel. Felkoden `auth_code_invalid` med texten "Koden stämmer inte eller har gått ut. Skicka en ny länk." Supabase begränsar antalet försök.
- **Resultat och fel (AD-13):** nya felkoder i `src/lib/errors.ts`:

  | Felkod | Text | Story |
  | --- | --- | --- |
  | `auth_code_invalid` | "Koden stämmer inte eller har gått ut. Skicka en ny länk." | 11.6 |

  Borttagning och "Ångra" använder de felkoder som redan finns (`pantry_remove_failed`, "Det gick inte att ångra.").
- **Rendering (AD-18):** inga nya tabeller i `revalidateFor`. `pantry_item` gäller som förut.
- **Tester:**
  - Vitest bredvid koden: `categories.test.ts` (tabell med minst 40 namn, bland dem alla i `SAUCE_WORDS` och fallgropar som "saltgurka" och "sötpotatis"), tidstexterna, list-texterna, komponenterna (roller, namn, `aria-hidden`).
  - Integrationstester mot lokal Supabase: `label` och `created_at` genom `set_pantry_items`, ersättning, `restore_pantry_item`, `restore_pantry_removal` och RLS.
  - E2E med `AI_PROVIDER=mock`, en e2e-användare per spec, i `e2eEmails` i `tests/e2e/support.ts` och `global-setup.ts`:
    - `e2e-utseende-marke@matkoll.test` (11.2);
    - `e2e-utseende-lager@matkoll.test` (11.3);
    - `e2e-utseende-lista@matkoll.test` (11.4);
    - `e2e-utseende-recept@matkoll.test` (11.5);
    - `e2e-utseende-app@matkoll.test` (11.6).
  - Befintliga e2e-specar som letar efter "Med mängd", "Finns hemma", svepet i Lagersaldo, "från …" eller "Finns hemma?" uppdateras i den story som ändrar texten.
  - Skärmbilder vid 375 px i ljust och mörkt läge sparas utanför repot och jämförs med skisserna i granskningen.

## UX & Interaction Patterns

- **Skisserna** är målet. `DESIGN.md` (Components, Do's and Don'ts) och `EXPERIENCE.md` (Component Patterns, State Patterns) gäller vid konflikt. Följer inte med från skisserna: "Ny"-etiketten, "från fotot", gnistorna på AI-knappen, emoji i flikfältet och den egna ordningen i Lagersaldo.
- **Lagersaldo (11.3):** ställesväljaren, platskorten, kameraknappen och "Senaste foto" som efter Epic 10. Sedan "Sök i kylen", kategorierna med listgrupper, och "Töm kylen" och "Lägg till ställe" längst ned som förut.
- **Inköpslista (11.4):** "Lager: Stugan · Byt" (bara med flera ställen), framstegsraden, kategorierna, "Lägg till egen vara", korgraden och "Dolda poster" som förut, de fasta knapparna.
- **Recept (11.5):** sökfältet, filterpillren och raden "Lager" som förut, sedan korten och "Föreslå rätter med AI" utan gnistor.
- **Matsedel (11.5):** rubriken med "Tidigare", raden "Vecka …" som förut, rättkorten, "Lägg till rätt", "Visa inköpslistan".
- **Texter:** se EXPERIENCE.md, Voice and Tone (Epic 11) och State Patterns.
- **Allmänt:** fel i en blå `Notice`, aldrig rött. Ark staplas aldrig. Synlig fokusram och logisk tabbordning.

## Cross-Story Dependencies

- **Före epicen:** Epic 10 (10.1–10.4) är ihopslagen i `main`. Slå in `main` i `epic/11-nytt-utseende` innan 11.1 börjar.
- **11.1 före allt annat:** kategorierna, tokens och komponenterna. Inget i vyerna ändras utom flikfältets ikoner.
- **11.2 efter 11.1:** migrationen och märket. Lagersaldo ser ut som förut, men arket har fältet "Märke eller sort".
- **11.3 efter 11.2:** Lagersaldo använder kategorierna, komponenterna, märket och tiden.
- **11.4 efter 11.1:** Inköpslistan. Behöver inte 11.2 eller 11.3.
- **11.5 efter 11.1:** Recept och Matsedel.
- **11.6 sist:** hemskärmen och koden. Behöver bara 11.1 för appikonens färger.
- **Gren:** `epic/11-nytt-utseende`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten för Epic 11 följer med i grenen.
- **Efter epicen:** Pontus lägger Matkoll på hemskärmen, provar Flöde 9 och svarar på öppna frågor 14–16.
