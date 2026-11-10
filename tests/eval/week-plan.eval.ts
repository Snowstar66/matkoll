// `pnpm eval:week`: Veckoagenten's planning, Haiku 5.5 at low effort against Sonnet 5.5 at medium, through the app's own
// port (createAiService(...).planWeek, the real prompt, schema and parsing) and the app's own validation. Costs real money
// (ANTHROPIC_API_KEY from .env.local, loaded by the pnpm script; this file never prints it) and is never part of
// `pnpm test`, CI or `pnpm eval:ai`.
//
//   pnpm eval:week                          six cases x 2 configurations x 3 runs, then the pipeline once per case
//   EVAL_RUNS=6 EVAL_BUDGET=1 pnpm eval:week  more or fewer runs, a different cost ceiling (USD)
//   EVAL_REPORT_ONLY=1 pnpm eval:week       rewrite docs/week-agent-eval.md from the saved results, no API calls
//
// Raw results: tests/eval/week-plan-results/ (ignored by git); a finished run is not paid for twice.
// Report: docs/week-agent-eval.md (the recommendation under "## Rekommendation" is written by hand and survives).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { claudeModels } from "@/features/settings/domain/ai-choice";
import { planWithAi, toPortInput } from "@/features/week-agent/ai-plan";
import { validatePicks, type PlanInput, type Violation } from "@/features/week-agent";
import { createAiService, type PlanWeekQuality } from "@/server/ai/service";
import { withUsageSink, type AiUsage } from "@/server/ai/usage";
import { parseEnv } from "@/server/env-schema";
import { cases, type EvalCase } from "./week-plan/cases";

type Saved = {
  config: string;
  caseId: string;
  run: number;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  errorCode?: string;
  picks?: { dayIndex: number; recipeId: string; reasons: string[] }[];
  hard?: string[];
  soft?: string[];
  reasonClaims?: number;
  reasonsWrong?: string[];
  /** The pipeline only: which model ended up planning, and whether Sonnet was asked after Haiku. */
  model?: string;
  retried?: boolean;
};

const configs = [
  { name: "haiku-low", quality: "standard" as PlanWeekQuality },
  { name: "sonnet-medium", quality: "careful" as PlanWeekQuality },
];

const root = join(process.cwd(), "tests", "eval");
const resultsDir = join(root, "week-plan-results");
const reportPath = join(process.cwd(), "docs", "week-agent-eval.md");
// vitest workers do not see the command line, so the options are environment variables: EVAL_RUNS, EVAL_BUDGET, EVAL_REPORT_ONLY.
const runCount = Number(process.env.EVAL_RUNS ?? 3);
const budget = Number(process.env.EVAL_BUDGET ?? 1.5);
const reportOnly = process.env.EVAL_REPORT_ONLY === "1";

const price = (model: string) => claudeModels.find((candidate) => candidate.id === model);
const costOf = (usage: AiUsage) => {
  const p = price(usage.model);
  return p ? (usage.inputTokens * p.usdPerMTokIn + usage.outputTokens * p.usdPerMTokOut) / 1e6 : 0;
};
const resultPath = (config: string, caseId: string, run: number) => join(resultsDir, config, `${caseId}.run${run}.json`);

const dayWords = ["", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];

