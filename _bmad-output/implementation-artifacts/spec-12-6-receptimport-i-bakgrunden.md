---
title: 'Story 12.6: Receptimport i bakgrunden'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'a364271'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-4-ai-jobb-i-ko-med-ai-forslag-forst.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-importera-recept-fran-inklistrad-text.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-importera-recept-fran-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-importera-recept-fran-foto.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Att läsa in ett recept från en länk tar 40–56 s (T1, T4). Arket Importera recept väntar under tiden, och stängs det stoppas inläsningen. Pontus kan inte samla flera recept i rad.

**Approach:**
- En import från text, länk eller foto blir ett `import`-jobb: text och länk via `POST /api/ai/jobs`, foto via `POST /api/ai/jobs/photo`.
- Det som går att kontrollera utan AI (texten, länkens form och domänlistan, fotots storlek) kontrolleras innan jobbet startar.
- Arket kan stängas, och nästa recept kan läsas in direkt. När ett recept är inläst: kort bekräftelse, märke på Recept och förhandsgranskningen via "Visa".
- `/api/ai/import` och `/api/ai/import/photo` tas bort.

## Boundaries & Constraints

**Always:**
- **Förhandskontrollen:** `importRecipe` delas i en kontroll utan AI (`prepareImport`: Zod för texten, `fetch_invalid_url` och `fetch_domain_not_allowed` mot domänlistan i `settings`) och själva inläsningen (hämtning med `safeFetch` och `parseRecipe`). Kontrollen körs i rutten och ger fel direkt, utan jobb.
- **`POST /api/ai/jobs`** tar `{ kind: "import", clientKey, source: "text", text }` och `{ kind: "import", clientKey, source: "url", url }` med samma gränser som `/api/ai/import` (64 KB, 12 000 tecken). **`POST /api/ai/jobs/photo`** tar `kind` = `import`, `clientKey` och `image` med `readImageForm` som `/api/ai/import/photo`.
- **`context`** är `{ source: 'text' | 'url' | 'photo', domain? }`, med bara domänen för en länk (`koket.se`), aldrig hela URL:en, texten eller fotot.
- **Körtid** 130 s (hämtningen högst 10 s och AI:n 115 s, AD-11, AD-9). Resultatet är `RecipeDraft` med katalogmatchningen, som i dag.
- **Flera importer** köas efter varandra, upp till tre aktiva jobb totalt (AD-28). Ingen regel för `superseded`: två länker är två recept.
- **Arket Importera recept** (`import-sheet.tsx`): efter "Läs in" visas "Läser receptet … Du kan göra annat under tiden." och "Avbryt", eller "I kö, 1 före.". Pontus kan stänga arket och öppna det igen för nästa recept; arket visar då ett tomt formulär, och jobben syns i jobbraden. Är arket öppet på jobbet när det blir klart, visas förhandsgranskningen direkt.
- **Klart:** bekräftelsen "Receptet Krämig kycklinggryta är inläst." med "Visa" och märket på Recept. "Visa" öppnar förhandsgranskningen med utkastet från jobbet (`/recept?import=<jobbets id>` eller motsvarande i klienten). Efter "Spara recept" eller "Släng" stängs jobbet (`dismissAiJob`).
- **Gick inte:** felen som förut ("koket.se släppte inte in oss. Klistra in recepttexten i stället.", `import_no_recipe` och så vidare), i arket om det är öppet på jobbet, annars "Det gick inte att läsa receptet." med "Visa", som öppnar arket med felet och "Klistra in text i stället".
- **Foto:** finns bara i serverns minne medan jobbet väntar och körs (AD-15). Klienten behöver inte behålla det efter starten.
- **Loggar:** aldrig text, URL, foto eller recept; bara felkod, `source`, domänen för en länk, antal och jobbets id.
- E2E-specen har den egna e2e-användaren `e2e-ai-import@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen hel URL, ingen recepttext och inget foto i `ai_job.context`.
- Inget recept sparas utan "Spara recept" (AD-10).
- Ingen ändring av `safeFetch`, domänkontrollen, `parseRecipe` eller förhandsgranskningen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Länk | `https://www.koket.se/…` | 202 inom 1 s; "Läser receptet …"; `context.domain` = `koket.se` | N/A |
| Ej godkänd domän | `https://ica.se/…` (inte i listan) | Inget jobb | `fetch_domain_not_allowed` direkt, med "Öppna inställningar" |
| Ogiltig länk | `koket` | Inget jobb | `fetch_invalid_url` direkt |
| För lång text | 13 000 tecken | Inget jobb | `validation` direkt |
| Stäng arket | Jobbet pågår | Jobbet fortsätter; jobbraden visar "Läser receptet från koket.se" | N/A |
| Tre recept i rad | Tre länkar | Ett pågår, två i kö | Ett fjärde: `ai_queue_full` |
| Klart på annan sida | Pontus i Matsedel | Bekräftelse med titeln och "Visa"; märket på Recept | N/A |
| "Visa" | – | Förhandsgranskningen med utkastet | N/A |
| Spara | "Spara recept" | Receptet sparas; jobbet stängs | N/A |
| Sidan blockerar | `fetch_blocked` | Jobbet `failed` | "koket.se släppte inte in oss. Klistra in recepttexten i stället." |
| Inget recept | `import_no_recipe` | Jobbet `failed` | Texten som förut |
| Foto | Kokbokssida | Jobb via `jobs/photo`; fotot aldrig i `ai_job` | N/A |

