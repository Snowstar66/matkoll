---
title: 'Story 12.1: Mät AI-tiderna och ställ in LM Studio'
type: 'chore'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-nummer-pa-fotot.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att AI-flödena går fortare (FR-45), men tiderna är mätta på olika sätt i olika stories (T5, T6), och ingen vet vad "kall modell" betyder när modellen aldrig laddas ur. LM Studio kör med PARALLEL 4, och under en utvärdering tog ett AI-förslag mer än 100 s när anrop gick samtidigt. Utan ett gemensamt utgångsläge går det inte att visa att 12.2, 12.3 och 12.7 hjälper.

**Approach:**
- Utvärderingen mäter varje flöde på samma sätt: tid, token in och ut och token per sekund, med kall och varm modell.
- Mätningen körs med PARALLEL 4 och PARALLEL 1, ett anrop i taget (som kön) och två samtidigt, och med spekulativ avkodning om modellen stöder den.
- `docs/lm-studio.md` beskriver resultatet och de rekommenderade inställningarna. LM Studio lämnas som det var.

## Boundaries & Constraints

**Always:**
- Ingen ändring i appens kod utanför `tests/eval/`, `vitest.eval.config.ts` och dokumentationen. AI-porten och rutterna ändras inte.
- "Kall" betyder att modellen inte har fått något anrop på minst 15 minuter, med Macen vaken. Mät också efter 5 och 30 minuter en gång, så att `docs/lm-studio.md` kan säga när modellen blir kall.
- Rapporten har per körning: flöde, kall eller varm, tid i sekunder med en decimal, token in, token ut (från `usage` i AI SDK), token per sekund, giltigt eller inte. Tre körningar per läge.
- Flöden: bildanalys med nummer (Pontus foto och `syntetisk-kyl`), AI-förslag (två anrop: förslag och "Föreslå andra rätter"), import av text (`kycklinggryta`) och import av en sparad receptsida (`tests/fixtures/sites/`).
- Innan LM Studio ändras: `lms ps` och `lms ls` sparas i rapporten. Efteråt laddas modellen med samma inställningar, och `lms ps` visar samma sak som före.
- Kommandon för att ladda om: `lms unload qwen/qwen3.6-35b-a3b` och `lms load qwen/qwen3.6-35b-a3b -c 8192 --parallel <n> -y`, och `--speculative-draft-mtp` bara om `lms load --help` och modellen stöder det. Kontrollera med `--estimate-only` först.
- `docs/lm-studio.md` på svenska, i samma stil som `docs/drift.md`: vad som mättes, tabellen, rekommendationen och hur Pontus ställer in den.

**Never:**
- Ingen permanent ändring av LM Studio. Rekommendationen är ett förslag tills Pontus väljer (öppen fråga 20).
- Ingen annan modell och ingen TTL (modellen ska inte laddas ur).
- Inga foton i repot: Pontus foto ligger i `tests/eval/photos/`, som git ignorerar.
- Inga mätningar i CI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Varm bildanalys | Pontus foto, modellen nyss använd | Tid för avläsning, tid för nummer, summa, token | N/A |
| Kall bildanalys | 15 min utan anrop | Samma, märkt kall | N/A |
| PARALLEL 1, två samtidigt | Två flöden startas samtidigt | Det andra väntar i LM Studio; båda tider i rapporten | Över 115 s: `ai_unavailable` noteras |
| PARALLEL 4, två samtidigt | Samma | Båda långsammare; tiderna i rapporten | Samma |
| Spekulativ avkodning | `--speculative-draft-mtp` stöds | Tider med och utan | Stöds inte: noteras och hoppas över |
| LM Studio av | Servern stängd | Rapporten säger att mätningen inte gick | Avbryt och notera, inget nytt försök |
| Återställning | Efter mätningen | `lms ps` som före | Går det inte: öppen fråga till Pontus med kommandot |

</frozen-after-approval>

## Code Map

- `tests/eval/analyze-image.eval.ts`, `suggest-dishes.eval.ts`, `parse-recipe.eval.ts`, `compare.ts`, `suggest-checks.ts` -- utvärderingarna och deras rapporter
- `vitest.eval.config.ts`, `package.json` (`eval:ai`) -- hur utvärderingen körs
- `src/server/ai/run.ts` -- `runStructured`; `usage` finns på svaret från `generateText`
- `src/server/ai/service.ts` -- `inputLimits` och kommentarerna med tidigare mätningar
- `docs/oppna-fragor.md` -- T5 och T6
- `docs/drift.md` -- stil för en driftguide

## Tasks & Acceptance

**Execution:**
- [ ] `tests/eval/timing.ts` (+ test) -- gemensam rapportrad (flöde, läge, tid, token in och ut, token per sekund, giltig) och en sammanfattning med median per flöde och läge
- [ ] `tests/eval/*.eval.ts` -- använder `timing.ts`, läser `EVAL_LABEL` (till exempel `parallel-1-varm`) och `EVAL_RUNS`, och skriver rapporten till `tests/eval/reports/` (git ignorerar mappen)
- [ ] Mätningen mot LM Studio enligt Boundaries, med `lms ps` före och efter
- [ ] `docs/lm-studio.md` -- mätningen, rekommendationen och kommandona
- [ ] `docs/oppna-fragor.md` -- T5 och T6 får de nya siffrorna, T9 svaret om kall modell
- [ ] `docs/beslutslogg.md` -- en post med siffrorna och rekommendationen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test`, when de körs, then lyckas alla.
- Given `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai`, when den körs, then har rapporten tid och token per körning för varje flöde och läge.
- Given `docs/lm-studio.md`, when den läses, then finns en tabell med median per flöde för kall och varm modell och PARALLEL 1 och 4, en rekommendation med skäl och kommandot för att ladda modellen så.
- Given `lms ps` efter storyn, when den körs, then visar den samma inställningar som före.

## Implementation Notes

- **Hypotes (förslag): PARALLEL 1.** Appen kör ett jobb i taget från 12.4, så fyra platser ger inget, och de kan dela minne och fart. Mätningen avgör.
- **Hypotes (förslag): spekulativ avkodning** kan ge fler token per sekund för text (förslag, import). Den kan också ändra svaren; jämför giltighet och innehåll, inte bara tid.
- **Varför kall är långsam är okänt (T9).** Modellen laddas aldrig ur. Möjliga orsaker: macOS har komprimerat eller växlat ut minnet, bildkodaren och promptens cache är tomma. Notera minnestrycket (`memory_pressure` eller Aktivitetskontroll) vid kalla körningar.
- `usage` kan saknas från LM Studio i vissa lägen. Saknas det, räkna tid och notera "–".
- Loggar och rapporter innehåller aldrig foton eller svarstext, bara siffror och flödets namn.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai` -- expected: rapport med alla flöden och lägen

**Manual checks (if no CLI):**
- `lms ps` före och efter är lika.