/** Reasons the model wrote that the facts we gave it do not support: an offer or a use-soon claim on a dish without one, a wrong expiry day, a wrong time. */
function wrongReasons(input: PlanInput, picks: readonly { recipeId: string; reasons: string[] }[]): { claims: number; wrong: string[] } {
  let claims = 0;
  const wrong: string[] = [];
  for (const pick of picks) {
    const recipe = input.candidates.find((candidate) => candidate.id === pick.recipeId);
    for (const reason of pick.reasons) {
      const text = reason.toLocaleLowerCase("sv-SE");
      const offers = recipe?.offers ?? [];
      const soon = recipe?.useSoon ?? [];
      let claimed = false;
      if (/extrapris|erbjudande|\brea\b|kampanj|prisvärd|billig/.test(text)) {
        claimed = true;
        const price = /extrapris|erbjudande/.test(text);
        if (price && offers.length === 0) wrong.push(`${recipe?.title ?? "?"}: "${reason}" (inget extrapris)`);
      }
      if (/går ut|utgång|snart|behöver användas|håller på att|håller till/.test(text)) {
        claimed = true;
        const named = dayWords.findIndex((word, index) => index > 0 && (text.includes(`går ut ${word}`) || text.includes(`håller till ca ${word}`)));
        if (soon.length === 0) wrong.push(`${recipe?.title ?? "?"}: "${reason}" (inget som går ut)`);
        else if (named > 0 && !soon.some((item) => item.expiresWeekday === named)) wrong.push(`${recipe?.title ?? "?"}: "${reason}" (fel dag)`);
      }
      const minutes = /(\d+)\s*min/.exec(text);
      if (minutes) {
        claimed = true;
        if (recipe?.totalMinutes !== Number(minutes[1])) wrong.push(`${recipe?.title ?? "?"}: "${reason}" (tid ${recipe?.totalMinutes ?? "?"})`);
      }
      if (claimed) claims++;
    }
  }
  return { claims, wrong };
}

const codes = (violations: readonly Violation[], severity: "hard" | "soft") => violations.filter((v) => v.severity === severity).map((v) => v.code);

async function runRaw(service: ReturnType<typeof createAiService>, config: (typeof configs)[number], item: EvalCase, run: number): Promise<Saved> {
  const usage: AiUsage[] = [];
  const started = performance.now();
  const answer = await withUsageSink((u) => void usage.push(u), () => service.planWeek(toPortInput(item.input, config.quality), AbortSignal.timeout(170_000)));
  const seconds = (performance.now() - started) / 1000;
  const base = { config: config.name, caseId: item.id, run, seconds, inputTokens: usage.reduce((a, u) => a + u.inputTokens, 0), outputTokens: usage.reduce((a, u) => a + u.outputTokens, 0), costUsd: usage.reduce((a, u) => a + costOf(u), 0) };
  if (!answer.ok) return { ...base, ok: false, errorCode: answer.error.code };
  const picks = answer.data.picks;
  const violations = validatePicks(item.input, picks.map(({ dayIndex, recipeId }) => ({ dayIndex, recipeId })));
  const reasons = wrongReasons(item.input, picks);
  return { ...base, ok: true, picks, hard: codes(violations, "hard"), soft: codes(violations, "soft"), reasonClaims: reasons.claims, reasonsWrong: reasons.wrong };
}

async function runPipeline(service: ReturnType<typeof createAiService>, item: EvalCase, run: number): Promise<Saved> {
  const usage: AiUsage[] = [];
  const started = performance.now();
  const outcome = await withUsageSink((u) => void usage.push(u), () => planWithAi(service, item.input, [], "plan", AbortSignal.timeout(170_000)));
  const seconds = (performance.now() - started) / 1000;
  const base = { config: "pipeline", caseId: item.id, run, seconds, inputTokens: usage.reduce((a, u) => a + u.inputTokens, 0), outputTokens: usage.reduce((a, u) => a + u.outputTokens, 0), costUsd: usage.reduce((a, u) => a + costOf(u), 0) };
  if (outcome.status !== "ok") return { ...base, ok: false, errorCode: outcome.status };
  return { ...base, ok: true, model: outcome.model, retried: outcome.retried, hard: codes(outcome.violations, "hard"), soft: codes(outcome.violations, "soft") };
}

