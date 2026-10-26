---
title: 'Story 4.2: Stegläge med tänd skärm'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** I köket måste Pontus scrolla i receptvyn med kladdiga händer, och skärmen släcks medan maten puttrar. Hen behöver se ett steg i taget, i stor text och med det som hör till steget, på en skärm som håller sig tänd.

**Approach:** Receptvyn får knappen "Laga nu" (sekundär, bredvid "Lägg på matsedeln"). Den öppnar stegläget i helskärm som en native modal `<dialog>`, med "Steg N av M", stegets receptrader skalade efter valt antal portioner (från 4.1) ovanför stegtexten i 24 px och Föregående och Nästa i tumzonen. Svep och piltangenter byter steg. En hook i `recipes/ui` håller skärmen tänd med Screen Wake Lock. Den släpper låset när stegläget stängs och tar det igen vid `visibilitychange`. När låset inte går att få visas raden "Skärmen kan släckas i den här webbläsaren.". "Stäng" går tillbaka till receptvyn.

## Boundaries & Constraints

**Always:**
- Stegläget ligger i `src/features/recipes/ui/` (AD-1). Det använder samma skalade rader (`scaleLines`, `scaleFactor`) och samma `recipeStatus` som receptvyn i 4.1 (AD-7), och mängderna formateras bara med `formatQuantity` (AD-12).
- En receptrad hör till steget i `stepId` (första användningen, beslut 2026-10-25). Raderna visas i receptets ordning, och ett steg utan rader visar bara texten.
- Stegtexten använder `text-step` (`{typography.step}`, 24 px).
- Föregående och Nästa finns alltid och är minst 44 × 44 px. Föregående på första steget och Nästa på sista är `aria-disabled` och ligger kvar i tabbordningen, som i `Stepper`.
- Svep åt vänster går till nästa steg och svep åt höger till föregående. ArrowRight och ArrowLeft gör samma sak på dator, och Esc stänger.
- "Minska rörelse" stänger av animationen vid stegbyte (`globals.css` fångar redan `prefers-reduced-motion`).
- Wake Lock (AD-18):
  - Låset begärs när stegläget öppnas.
  - Det släpps i effektens cleanup när stegläget stängs eller sidan lämnas.
  - Det begärs igen när `document.visibilityState` blir `visible` medan stegläget är öppet.
  - Om stödet saknas eller begäran nekas visas raden "Skärmen kan släckas i den här webbläsaren." överst, utan felmeddelande och utan `role="alert"`.
- Om lagret inte går att läsa visas raderna utan markering, som i receptvyn.
- Ingen migration och ingen Server Action. Kör aldrig `supabase db reset`.

