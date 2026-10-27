---
title: 'Story 11.5: Recept och Matsedel i nytt utseende'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'fbe221d'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-receptbiblioteket-med-sokning-och-favoriter.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-lagga-ratter-pa-matsedeln.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-portioner-och-x-av-y-hemma-i-receptvyn.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/matkoll-mobil.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att hela appen ser ut som i helhetsskissen ("håll den stilen"). Recept och Matsedel visar i dag små bilder i rader. I skissen är recepten kort med stora bilder, och matsedeln visar hur mycket som finns hemma med en mätare.

**Approach:**
- Receptbiblioteket visar receptkort: bilden överst, statusetiketten och hjärtat på bilden, titeln och "35 min · 4 portioner" under. Två kolumner från 1024 px.
- Matsedeln visar rättkort: 56 px bild, titeln, "6 av 8 hemma" och en mätare, och portionsväljaren under.
- "Visa inköpslistan" längst ned i Matsedel.

## Boundaries & Constraints

**Always:**
- Receptkortet används överallt där Receptrad används i receptbiblioteket och för AI-förslag. Arket "Lägg till rätt" behåller den kompakta Receptraden, eftersom arket ska rymma många recept.
- Bilden är `RecipeImage` i full bredd och `card-image` hög, med `object-cover` och platshållaren i mint för ett recept utan bild eller med en bild som inte laddas.
- Statusetiketten ("Kan lagas nu" eller "Saknar 2 varor", som förut) ligger nere till vänster på bilden och hjärtat nere till höger, båda på en platta i `overlay`. Utan läst lager visas ingen etikett, som förut.
- Ett tryck var som helst på kortet öppnar receptet (länken sträcks över kortet som i dag). Hjärtat ligger ovanför länken, har tryckytan 44 × 44 px, växlar favorit och navigerar aldrig.
- AI-förslagens kort har AI-etiketten (sand) i stället för statusetiketten och inget hjärta, som förut.
- Rättkortet: `RecipeImage` på `dish-thumb` med `rounded-md`, titeln, raden "6 av 8 hemma" (`atHomeSummaryText`, AD-7), eller "Allt finns hemma" när allt finns, och `Meter` (liten) med andelen. Status står alltid som text. Portionsväljaren står under, och ändrade portioner räknar om status och mätare direkt som förut.
- En borttagen rätt (`recipe_id` null) visar "Borttaget recept" som förut, utan mätare.
- Svep och "Ta bort" på en matsedelsrätt med "Ångra" fungerar som förut.
- "Visa inköpslistan" är en sekundärknapp längst ned i Matsedel, under "Lägg till rätt", som går till Inköpslistan. Den visas bara när matsedeln har rätter.
- "Föreslå rätter med AI" står kvar som förut, utan gnistor.
- Recept: en kolumn under 1024 px, två kolumner från 1024 px inom `content-max`.
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och tangentbord. Mätaren är dold för skärmläsare.
- E2E-specen har den egna e2e-användaren `e2e-utseende-recept@matkoll.test`.

