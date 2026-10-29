---
title: 'Story 1.15: Import sparas direkt'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/main'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-6-receptimport-i-bakgrunden.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-13-spara-i-matkoll.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-importera-recept-fran-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-16-1-spara-fran-forslagen.md'
---

## Intent

**Problem:** Pontus tryckte på bokmärket Spara i Matkoll på ett recept på koket.se. Importjobbet (Story 12.6) blev klart, märket "1" kom på Recept, men när han öppnade Recept försvann märket utan att något visades: ingen förhandsgranskning, ingen bekräftelse, inget kort. Det inlästa receptet var i praktiken förlorat. Pontus: "det känns som ett onödigt steg. det borde väl landa direkt i recept. är det fel så måste jag ju ändå göra om."

**Grundorsak:** Märket döljs på den flik Pontus står på (`tab-badge`), men ett klart importjobb visades bara om arket Importera recept var öppet på just det jobbet eller via "Visa" i den korta bekräftelsen; stod Pontus redan på Recept, eller missade bekräftelsen, fanns inget som tog fram resultatet, och jobbet låg kvar `done` och osett.

**Approach:** Importen sparar själv. När jobbet är klart sparar det receptet med förhandsgranskningens förval, och appen säger "Receptet <titel> är sparat" med "Öppna" och "Ångra". Förhandsgranskningen i importarket tas bort. Klara jobb som aldrig sparades tas om hand när appen öppnas.

## Ändringar

- `src/app/api/ai/jobs/start-import.ts`: efter `importRecipe` anropas `saveRecipe(draft, job.id)`. Receptets id är jobbets id, så `save_recipe` (som redan returnerar ett sparat recept med samma id) gör en omkörning, en dubbelavläsning eller en ny försök-igen idempotent. Resultatet får `savedRecipeId` (`recipeImportSchema`). Misslyckas sparandet ligger utkastet kvar i resultatet utan `savedRecipeId`.
- Förvalen är exakt de förhandsgranskningen hade: `saveRecipe` tar utkastet som det är, med katalogens träffar och förslagen för nya ingredienser (avdelning, plats, enhet) via `commitIngredients`. Ingen ny logik.
- `src/features/recipes/ui/saved-imports.tsx` (ny), monterad i `(app)/layout.tsx` inuti `AiJobsProvider`: ser varje klart, osett importjobb (även ett som blev klart medan appen var stängd). Saknas `savedRecipeId` sparas utkastet i webbläsaren via `saveRecipe(draft, jobbets id)`; går även det fel visas ett larm och jobbet ligger kvar till nästa öppning. Därefter stängs jobbet och bekräftelsen visas: "Öppna" går till receptet (där "Ändra recept" finns), "Ångra" anropar `deleteRecipe` och säger "Receptet är borttaget.". En ref per flik hindrar att samma jobb tas två gånger (Strict Mode, polling).
- `ImportFailures` (samma fil), på Recept: ett misslyckat importjobb blir ett kvarstående meddelande med orsaken och "Stäng" (`dismiss`). Inget sparas. Den korta bekräftelsen "Det gick inte att läsa receptet." med "Visa" finns kvar.
- `ai-jobs-provider.tsx`: ett klart importjobb ger ingen "är inläst"-bekräftelse längre (den ersätts av "är sparat").
- `import-sheet.tsx`: ingen förhandsgranskning, ingen "Spara recept", ingen "Släng ändringarna" för ändrad förhandsgranskning (kvar bara för inklistrad text vid "Öppna inställningar"). När jobbet arket väntar på blir klart stängs arket. Fel visas i fliken som förut. "Visa" på ett misslyckat jobb öppnar arket med felet.

## Beslut

- **Alla importkällor sparar direkt** (länk, bokmärke/delning, inklistrad text, foto), för enhetlighet: en regel, och Pontus kan ändra efteråt med "Ändra recept" (Story 1.11) från "Öppna" eller receptsidan. Förhandsgranskningskomponenten `RecipePreview` används kvar av Ändra recept och AI-förslagen.
- **Ingen migration:** jobbets id som receptets id ger idempotensen, och `savedRecipeId` ligger i jobbets resultat (`jsonb`). `ai_job` är orörd.
- Ångra raderar receptet med den befintliga `deleteRecipe`; katalogens nya ingredienser blir kvar (som vid vanlig radering).
- Förlorade jobb (t.ex. Pontus från 19:13) sparas globalt när appen öppnas, inte bara på Recept, med samma väg och samma bekräftelse.
- E2E: importproven använder en egen användare, `e2e-import@matkoll.test` (`importEmail`), eftersom en lyckad import nu skriver recept och huvudanvändarens bibliotek måste förbli tomt. Förhandsgranskningsprov (redigera före sparande, byt ingrediens, "Släng ändringarna") i `import.spec.ts` och `recipe.spec.ts` togs bort; samma formulär täcks av `recipe-edit.spec.ts`. Nya prov: text sparas direkt med katalogens träffar och nya ingredienser, `?url=` ger sparat recept med Öppna/Ångra, "Ångra" tar bort det, ett klart osparat jobb sparas vid öppning, ett misslyckat jobb ger kortet och sparar inget.
- Kontrollerat mot `pnpm dev` (Strict Mode): ett enda jobb och ett enda recept från `?url=`.

## Review Triage Log

Ingen separat granskning: ingen migration, ingen ny åtkomst. `pnpm test:integration` kördes inte: inga tabeller, funktioner eller Server Actions ändrades (`saveRecipe` är oförändrad och exporteras bara även från `recipes/server`).

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `AI_PROVIDER=mock pnpm build`, och e2e `import`, `ai-import-jobs`, `recipe`, `library`, `settings`, `recipe-edit`, `core-flow`, `pantry-status`, `ai-jobs`, `site-list`.