**Never:**
- Ingen portionsväljare i stegläget.
- Ingen avbockning av steg eller rader, och ingen timer.
- Inget sparat steg mellan öppningar.
- Ingen egen adress för stegläget.
- Ingen omräkning mellan enheter.
- Stegläget skriver aldrig till databasen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna | Receptvyn med 6 portioner (receptet har 4), tryck "Laga nu" | Helskärm med "Steg 1 av N", steg 1:s rader skalade (×1,5) ovanför stegtexten i 24 px, och Föregående och Nästa nederst | N/A |
| Steg utan rader | Inget `stepId` pekar på steget | Bara "Steg N av M" och stegtexten | N/A |
| Rad med mängd | Raden "2 dl grädde" vid 6 av 4 portioner | "3 dl", med bock eller ring, `sky-ink` och "hemma: …" som i receptvyn | N/A |
| Nästa och Föregående | Tryck Nästa på steg 1, sedan Föregående | Steg 2 och sedan steg 1 igen. "Steg N av M" annonseras | N/A |
| Gränser | Steg 1, eller sista steget | Föregående, respektive Nästa, är `aria-disabled` och gör inget | N/A |
| Svep | Svep åt vänster eller höger mer än tröskeln | Nästa eller föregående steg. Ett lodrätt drag scrollar texten | N/A |
| Piltangenter | ArrowRight eller ArrowLeft på dator | Nästa eller föregående steg | N/A |
| Minska rörelse | `prefers-reduced-motion: reduce` | Steget byts utan animation | N/A |
| Wake Lock finns | `navigator.wakeLock.request("screen")` lyckas | Skärmen hålls tänd, och ingen rad visas | N/A |
| Sidan göms och visas | `visibilitychange` till `hidden` och sedan `visible` med stegläget öppet | Låset begärs igen | Lyckas det inte visas raden |
| Stäng | Tryck "Stäng" eller Esc | Låset släpps, och receptvyn visas med samma portioner och fokus på "Laga nu" | Fel vid släpp ignoreras |
| Stängs medan låset begärs | "Stäng" innan `request` har svarat | Låset släpps direkt när det kommer, och ingen rad visas | N/A |
| Stöd saknas | `"wakeLock" in navigator` är falskt | Raden "Skärmen kan släckas i den här webbläsaren." överst, och stegläget fungerar | Inget fel visas |
| Begäran nekas | `request` avvisas (till exempel `NotAllowedError`) | Samma rad | Inget fel visas |
| Inga steg | Receptet har inga steg | "Laga nu" visas inte | N/A |
| Lagret går inte att läsa | Ögonblicksbilden är `null` | Raderna visas skalade utan markering | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-4-context.md` -- Wake Lock, steg och rader, UX
- `src/features/recipes/ui/recipe-view.tsx` och klientdelen från 4.1 -- valt antal portioner, skalade rader, `recipeStatus`, `IngredientRow` och `LineMark` (bryts ut till en egen fil så att stegläget kan använda dem)
- `src/features/recipes/ui/add-to-plan-button.tsx` -- `FixedAction` ska rymma "Lägg på matsedeln" (primär) och "Laga nu" (sekundär)
- `src/features/recipes/domain/saved-recipe.ts` -- `SavedRecipeStep`, `SavedRecipeLine.stepId`
- `src/components/sheet.tsx` -- mönster för native modal `<dialog>` med `showModal`, Esc och fokus tillbaka
- `src/components/swipe-row.tsx` -- mönster för pekarsvep: `swipeSlopPx` (8 px) skiljer svep från scroll
- `src/components/button.tsx`, `fixed-action.tsx`, `icons.tsx` -- knappar och ikoner
- `src/app/globals.css` -- `--text-step`, `prefers-reduced-motion`
- `node_modules/typescript/lib/lib.dom.d.ts` -- `navigator.wakeLock` är typad som att den alltid finns, så stödet kontrolleras med `"wakeLock" in navigator`
- `tests/e2e/support.ts`, `global-setup.ts` -- egen e2e-användare

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/recipes/domain/cook-steps.ts` (+ test) -- `cookSteps(steps, scaledLines)` ger för varje steg dess text och raderna med `stepId === step.id` i receptets ordning. Rader utan steg, eller med ett `stepId` som inte finns, hamnar inte i något steg. Ren funktion -- FR-21
- [ ] `src/features/recipes/ui/use-wake-lock.ts` (+ test) -- `useWakeLock(active)` ger `{ unavailable: boolean }`. Hooken begär låset när den blir aktiv, släpper det i cleanup och begär det igen vid `visibilitychange` till `visible`. Den hanterar svar som kommer efter cleanup, och saknat stöd eller nekad begäran ger `unavailable` -- AD-18
- [ ] `src/features/recipes/ui/cook-mode.tsx` (+ test) -- native modal `<dialog>` i helskärm med `aria-label` "Stegläge: <titel>":
  - överst eventuellt raden om Wake Lock, "Stäng", receptets titel och "N portioner" som metadata;
  - "Steg N av M" i en live-region, stegets `IngredientRow`-rader och stegtexten i `text-step`;
  - Föregående (sekundär) och Nästa (primär) i tumzonen innanför säkerhetsmarginalen;
  - svep med slop och tröskel, ArrowLeft och ArrowRight, Esc och "Stäng", fokus tillbaka till "Laga nu";
  - animationen vid stegbyte går bara utan "Minska rörelse"
  -- FR-21, UX-DR12