**Never:**
- Ingen ändring av lagningsstatusen, rangordningen, favoriterna eller hur portioner sparas.
- Inga gradienter eller skuggor på bilderna. Plattan under etiketten och hjärtat är `overlay`, inte en skugga.
- Inget antal varor på "Visa inköpslistan" (utanför Epic 11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recept med bild | Korv stroganoff, allt finns hemma, inte favorit | Kort med bilden, "Kan lagas nu" nere till vänster, tomt hjärta nere till höger, titeln och "15 min · 4 portioner" | N/A |
| Saknar varor | Kycklinggryta saknar 2, favorit | "Saknar 2 varor", fyllt hjärta | N/A |
| Utan bild | Ett recept utan `image_url` | Platshållaren i mint i full bredd | N/A |
| Bilden laddas inte | 404 från receptsajten | Platshållaren | N/A |
| Öppna | Tryck på titeln eller bilden | Receptvyn | N/A |
| Hjärta | Tryck på hjärtat | Favorit växlar, ingen navigering | Som förut |
| Lager inte läst | Pantry-läsningen misslyckas | Ingen statusetikett | N/A |
| AI-förslag | Tre förslag | Korten har "AI-förslag" och inget hjärta | N/A |
| Dator | 1280 px | Två kolumner | N/A |
| Matsedel | Kycklinggryta 4 portioner, 6 av 8 hemma | Rättkort med 56 px bild, "6 av 8 hemma", mätaren till 75 %, portionsväljaren "4 portioner" | N/A |
| Allt hemma | Korv stroganoff | "Allt finns hemma", full mätare | N/A |
| Ändra portioner | + på Kycklinggryta | 5 portioner, "5 av 8 hemma" om en vara inte räcker längre, mätaren följer | Som förut |
| Borttaget recept | `recipe_id` null | "Borttaget recept", ingen mätare | N/A |
| Visa inköpslistan | Tryck | Inköpslistan | N/A |
| Tom matsedel | Inga rätter | "Ingen rätt på matsedeln än." och "Lägg till rätt", ingen "Visa inköpslistan" | N/A |
| VoiceOver | Rättkortet | "Kycklinggryta", "6 av 8 hemma", portionsväljaren; mätaren hoppas över | N/A |
| 200 % text | 375 px | Titeln radbryts, etiketten och hjärtat står kvar på bilden, ingen vågrät scroll | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md`
- `mockups/matkoll-mobil.html` -- Recept och Matsedel
- `src/features/recipes/ui/recipe-row.tsx`, `recipe-list.tsx`, `library.tsx`, `recipe-status-badge.tsx`, `favorite-button.tsx`, `ai-suggestions.tsx`, `add-to-plan-button.tsx`
- `src/features/mealplan/ui/meal-plan-list.tsx`, `add-dish-sheet.tsx`
- `src/features/mealplan/domain/meal-plan.ts` (`dishStatus`)
- `src/features/pantry/domain/recipe-status.ts` (`recipeStatus`, `atHomeSummaryText`)
- `src/components/recipe-image.tsx`, `badges.tsx`, `heart-toggle.tsx`, `stepper.tsx`, `meter.tsx` (11.1), `button.tsx`
- `tests/e2e/` -- specar som letar efter receptraden eller matsedelns statusetikett

## Tasks & Acceptance

**Execution:**
- [x] `src/features/recipes/ui/recipe-card.tsx` (+ test) -- receptkortet enligt Boundaries, med plattan `overlay` för etiketten och hjärtat -- UX-DR26
- [x] `src/features/recipes/ui/recipe-list.tsx`, `library.tsx`, `ai-suggestions.tsx` (+ tester) -- korten och två kolumner från 1024 px. `recipe-row.tsx` står kvar för arket "Lägg till rätt"
- [x] `src/features/mealplan/domain/meal-plan.ts` (+ test) -- `dishProgress(status)`: `{ text, value }` med "6 av 8 hemma", "Allt finns hemma" och andelen -- FR-13
- [x] `src/features/mealplan/ui/meal-plan-list.tsx` (+ test) -- rättkortet och "Visa inköpslistan" -- UX-DR26
- [x] Befintliga e2e-specar -- uppdatera de som är beroende av receptradens eller matsedelns utseende
- [x] `tests/e2e/recipes-look.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-recept@matkoll.test`: kortet med etikett och hjärta, att hjärtat inte navigerar, två kolumner vid 1280 px, rättkortet med "6 av 8 hemma" och portionsväljaren, och "Visa inköpslistan"
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given Recept och Matsedel vid 375 px i ljust och mörkt läge, when de jämförs med `mockups/matkoll-mobil.html`, then har de samma uppbyggnad (skärmbilder utanför repot, i granskningen).

## Implementation Notes

- **Beslut (förslag): portionsväljaren står kvar i rättkortet.** Skissen visar bara "4 portioner", men FR-13 kräver att portionerna går att ändra, och ett ark vore ett extra steg.
- **Beslut (förslag): "Visa inköpslistan" utan antal.** Antalet skulle kräva att listan räknas fram också i Matsedel.
- **Beslut (förslag): Receptraden står kvar i arket "Lägg till rätt",** där många recept ska rymmas och favoriterna ska nås med två tryck (SM-4).
- **Risk: bilder från receptsajter är olika stora.** `object-cover` och fast höjd. Bilderna laddas fortfarande utan referrer (AD-15).
- **Risk: kontrast på etiketten.** Plattan i `overlay` gör texten läsbar på alla bilder. Kontrollera i mörkt läge.

## Spec Change Log

### Vid bygget

- **Byggd på `fbe221d`** (`baseline_commit`): Epic 11 med granskningsrättelserna för 11.1 och Story 11.6 och 11.2. Storyn påbörjades på `a566fa1` och flyttades upp två gånger. Den sista gången kom 11.2 med, och konflikterna var bara listor (beslutsloggen och e2e-användarna).
- **Besluten (förslag) är godkända som de står:** portionsväljaren står kvar i rättkortet, "Visa inköpslistan" har inget antal, och arket "Lägg till rätt" behåller sina kompakta rader.
- **`recipe-row.tsx` togs bort i stället för att stå kvar.** Arket "Lägg till rätt" har haft egna rader (`dish-choice`, knappar som lägger till rätten) sedan 3.1 och har aldrig använt `RecipeRow`. Efter bytet till receptkort använde ingen filen. Arket är oförändrat. E2E- och komponenttesterna letar nu efter `recipe-card` i stället för `recipe-row` (`library`, `cookable`, `pantry-status`, `site-status`, `ai-suggestions` och `app-install` från 11.6).
- **`RecipeCard`** (`recipes/ui/recipe-card.tsx`) tar `title`, `imageUrl`, `meta`, `href?`, `badge?`, `favorite?` och `children`. Utan `href` är titeln ett `h3` och kortet ingen länk, som AI-förslagen behöver. Texten står först i koden och bilden överst med `order-first`, så VoiceOver läser titel, tid, status och sist "Favorit, av, knapp". Länken är utsträckt över kortet med `after:z-1`, och hjärtat ligger över den med `z-10`. Etiketten ligger under länken, så ett tryck på etiketten öppnar receptet. Playwright vägrar klicka på ett element som täcks av länken, så e2e-testet trycker på etikettens plats med musen.
- **`StatusBadge` fick `onImage`** (statusfärgen som text på `bg-overlay`), och `RecipeStatusBadge` skickar vidare det. AI-etiketten står kvar i sand på bilden. Kontrasttestet för plattan kom med granskningsrättelserna för 11.1 och täcker etiketterna (4,5:1) och hjärtat (3:1). Min egen version av testet slängdes vid rebasen.
- **AI-förslagen är receptkort** med platshållaren i mint (de har ingen bild), AI-etiketten på bilden, inget hjärta och ingen länk. "Med: …" och "Spara" står under tiden. (Granskningen gav dem en kort remsa och etiketten före "Spara", se Review Triage Log.)
- **Rättkortet:** "6 av 8 hemma" eller "Allt finns hemma" (`dishProgress`) och `Meter` (liten). Statusetiketten "Kan lagas nu"/"Saknar N varor" finns inte längre i rättkortet. Titeln radbryts utan `line-clamp`, eftersom textkolumnen är smal. (Granskningen ändrade raden till "35 min · 6 av 8 hemma" och regeln för "Allt finns hemma", se Review Triage Log.)
- **"Lägg till rätt" under rätterna är nytt.** Specen och EXPERIENCE.md sätter "Visa inköpslistan" under "Lägg till rätt", men knappen fanns tidigare bara som "+" i rubriken och i den tomma matsedeln. Nu står en primärknapp i full bredd (`AddDishButton` fick `fullWidth`) och under den sekundärlänken "Visa inköpslistan" till `/lista`. `meal-plan-content.test.tsx` klickar nu på "+" i rubriken, eftersom två knappar heter "Lägg till rätt".
- **200 % text (187 px) i delade komponenter** (granskningen ändrade `PageHeader` och `Stepper` igen, se Review Triage Log):
  - `PageHeader` bryter raden (`flex-wrap`, `ml-auto`), så "Tidigare" och "+" eller "+" och kugghjulet hamnar på en egen rad i stället för att ge vågrät scroll. Det gällde redan före storyn.
  - `Stepper` blir aldrig bredare än sin behållare. − och + har `shrink-0` och är alltid 44 × 44 px. Värdet har sin minsta bredd på 96 px från 22rem bredd, så vid 375 px är portionsväljaren exakt som förut (mätt till 184 px). Under 22rem får värdet radbrytas ("4 / por / tio / ner"), vilket inte är vackert men går att läsa.
  - Rättkortets nedre rad bryts, och "Ta bort" hamnar under portionsväljaren. Allt mättes i webbläsaren före och efter.
- **Kontrollerna på `fbe221d`:** `pnpm lint`, `pnpm typecheck` och `pnpm test` (214 filer, 4 372 tester) lyckas. `pnpm test:integration` ger 455 av 455. `AI_PROVIDER=mock pnpm build` och sedan `CI=1 pnpm test:e2e` ger 275 av 275 för hela sviten. Integration och e2e kördes under `scripts/with-test-lock.sh`. Storyn ändrar ingenting i databasen.
- **Skärmbilder** av Recept och Matsedel vid 375 px, 1280 px och 187 px, i ljust och mörkt läge, togs med en tillfällig Playwright-spec (inte incheckad) och sparades utanför repot. Uppbyggnaden är skissens: kort med bilden överst, etiketten nere till vänster och hjärtat nere till höger, och rättkort med bild, "6 av 8 hemma", mätare och portionsväljare. Skillnader mot skissen enligt specen: inget antal på "Visa inköpslistan", inga gnistor, och statusen heter "Kan lagas nu" som förut, inte "Allt finns".

## Review Triage Log

Iteration 1. Två granskare. Grenen fick först `origin/epic/11-nytt-utseende` (`56cb2bf`, med 11.3) genom en sammanslagning, och konflikterna var bara listor. Rättelserna ligger i en egen commit.

**Patch:**
- Delade komponenter:
  - `PageHeader`: rubriken har `flex: 1 1 min-content`, `max-w-full` och `min-w-0`, och raden har `gap-y-2`. Knapparna flyttas till en egen rad bara när rubrikens längsta ord och knapparna inte får plats bredvid varandra. Annars radbryts rubriken mellan orden bredvid knapparna. Granskningen föreslog `flex-[1_1_12rem]`, men vid 375 px fick "Matsedel" med "Tidigare" och "+" då inte plats, och knapparna hamnade på en egen rad. E2E-testet sätter en lång rubrik vid 375 px och 100 % text och kontrollerar att "Tidigare" står kvar på rubrikens rad.
  - `Stepper`:
    - Bredden är alltid 11.5rem (184 px) med `max-w-full`, oberoende av fönstret.
    - Den är en storlekscontainer (`@container`). Under 11rem visas bara siffran, och hela värdet ("4 portioner") läses från ett visuellt dolt `output`.
    - Ord bryts aldrig mitt i (`break-normal`).
    - Gränsen blev 11rem i stället för 10rem, eftersom "4 portioner" annars bröts på två rader i förhandsgranskningen (172 px).
    - E2E-testet kontrollerar att + står still över två tryck vid 320 px. Receptvyn och rättkortet vid 187 px kontrolleras också.
    - Förhandsgranskningen mättes med en tillfällig spec: kolumnen "Portioner" fick `min-w-0 max-w-full`, så att portionsväljaren ryms (147 px, bara siffran).
- Matsedel:
  - `dishProgress` säger "Allt finns hemma" när `missingCount` är 0, samma källa som "Kan lagas nu" i biblioteket, så Recept och Matsedel säger aldrig emot varandra. Utan katalogingredienser, eller med räknetal som inte är tal, blir det `null`: bara tiden, ingen mätare.
    - Det finns ett test med en vag rad vars vara inte finns hemma ("Allt finns hemma", som "Kan lagas nu").
    - Ett test kontrollerar skydd mot `NaN`, `Infinity` och negativa tal.
    - När något saknas kan raden aldrig bli "8 av 8 hemma".
  - Orden "N av M hemma" står kvar, som i skissen. Frågan om "hemma" ska betyda "räcker till portionerna" är öppen fråga 20.
  - Tiden står kvar i rättkortet: "35 min · 6 av 8 hemma" (`dishMetaText`). Raden radbryts vid 187 px.
  - "Lägg till rätt" tar fokus vid trycket, eftersom Safari inte flyttar fokus till en knapp vid tryck. Arket ger därför tillbaka fokus till den knapp som öppnade det, "+" eller knappen under rätterna. Det finns ett test för båda.
- Receptkortet:
  - Titeln kapas aldrig (ingen `line-clamp`). E2E vid 187 px har en lång seedad titel och kontrollerar att hela titeln syns.
  - Etiketten håller sig inne på bilden och undan hjärtat: plattan har `max-w-[calc(100%-3.5rem)]`, och texten har `line-clamp-2`. E2E testar med `html { font-size: 200% }`.
  - Typen är en union: ett kort med `href` tar inga `children` (de skulle hamna under den utsträckta länken), och bara ett kort med länk har hjärta. `@ts-expect-error` i testet låser det.
  - AI-kort:
    - AI-etiketten kommer före barnen i koden, så den läses före "Spara".
    - Korten får `imageUrl={null}`, så en adress från modellen laddas aldrig. Ett test har en sådan adress.
    - Kort utan bild får en kort remsa (`h-16`) med etiketten, i stället för 120 px tom mint. Ett recept vars bild inte laddas får platshållaren i full höjd, så att kortet inte hoppar.
  - En bild som misslyckades före hydreringen (`complete` och `naturalWidth === 0`) ger platshållaren. `RecipeImage` gjorde det redan, och nu finns ett test.
  - Test av `alt=""`, `loading="lazy"` och `decoding="async"`.
  - Hjärtats fokusram ritas inuti plattan (`-outline-offset-4`), så den syns på alla foton. `accent` mot plattan når 3:1 enligt kontrasttestet.
  - Kontrast: epicens kontrasttest kontrollerar redan `mint-ink` och `sky-ink` mot `--overlay` över svart och vitt foto i båda lägena. Det nya `src/components/badges.test.tsx` låser att `onImage` använder just de paren.
- Tester: `recipes-look.spec.ts` tömmer `shopping_check`, `shopping_custom_item`, `shopping_line_override` och `meal_plan_recipe` före `meal_plan`, som kommentaren säger.

**Utanför storyn (noterat):**
- I förhandsgranskningen vid 187 px går ingrediensknappen ("Matlagningsgrädde, byt ingrediens") 10 px utanför arket. Det gällde före storyn och rör inte portionsväljaren.
- I receptvyn vid 187 px skriver en lång ingrediens över mängden ("Kokosmjölk" och "4 dl"). Ingrediensraden ändras inte i storyn.
- Efter sammanslagningen med 11.4 (`b58da78`, ny `FixedAction`) togs skärmbilder av receptvyn vid 375 px och 187 px och med rottexten 200 %, i ljust och mörkt läge. Knappen "Lägg på matsedeln" står ovanför flikfältet och täcker inte slutet av sidan, och ingen vy scrollar i sidled.

**Kontrollerna på `b58da78`** (sammanslagen): `pnpm lint`, `pnpm typecheck` och `pnpm test` (219 filer, 4 468 tester) lyckas. `pnpm test:integration` ger 455 av 455. `AI_PROVIDER=mock pnpm build` och sedan `CI=1 pnpm test:e2e` ger 293 av 293 för hela sviten. Integration och e2e kördes under `scripts/with-test-lock.sh`.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: bläddra i recepten och tryck på hjärtat på ett kort. Receptet ska inte öppnas.
- VoiceOver: kortet läses med titel, tid och status, och "Favorit, av, knapp".
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: ingen vågrät scroll.