function loadAll(): Saved[] {
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir).flatMap((dir) => readdirSync(join(resultsDir, dir)).map((file) => JSON.parse(readFileSync(join(resultsDir, dir, file), "utf8")) as Saved));
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${((100 * n) / d).toFixed(0)} %`);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function report(): void {
  const all = loadAll();
  const names = ["haiku-low", "sonnet-medium"];
  const rows = names.map((name) => {
    const mine = all.filter((s) => s.config === name);
    const ok = mine.filter((s) => s.ok);
    const withHard = ok.filter((s) => (s.hard?.length ?? 0) > 0);
    const hardCount = ok.reduce((a, s) => a + (s.hard?.length ?? 0), 0);
    const softCount = ok.reduce((a, s) => a + (s.soft?.length ?? 0), 0);
    const claims = ok.reduce((a, s) => a + (s.reasonClaims ?? 0), 0);
    const wrong = ok.reduce((a, s) => a + (s.reasonsWrong?.length ?? 0), 0);
    const reasonCount = ok.reduce((a, s) => a + (s.picks ?? []).reduce((n, p) => n + p.reasons.length, 0), 0);
    return `| ${name} | ${mine.length} | ${pct(ok.length, mine.length)} | ${pct(ok.length - withHard.length, ok.length)} | ${hardCount} | ${(softCount / Math.max(ok.length, 1)).toFixed(2)} | ${pct(claims - wrong, claims)} (${wrong} fel av ${claims} påståenden, ${reasonCount} skäl) | ${median(mine.map((s) => s.seconds)).toFixed(1)} s | ${(mine.reduce((a, s) => a + s.costUsd, 0) / Math.max(mine.length, 1) * 10).toFixed(3)} kr |`;
  });
  const hardLines = all.filter((s) => (s.hard?.length ?? 0) > 0 && s.config !== "pipeline").map((s) => `- ${s.config} ${s.caseId} #${s.run}: ${s.hard?.join(", ")}`);
  const wrongLines = all.filter((s) => (s.reasonsWrong?.length ?? 0) > 0).flatMap((s) => (s.reasonsWrong ?? []).slice(0, 3).map((w) => `- ${s.config} ${s.caseId} #${s.run}: ${w}`)).slice(0, 12);
  const failed = all.filter((s) => !s.ok && s.config !== "pipeline").map((s) => `- ${s.config} ${s.caseId} #${s.run}: ${s.errorCode}`);
  const pipe = all.filter((s) => s.config === "pipeline");
  const pipeLines = pipe.map((s) => `| ${s.caseId} | ${s.model ?? s.errorCode} | ${s.retried ? "ja" : "nej"} | ${s.seconds.toFixed(1)} s | ${(s.costUsd * 10).toFixed(3)} kr |`);
  const perCase = cases.map((c) => {
    const cells = names.map((name) => {
      const mine = all.filter((s) => s.config === name && s.caseId === c.id);
      const ok = mine.filter((s) => s.ok);
      return `${ok.filter((s) => (s.hard?.length ?? 0) === 0).length}/${mine.length} utan hårt brott`;
    });
    return `| ${c.id} | ${c.about} | ${cells.join(" | ")} |`;
  });
  const total = all.reduce((a, s) => a + s.costUsd, 0);
  const text = `# Veckoagenten: planeringseval (Haiku 5.5 låg mot Sonnet 5.5 medel)

Genererad av \`pnpm eval:week\` (tests/eval/week-plan.eval.ts). Fixturer: tests/eval/week-plan/cases.ts (32 recept, sex hushållsfall). Anropen går genom appens egen port (\`planWeek\`: riktig prompt, schema, parsning) och valideras av appens egen \`validatePicks\`. Rådata i tests/eval/week-plan-results/ (ignoreras av git). Priser ur appens pristabell (\`claudeModels\`), 10 kr per USD. Total kostnad för sparade körningar: ${total.toFixed(3)} USD.

Mått: **schemagiltigt** = svaret gick att läsa enligt schemat (porten försöker två gånger själv); **utan hårt brott** = andel svar där varje val klarar allergi, dubblett, bestämd dag, vegetarisk dag, antal middagar och att receptet finns i urvalet; **mjuka brott** = snitt per svar (samma sorts rätt två dagar i rad, långsam rätt en vardag, nyligen lagad); **skäl rätt** = andel av modellens faktapåståenden (extrapris, går ut, minuter) som stämmer mot de fakta vi gav den. Allergi kontrolleras alltid i koden, så ett allergibrott i svaret är ett brott som koden fångar, inte något som når användaren.

| Konfiguration | Körningar | Schemagiltigt | Utan hårt brott | Hårda brott totalt | Mjuka brott/svar | Skäl rätt | Mediantid | Kostnad/vecka |
|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

### Per fall (andel körningar utan hårt brott)

| Fall | Vad | ${names.join(" | ")} |
|---|---|${names.map(() => "---").join("|")}|
${perCase.join("\n")}

### Hårda brott

${hardLines.join("\n") || "- inga"}

### Skäl som inte stämde

${wrongLines.join("\n") || "- inga"}

### Misslyckade anrop

${failed.join("\n") || "- inga"}

### Hela kedjan (planWithAi, läget plan: Haiku, Sonnet bara vid hårt brott, annars reglerna)

| Fall | Modell som planerade | Sonnet frågades efter Haiku | Tid | Kostnad |
|---|---|---|---|---|
${pipeLines.join("\n") || "| - | - | - | - | - |"}
`;
  const marker = "## Rekommendation";
  const old = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
  const kept = old.includes(marker) ? old.slice(old.indexOf(marker)) : `${marker}\n\n(skrivs för hand efter körningen)\n`;
  mkdirSync(join(process.cwd(), "docs"), { recursive: true });
  writeFileSync(reportPath, text + "\n" + kept);
}