- [ ] `src/features/recipes/ui/recipe-view.tsx`, klientdelen, `add-to-plan-button.tsx` -- `FixedAction` med "Lägg på matsedeln" (primär) och "Laga nu" (sekundär) i en rad som bryts vid stor text. "Laga nu" visas också utan `addToPlan` men inte utan steg. Stegläget öppnas alltid på steg 1 med valt antal portioner -- FR-20, FR-21
- [ ] `src/features/recipes/ui/*.test.tsx` -- öppna och stänga, "Steg 1 av N", rader per steg och skalade, steg utan rader, gränserna, piltangenter, svep (pekarhändelser), Esc, fokus tillbaka. Wake Lock testas med en fejkad `navigator.wakeLock`: begäran, släpp vid stängning, ny begäran vid `visibilitychange`, raden vid saknat stöd och vid nekad begäran, och svar efter stängning -- matrisen
- [ ] `tests/e2e/cook-mode.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-steglage@matkoll.test`. Testet seedar ett recept med steg och kopplade rader, väljer portioner och trycker "Laga nu". Det ser "Steg 1 av N" och skalade rader, byter steg med Nästa, Föregående och piltangenter och stänger. Wake Lock stubbas med `page.addInitScript`: en körning registrerar begäran och släpp, och en körning utan stöd visar raden -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): stegläget är en modal `<dialog>` i receptvyn, utan egen adress.** Valt antal portioner och scrollpositionen finns kvar när stegläget stängs. Dialogen ligger i toppskiktet, ovanför flikfältet och `FixedAction`, och sidan bakom blir inert. Webbläsarens bakåt lämnar receptet som vanligt. Alternativ: `/recept/[id]/laga?portioner=6`, som gör att bakåt stänger stegläget men kräver att portionerna går via adressen.
- **Beslut (förslag): rader utan steg visas inte i stegläget.** Det gäller rader utan `stepId` och rader vars steg har tagits bort, så att `step_id` är null. De syns i receptvyn innan Pontus trycker "Laga nu". Alternativ: visa dem på steg 1 under "Övriga ingredienser", vilket krockar med att ett steg utan kopplade rader bara visar texten.
- **Beslut (förslag): stegraderna ser ut som i receptvyn.** De har bock eller ring, mängd i `sky-ink` när den saknas och "hemma: …", eftersom EXPERIENCE.md listar Ingrediensrad under stegläget. Texten är `body`, inte 24 px. Bara stegtexten är 24 px.
- **Beslut (förslag): Wake Lock:**
  - Stödet kontrolleras med `"wakeLock" in navigator`, eftersom TypeScript typar `navigator.wakeLock` som att den alltid finns.
  - Saknat stöd och en nekad begäran visar båda raden. Raden döljs när ett senare försök lyckas.
  - Om systemet släpper låset medan sidan är synlig (händelsen `release`, till exempel vid strömsparläge) görs inget nytt försök förrän nästa `visibilitychange`. Raden visas inte då.
  - Inget loggas, eftersom det inte är ett fel.
  - Raden är text i `meta` och `ink-2` utan ikon, inte en blå `Notice`, eftersom EXPERIENCE.md säger "Visas inte som fel".
- **Beslut (förslag): svep.** Ett pekardrag som först rör sig mer än `swipeSlopPx` (8 px) vågrätt än lodrätt räknas som svep. Ett drag på minst 48 px (eller 20 % av bredden, det som är minst) byter steg. Ett lodrätt drag lämnas till sidans scroll, så att en lång stegtext går att läsa. Svepet sker över stegets innehåll, inte över knapparna.
- **Beslut (förslag): Föregående och Nästa blir `aria-disabled` vid gränserna** i stället för att Nästa byter till "Klar" på sista steget. "Stäng" är den enda vägen ut. Alternativ: "Klar" på sista steget, som också stänger.
- **Beslut (förslag): stegläget öppnas alltid på steg 1** och minns inte var Pontus var. Det följer kriteriet "Steg 1 av N".
- **Beslut (förslag): "Laga nu" visas inte när receptet saknar steg.** Ett stegläge utan steg har inget att visa.
- **Beslut (förslag): rubrik och tillgänglighet.**
  - Dialogen heter "Stegläge: <titel>".
  - Överst står titeln och "6 portioner" som metadata.
  - "Steg N av M" ligger i en live-region (`aria-live="polite"`) och annonseras vid varje byte.
  - När stegläget öppnas får "Steg N av M"-rubriken fokus, och när det stängs går fokus tillbaka till "Laga nu".
  - Animationen vid stegbyte är en kort övergång (högst 200 ms) som `prefers-reduced-motion` nollar.
- **Beslut (förslag): "Lägg på matsedeln" och "Laga nu" ligger bredvid varandra i `FixedAction`.** "Lägg på matsedeln" tar resten av bredden, som i skiss 2. Med stor text bryts de till två rader. DESIGN.md tillåter en primärknapp per vy, så "Laga nu" är sekundär (`docs/ux/ux-spec.md`).
- Kanten för bakåtsvep i iPhone Safari kan krocka med svep åt höger nära vänsterkanten. Knapparna finns alltid, så det är acceptabelt i v1.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På en iPhone i Safari via https, efter driftsättningen: stegläget håller skärmen tänd i mer än skärmsläckningstiden och tar låset igen efter appbyte. Före driftsättningen läggs kontrollen i `docs/oppna-fragor.md`.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: stegtexten och knapparna får plats utan vågrät scroll, och knapparna ligger i tumzonen innanför säkerhetsmarginalen.
