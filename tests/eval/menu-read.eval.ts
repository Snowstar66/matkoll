// `pnpm eval:menu`: step 1 of the planned "Menyrådgivare" (read a restaurant menu photo into a
// structured list), measured on Claude Haiku 5.5 and Sonnet 5.5. Standalone: it is not a vitest
// test, is never part of `pnpm test` or CI, and costs real money (the ANTHROPIC_API_KEY of
// .env.local, loaded by the pnpm script; this file never prints it).
//
//   pnpm eval:menu                          all menus x 3 configurations x 2 runs
//   pnpm eval:menu -- --only=es1,en2        some menus (id prefix)
//   pnpm eval:menu -- --configs=haiku-low   some configurations
//   pnpm eval:menu -- --runs=1 --budget=2   fewer runs, a lower cost ceiling (USD)
//   pnpm eval:menu -- --report-only         rewrite the report from saved results, no API calls
//
// Menus: tests/eval/menus/*.png|jpg with <id>.json ground truth (made by menus/generate.ts) and
// photos in tests/eval/menus/real/ (no truth, output saved for a look with the eyes).
// Raw answers: tests/eval/menu-read-results/ (ignored by git); a finished run is not paid for twice.
// Report: tests/eval/menu-read-report.md.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addScores,
  emptyScore,
  menuSchema,
  scoreMenu,
  validate,
  type MenuRead,
  type Score,
  type Truth,
} from "./menu-read-score.ts";

type Config = { name: string; model: string; effort: "low" | "medium" | "high"; inPerMTok: number; outPerMTok: number };
const configs: Config[] = [
  { name: "haiku-low", model: "claude-haiku-5-5", effort: "low", inPerMTok: 0.1, outPerMTok: 0.5 },
  { name: "haiku-medium", model: "claude-haiku-5-5", effort: "medium", inPerMTok: 0.1, outPerMTok: 0.5 },
  { name: "sonnet-medium", model: "claude-sonnet-5-5", effort: "medium", inPerMTok: 2, outPerMTok: 10 },
];

type Saved = {
  config: string;
  menu: string;
  run: number;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number | null;
  costUsd: number;
  stopReason: string | null;
  error?: string;
  parsed: boolean;
  read?: MenuRead;
  text?: string;
};

const root = join(process.cwd(), "tests", "eval");
const menusDir = join(root, "menus");
const realDir = join(menusDir, "real");
const resultsDir = join(root, "menu-read-results");
const reportPath = join(root, "menu-read-report.md");
const prompt = readFileSync(join(root, "menu-read-prompt.md"), "utf8");

const args = new Map(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"] as const;
  }),
);
const runCount = Number(args.get("runs") ?? 2);
const budget = Number(args.get("budget") ?? 4.5);
const only = args.get("only")?.split(",");
const chosenConfigs = args.get("configs")?.split(",");

const mediaType = (file: string) => (file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
const imageFiles = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [];

type Item = { id: string; file: string; truth: Truth | null };
const items: Item[] = [
  ...imageFiles(menusDir).map((file) => {
    const id = file.replace(/\.[a-z]+$/, "");
    return { id, file: join(menusDir, file), truth: JSON.parse(readFileSync(join(menusDir, `${id}.json`), "utf8")) as Truth };
  }),
  ...imageFiles(realDir).map((file) => ({ id: `real-${file.replace(/\.[a-z]+$/i, "")}`, file: join(realDir, file), truth: null })),
].filter((item) => !only || only.some((o) => item.id.startsWith(o)));

const resultPath = (config: string, id: string, run: number) => join(resultsDir, config, `${id}.run${run}.json`);

let spent = 0;
for (const c of configs) {
  for (const item of items) {
    for (let run = 1; run <= runCount; run++) {
      const p = resultPath(c.name, item.id, run);
      if (existsSync(p)) spent += (JSON.parse(readFileSync(p, "utf8")) as Saved).costUsd;
    }
  }
}

async function runOne(client: Anthropic, config: Config, item: Item, run: number): Promise<Saved> {
  const base = { config: config.name, menu: item.id, run };
  const started = performance.now();
  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 16000,
      output_config: { effort: config.effort, format: { type: "json_schema", schema: menuSchema } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType(item.file), data: readFileSync(item.file).toString("base64") } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const seconds = (performance.now() - started) / 1000;
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const usage = response.usage;
    const costUsd = (usage.input_tokens * config.inPerMTok + usage.output_tokens * config.outPerMTok) / 1e6;
    let read: MenuRead | undefined;
    try {
      const value: unknown = JSON.parse(text);
      if (validate(value)) read = value;
    } catch {
      // Not parsable (for example cut off at max_tokens): counted as a parse failure.
    }
    return {
      ...base,
      seconds,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      thinkingTokens: usage.output_tokens_details?.thinking_tokens ?? null,
      costUsd,
      stopReason: response.stop_reason,
      parsed: Boolean(read),
      read,
      text: read ? undefined : text,
    };
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base, seconds: (performance.now() - started) / 1000, inputTokens: 0, outputTokens: 0, thinkingTokens: null,
      costUsd: 0, stopReason: null, parsed: false, error: `${status ?? ""} ${message}`.trim().slice(0, 300),
    };
  }
}

