- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-projektgrund-med-kontroller.md`
  summary: Lägg till lintfall för zonerna mot `src/lib/supabase` (domain, ui, src/server) när mappen skapas i Story 1.2.
  evidence: `import/no-restricted-paths` hoppar över importer som inte går att lösa; mappen finns inte än, så zonerna kan inte verifieras.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-projektgrund-med-kontroller.md`
  summary: Kontrollera i `env.ts` att AI-inställningarna hänger ihop (nyckel för vald leverantör, LMSTUDIO_BASE_URL och AI_MODEL för lmstudio, båda CF-variablerna) i Story 1.4.
  evidence: Idag validerar t.ex. `AI_PROVIDER=anthropic` utan `ANTHROPIC_API_KEY`; felet syns först vid anrop.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-projektgrund-med-kontroller.md`
  summary: Hindra att appkod läser `SUPABASE_SERVICE_ROLE_KEY` (eget skript-/testmodul eller lintregel) i Story 1.2.
  evidence: AD-4 säger att service role bara används i tester och skript, men nyckeln finns i appens `env`-objekt.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-projektgrund-med-kontroller.md`
  summary: Komplettera `AGENTS.md` med projektets regler (AD-1-lager, ingångar index.ts/server.ts, env.ts, AI SDK bara i src/server/ai, svenska UI/engelsk kod) och pekare till docs/.
  evidence: Filen innehåller bara Next.js genererade block; agenter som arbetar i repot får ingen projektkontext.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-inloggning-med-engangslank.md`
  summary: Skydda engångslänken mot e-postskannrar som öppnar länkar i förväg (mellansida med knapp, verifiering på POST).
  evidence: `/auth/confirm` verifierar på GET. Ej verifierat för Pontus e-postklient; avgörs om första klicket ger "Länken har gått ut eller redan använts".
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-inloggning-med-engangslank.md`
  summary: Integrationstest som kör `users:sync --prune` mot riktig Supabase med isolerade testanvändare.
  evidence: Bara planeringslogiken är testad; ett trasigt flagg- eller raderingsanrop märks inte. Ett säkert test måste skydda utvecklarens egna användare.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-app-skal-navigering-och-designtokens.md`
  summary: E2E-test i riktig webbläsare av Sheet (Esc, cancel/stängningsbegäran, svep, "Släng ändringarna?") när första riktiga användningen finns i Story 1.6.
  evidence: jsdom saknar `showModal` och stängningsbegäranden; tester körs mot en polyfill.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-ai-tjansten-med-testleverantor-och-lokal-modell.md`
  summary: E2E-kontroll under `pnpm build && pnpm start` att AI-porten (med prompt via `?raw`) fungerar i det byggda servern, när första route använder porten i Story 1.6.
  evidence: Turbopack-regeln verifierades bara för hand; Vitest löser `?raw` själv, så CI märker inte om regeln slutar fungera.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-importera-recept-fran-inklistrad-text.md`
  summary: LÖST – E2E i Story 1.6 kör AI-porten (med prompten via `?raw`) i den byggda servern och Sheet i riktig webbläsare (Esc, stängknapp, "Släng ändringarna?"). Svep nedåt är fortfarande bara testat i jsdom.
  evidence: `tests/e2e/import.spec.ts` mot `pnpm build && pnpm start`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-spara-recept-och-visa-receptet.md`
  summary: Testa meddelandet när sessionen gått ut vid "Spara recept", och överväg att behålla utkastet över en ny inloggning.
  evidence: Grenen `unauthorized` i `save()` testas inte; utkastet försvinner om sessionen gått ut.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-importera-recept-fran-foto.md`
  summary: E2E som avbryter (Avbryt eller stängning) medan bilden förminskas och visar att inget skickas.
  evidence: Nuvarande test avbryter först när förfrågan är skickad; kräver att `createImageBitmap`/`toBlob` görs långsamma i testet.

## Från Epic 2

- **Kvarlämnade testanvändare (`pantry-many-…`):** e2e-förberedelsen varnar för integrationstestanvändare som blir kvar. Troligen tar det för lång tid att radera användaren med 1001 ingredienser med cascade. Utred `deleteTestUsers` (vänta längre, eller radera lagret och katalogen först med SQL) när det stör.
- **Svep nära skärmkanten och VoiceOver på lagervaror:** måste kontrolleras på riktig iPhone (checklistan i `docs/oppna-fragor.md`).

## Från 6.4 (2026-10-26)

- **Instabilt integrationstest:** "Lägg i lagret … double tap" i `tests/integration/shopping.test.ts` föll en gång i en full körning och gick sedan igenom 3 gånger i rad. Utred tidsberoendet om det faller i CI.

## Från 6.5 (2026-10-26)

- **Kontextbudget vid 2048 px:** bildtoken för ett platsfoto på 2048 px är inte uppmätta mot LM Studios kontextfönster. Mät dem (eller sänk gränsen) om svar börjar kortas av.

## Från 12.4 (2026-10-28)

- **Köat jobb går ut för tidigt:** `enqueue_ai_job` sätter `expires_at` = `startBy`, så `ai_queue_timeout` kan förlora mot `ai_job_lost`, och texten blir "avbröts" i stället för "hann inte börja". Ge köade jobb en marginal på cirka 10 s, i en ny migrering.
- **Överlapp efter avbrott:** `cancel_ai_job` och `dismiss_ai_job` frigör platsen innan det gamla LM Studio-anropet har slutat (upp till cirka 3 s, `guardPollMs`). Godta det eller förkorta pollen.
- **Tung lista:** `loadShownAiJobsIn` läser in hela `result` (upp till 256 KB) varannan sekund bara för att räkna förslagen. Räkna med `jsonb_array_length` i databasen.
