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
