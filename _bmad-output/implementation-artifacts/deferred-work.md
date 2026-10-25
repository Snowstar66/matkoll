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