async function runAll(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY saknas: kör `pnpm eval:menu` (laddar .env.local) eller sätt nyckeln i miljön.");
    process.exit(2);
  }
  const client = new Anthropic({ timeout: 300_000 });
  const jobs: { config: Config; item: Item; run: number }[] = [];
  for (const config of configs.filter((c) => !chosenConfigs || chosenConfigs.includes(c.name))) {
    for (const item of items) {
      for (let run = 1; run <= runCount; run++) {
        if (!existsSync(resultPath(config.name, item.id, run))) jobs.push({ config, item, run });
      }
    }
  }
  console.log(`${jobs.length} anrop att köra, redan lagt ut ${spent.toFixed(3)} USD, tak ${budget} USD`);
  let next = 0;
  let stop = false;
  const worker = async () => {
    while (!stop) {
      const job = jobs[next++];
      if (!job) return;
      if (spent >= budget) {
        console.error(`Budgettaket ${budget} USD nått, avbryter.`);
        stop = true;
        return;
      }
      const saved = await runOne(client, job.config, job.item, job.run);
      if (saved.error?.startsWith("401") || saved.error?.startsWith("403")) {
        console.error(`Autentiseringsfel (${saved.error}). Stoppar: nyckeln saknas eller är ogiltig.`);
        stop = true;
        return;
      }
      if (saved.error) {
        console.error(`  fel ${saved.config} ${saved.menu} #${saved.run}: ${saved.error}`);
        continue; // not saved, so a rerun tries again
      }
      spent += saved.costUsd;
      mkdirSync(join(resultsDir, saved.config), { recursive: true });
      writeFileSync(resultPath(saved.config, saved.menu, saved.run), JSON.stringify(saved, null, 2));
      console.log(
        `${saved.config} ${saved.menu} #${saved.run}: ${saved.seconds.toFixed(1)} s, ${saved.inputTokens}+${saved.outputTokens} tok, ${saved.costUsd.toFixed(4)} USD, ${saved.parsed ? "ok" : "EJ PARSBAR"}, totalt ${spent.toFixed(3)} USD`,
      );
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${((100 * n) / d).toFixed(1)} %`);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function loadAll(): Saved[] {
  const out: Saved[] = [];
  for (const c of configs) {
    const dir = join(resultsDir, c.name);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as Saved);
  }
  return out;
}

type Row = { saved: Saved; truth: Truth; score: Score | null };

function table(rows: Row[], title: string): string {
  const header =
    "| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = configs.flatMap((c) => {
    const mine = rows.filter((r) => r.saved.config === c.name);
    if (!mine.length) return [];
    const total = mine.reduce((acc, r) => (r.score ? addScores(acc, r.score) : acc), emptyScore());
    const parsed = mine.filter((r) => r.saved.parsed).length;
    const cost = mine.reduce((a, r) => a + r.saved.costUsd, 0) / mine.length;
    return [
      `| ${c.name} | ${mine.length} | ${pct(parsed, mine.length)} | ${pct(total.matched, total.truthCount)} | ${pct(total.priceCorrect, total.matched)} | ${pct(total.groupCorrect, total.matched)} | ${pct(total.allergenTp, total.allergenTp + total.allergenFn)} | ${pct(total.allergenTp + total.allergenFnSoft, total.allergenTp + total.allergenFn)} | ${pct(total.allergenTp, total.allergenTp + total.allergenFp)} | ${pct(total.categoryCorrect, total.categoryTotal)} | ${pct(total.translationCorrect, total.translationTotal)} | ${median(mine.map((r) => r.saved.seconds)).toFixed(1)} s | ${cost.toFixed(4)} USD |`,
    ];
  });
  return `### ${title}\n\n${header}\n${lines.join("\n")}\n`;
}

function report(): void {
  const all = loadAll();
  const truths = new Map(items.filter((i) => i.truth).map((i) => [i.id, i.truth as Truth]));
  const rows: Row[] = all.flatMap((saved) => {
    const truth = truths.get(saved.menu);
    if (!truth) return [];
    return [{ saved, truth, score: saved.read ? scoreMenu(truth, saved.read) : null }];
  });
  // A failed parse counts as every dish missed: scored as an empty reading.
  for (const r of rows) {
    if (!r.score) r.score = scoreMenu(r.truth, { restaurang: null, sprak: "", ratter: [], osakert: [] });
  }
  const sections = [
    table(rows, "Alla menyer"),
    ...(["es", "en", "sv"] as const).map((l) => table(rows.filter((r) => r.truth.language === l), `Språk: ${l}`)),
    table(rows.filter((r) => r.truth.degraded), "Sämre bilder (rotation, oskärpa, låg kontrast, JPEG, perspektiv)"),
    table(rows.filter((r) => !r.truth.degraded), "Rena bilder"),
  ];
  const perMenu = [...truths.keys()].sort().map((id) => {
    const cells = configs.map((c) => {
      const mine = rows.filter((r) => r.saved.config === c.name && r.saved.menu === id);
      if (!mine.length) return "-";
      const t = mine.reduce((acc, r) => addScores(acc, r.score ?? emptyScore()), emptyScore());
      return `${pct(t.matched, t.truthCount)} / ${pct(t.priceCorrect, t.matched)} / ${t.allergenFn}`;
    });
    return `| ${id} | ${cells.join(" | ")} |`;
  });
  const missCount = new Map<string, { count: number; configs: Set<string> }>();
  for (const r of rows) {
    for (const m of new Set(r.score?.misses ?? [])) {
      const key = `${r.saved.menu}: ${m}`;
      const entry = missCount.get(key) ?? { count: 0, configs: new Set() };
      entry.count++;
      entry.configs.add(r.saved.config);
      missCount.set(key, entry);
    }
  }
  const worst = [...missCount.entries()]
    .sort((a, b) => (/ALLERGEN/.test(b[0]) ? 1 : 0) - (/ALLERGEN/.test(a[0]) ? 1 : 0) || b[1].count - a[1].count)
    .slice(0, 25)
    .map(([k, v]) => `- ${k} (${v.count} körningar: ${[...v.configs].join(", ")})`);
  const totalCost = all.reduce((a, s) => a + s.costUsd, 0);
  const thinking = configs.map((c) => {
    const mine = all.filter((s) => s.config === c.name);
    return `${c.name}: median ${median(mine.map((s) => s.outputTokens))} utdatatokens (varav tänkande ${median(mine.map((s) => s.thinkingTokens ?? 0))}), ${median(mine.map((s) => s.inputTokens))} indatatokens`;
  });
  const failures = all.filter((s) => !s.parsed);
  const realRuns = all.filter((s) => s.menu.startsWith("real-"));
  const text = `# Menyrådgivare, steg 1: läsa menyn (Haiku 5.5 mot Sonnet 5.5)

Genererad av \`pnpm eval:menu\` (tests/eval/menu-read.eval.ts). Prompt: tests/eval/menu-read-prompt.md. Rådata: tests/eval/menu-read-results/ (ignoreras av git).

Mått: **recall rätter** = andel av sanningens rätter som hittades (fuzzy namnmatchning); **pris rätt** = andel av hittade rätter där pris och valuta stämmer exakt (null väntas där menyn saknar eget pris); **allergen recall/precision** mot allergener som följer av namn/beskrivning (missade allergener är det allvarliga; "inkl. kan_innehåller" räknar en miss som mjuk om modellen åtminstone angav allergenen som osäker; precision är pessimistisk eftersom en riktig men inte sanningsmärkt allergen räknas som fel); **kategori rätt** = kött/fisk/skaldjur/vegetariskt/veganskt; **översättning** = svenska förklaringen innehåller ett av nyckelorden; **parsbar** = giltig JSON enligt schemat (trunkerade svar räknas som fel och som alla rätter missade).

Körningar per bild och konfiguration: ${runCount}. Kostnad totalt för sparade körningar: ${totalCost.toFixed(3)} USD.

${sections.join("\n")}
### Per meny (recall / pris rätt / missade allergener, summa över körningar)

| Meny | ${configs.map((c) => c.name).join(" | ")} |
|---|${configs.map(() => "---").join("|")}|
${perMenu.join("\n")}

### Tokens

${thinking.map((t) => `- ${t}`).join("\n")}

### Värsta missarna (allergener först, sedan mest frekventa)

${worst.join("\n") || "- inga"}

### Misslyckade anrop (ej parsbara)

${failures.map((f) => `- ${f.config} ${f.menu} #${f.run}: stop_reason ${f.stopReason}, ${f.outputTokens} utdatatokens`).join("\n") || "- inga"}

${realRuns.length ? `### Riktiga foton (ingen sanning)\n\nSparade i menu-read-results/ för ögonkontroll: ${[...new Set(realRuns.map((r) => r.menu))].join(", ")}.\n` : ""}
`;
  // The recommendation below the marker is written by hand and survives a new report.
  const marker = "## Rekommendation";
  const old = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
  const kept = old.includes(marker) ? old.slice(old.indexOf(marker)) : `${marker}\n\n(skrivs för hand efter körningen)\n`;
  writeFileSync(reportPath, text + kept);
  console.log(`Rapport skriven: ${reportPath}`);
}

if (args.get("report-only") !== "true") await runAll();
report();