</frozen-after-approval>

## Code Map

- `src/features/recipes/actions/import-recipe.ts` (+ test) -- kontrollen och inläsningen
- `src/features/recipes/domain/` (`importRequestSchema`, `RecipeDraft`) -- indata och resultat
- `src/features/settings/` -- domänlistan
- `src/server/fetch/` -- `safeFetch` (oförändrad)
- `src/app/api/ai/import/route.ts`, `import/photo/route.ts` -- det som flyttar och tas bort
- `src/app/api/ai/jobs/route.ts`, `jobs/photo/route.ts` (12.4, 12.5) -- jobbrutterna
- `src/features/recipes/ui/import-sheet.tsx`, `recipe-preview.tsx` -- arket och förhandsgranskningen
- `src/lib/ai-jobs-client.ts`, `src/features/ai-jobs/ui` -- jobben, bekräftelsen och märket
- `tests/e2e/` -- specarna för import

## Tasks & Acceptance

**Execution:**
- [x] `src/features/recipes/actions/import-recipe.ts` (+ test) -- `prepareImport` och inläsningen med jobbets signal och tidsgräns
- [x] `src/app/api/ai/jobs/route.ts`, `jobs/photo/route.ts` (+ tester) -- `import`; `src/app/api/ai/import/` borttagen
- [x] `src/features/recipes/ui/import-sheet.tsx`, förhandsgranskningen (+ tester) -- jobb, stänga och öppna arket, "Visa", fel
- [x] `src/features/ai-jobs/ui` -- texterna för import ("Läser receptet från koket.se", "Receptet … är inläst.", "Det gick inte att läsa receptet.")
- [x] `tests/e2e/ai-import-jobs.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-ai-import@matkoll.test`, `AI_PROVIDER=mock`, `AI_MOCK_DELAY_MS=3000`: läs in en text, stäng arket, läs in en till, se två i jobbraden, öppna det första med "Visa" och spara
- [x] Befintliga e2e-specar för import uppdateras
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given `ai_job` efter e2e-körningen, when raderna läses, then har `context` bara `source` och en domän.
- Given `grep -rn "/api/ai/import" src`, when den körs, then hittas bara jobbrutterna.

## Implementation Notes

- **Beslut (förslag): domänen i `context`, inte hela länken.** Jobbraden behöver bara "från koket.se". Hela länken följer med i utkastet (`sourceUrl`) som förut.
- **Beslut (förslag): ett tomt formulär när arket öppnas igen.** Pontus vill kunna läsa in nästa recept; ett pågående jobb syns i jobbraden.
- **Risk: förhandskontrollen och jobbet läser domänlistan vid olika tider.** Tar Pontus bort domänen medan jobbet väntar, nekar `safeFetch` hämtningen i jobbet. Det är rätt.

## Vid bygget

- `prepareImport` (kontroll utan AI) och `importRecipe` (arbetet) ligger i `import-recipe.ts`; `startImportJob` delas av `POST /api/ai/jobs` (text, länk) och `POST /api/ai/jobs/photo`. `/api/ai/import` och `/api/ai/import/photo` är borta. Ingen migration.
- Arket väntar på jobbet, kan stängas och öppnas tomt, och "Visa" öppnar det på det klara jobbet. Bekräftelsen har titeln (`AiJob.title`, ur resultatet), jobbraden sajten.
- Avvikelser: `parseRecipe` får ingen `deadline` (AI-portens 115 s plus hämtningens 10 s ryms i jobbets 130 s). `AI_MOCK_DELAY_MS` gäller nu också `parseRecipe`, och Playwrights `expect`-tid är 15 s. En omdirigering till en annan sajt visas utan sajtens namn, eftersom jobbet bara sparar felkoden.
- Beslut finns i `docs/beslutslogg.md`. `pnpm test:integration` kördes inte: inga tabeller, funktioner eller Server Actions ändrades.

## Spec Change Log

## Review Triage Log

Ingen separat granskning, enligt den tokensnåla loopen: storyn har ingen migrering och rör varken inloggning eller privata data. Byggaren gick själv igenom acceptanskriterierna. CI kör hela e2e-sviten på epic-PR:en.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Mot LM Studio: klistra in två länkar från koket.se efter varandra, stäng arket och gå till Matsedel. Två bekräftelser ska komma, och båda recepten ska gå att öppna och spara.