describe("week plan eval", () => {
  it("runs", { timeout: 3_600_000 }, async () => {
    if (!reportOnly) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY saknas: kör `pnpm eval:week` (laddar .env.local) eller sätt nyckeln i miljön.");
      const service = createAiService(parseEnv({ ...process.env, AI_PROVIDER: "anthropic", AI_MODEL: "claude-haiku-5-5" }));
      let spent = loadAll().reduce((a, s) => a + s.costUsd, 0);
      type Job = { config: string; run: () => Promise<Saved>; caseId: string; n: number };
      const jobs: Job[] = [];
      for (const config of configs) for (const item of cases) for (let n = 1; n <= runCount; n++) if (!existsSync(resultPath(config.name, item.id, n))) jobs.push({ config: config.name, caseId: item.id, n, run: () => runRaw(service, config, item, n) });
      for (const item of cases) if (!existsSync(resultPath("pipeline", item.id, 1))) jobs.push({ config: "pipeline", caseId: item.id, n: 1, run: () => runPipeline(service, item, 1) });
      console.log(`${jobs.length} anrop att köra, redan lagt ut ${spent.toFixed(3)} USD, tak ${budget} USD`);
      let next = 0;
      const worker = async () => {
        for (;;) {
          const job = jobs[next++];
          if (!job || spent >= budget) return;
          const saved = await job.run();
          if (!saved.ok && saved.errorCode === "ai_unavailable" && saved.inputTokens === 0) {
            console.error(`  fel ${job.config} ${job.caseId}: ${saved.errorCode} (sparas inte)`);
            continue;
          }
          spent += saved.costUsd;
          mkdirSync(join(resultsDir, job.config), { recursive: true });
          writeFileSync(resultPath(job.config, job.caseId, job.n), JSON.stringify(saved, null, 2));
          console.log(`${job.config} ${job.caseId} #${job.n}: ${saved.seconds.toFixed(1)} s, ${saved.inputTokens}+${saved.outputTokens} tok, ${saved.ok ? `hårda ${saved.hard?.length ?? "-"}` : `fel ${saved.errorCode}`}, totalt ${spent.toFixed(3)} USD`);
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
    }
    report();
  });
});
