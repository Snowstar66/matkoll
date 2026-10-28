import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Story 12.1: one way to time every AI flow in `pnpm eval:ai`. Each model call
// the evaluation makes becomes a row: the flow, the label of the run
// (EVAL_LABEL, for example `parallel-1-varm`), the time in seconds, the tokens
// in and out from the provider's `usage`, tokens per second and whether the
// answer was valid. Before each call the row also notes how long LM Studio's
// model had been idle (`lms ps --json`, lastUsedTime) and the Mac's memory
// (free percentage and compressed memory), so a cold run can be told from a
// warm one afterwards. A report per evaluation file goes to tests/eval/reports/
// (ignored by git) as Markdown and JSON, and reports/sammanfattning.md is
// written again from every JSON report there: the median per flow and label.
// Rows hold numbers and the flow's name only, never a photo, input or answer.

export type Usage = {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Prompt tokens the provider served from its cache, when it says so. */
  cachedTokens: number | null;
  /** Chat completion calls the flow made: the first attempt plus any new ones. */
  calls: number;
  /** Seconds of the first chat completion alone, from its request to its whole answer, when it answered. */
  firstCallSeconds: number | null;
};

export type MachineState = {
  /** Seconds since LM Studio last used the model, before this call; null without `lms`. */
  idleSeconds: number | null;
  /** macOS's free memory percentage (`memory_pressure`). */
  memoryFreePercent: number | null;
  /** Memory held by macOS's compressor, in GB (`vm_stat`). */
  compressedGb: number | null;
};

export type TimingRow = Usage &
  MachineState & {
    flow: string;
    label: string;
    run: number;
    seconds: number;
    valid: boolean;
    startedAt: string;
  };

export type TimingSummary = {
  flow: string;
  label: string;
  runs: number;
  valid: number;
  medianSeconds: number | null;
  minSeconds: number | null;
  maxSeconds: number | null;
  medianInputTokens: number | null;
  medianOutputTokens: number | null;
  medianTokensPerSecond: number | null;
};

const labelPattern = /[^a-z0-9åäö-]+/g;

/** EVAL_LABEL as a file-safe label (lower case, letters, digits and dashes); "utan-etikett" without one. */
export function evalLabel(env: Record<string, string | undefined> = process.env): string {
  const label = (env.EVAL_LABEL ?? "").trim().toLowerCase().replace(labelPattern, "-").replace(/^-+|-+$/g, "");
  return label || "utan-etikett";
}

/** EVAL_RUNS: how many times each case runs, default 3. */
export function evalRuns(env: Record<string, string | undefined> = process.env): number {
  return Math.max(1, Number.parseInt(env.EVAL_RUNS ?? "3", 10) || 3);
}

/** Output tokens per second of the whole call (prompt included), or null when either is unknown. */
export function tokensPerSecond(outputTokens: number | null, seconds: number): number | null {
  if (outputTokens === null || seconds <= 0) return null;
  return outputTokens / seconds;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A number with `digits` decimals, or "–" when unknown. */
export function formatNumber(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "–" : value.toFixed(digits);
}

const emptyUsage = (): Usage => ({
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  calls: 0,
  firstCallSeconds: null,
});

const addTo = (sum: number | null, value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? (sum ?? 0) + value : sum;

/** `total` with one OpenAI-compatible response body's `usage` added; a body without it only counts the call. */
export function addUsage(total: Usage, body: unknown): Usage {
  const usage = (body as { usage?: Record<string, unknown> } | null | undefined)?.usage;
  const details = usage?.prompt_tokens_details as Record<string, unknown> | undefined;
  return {
    ...total,
    inputTokens: addTo(total.inputTokens, usage?.prompt_tokens),
    outputTokens: addTo(total.outputTokens, usage?.completion_tokens),
    cachedTokens: addTo(total.cachedTokens, details?.cached_tokens),
    calls: total.calls + 1,
  };
}

/**
 * Counts the `usage` of every chat completion while `measure` runs, by
 * wrapping the global fetch the AI SDK uses (the port does not return it, and
 * the app is not changed for the evaluation). Only the numbers are read.
 */
export function installUsageMeter() {
  const original = globalThis.fetch;
  let current: Usage | null = null;
  let pending: Promise<void>[] = [];
  /** The answers' texts in this measure, for the evaluation's own checks (Story 12.3); never in a row. */
  let contents: string[] = [];

  globalThis.fetch = async (input, init) => {
    const callStarted = performance.now();
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (current && url.endsWith("/chat/completions")) {
      const copy = response.clone();
      pending.push(
        copy
          .json()
          .then((body: unknown) => {
            if (!current) return;
            const first = current.calls === 0 ? (performance.now() - callStarted) / 1000 : current.firstCallSeconds;
            current = { ...addUsage(current, body), firstCallSeconds: first };
            const content = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
            if (typeof content === "string") contents.push(content);
          })
          .catch(() => {
            if (current) current = { ...current, calls: current.calls + 1 };
          }),
      );
    }
    return response;
  };

  return {
    async measure<T>(call: () => Promise<T>): Promise<{ value: T; seconds: number; usage: Usage; contents: string[] }> {
      current = emptyUsage();
      pending = [];
      contents = [];
      const started = performance.now();
      try {
        const value = await call();
        const seconds = (performance.now() - started) / 1000;
        await Promise.all(pending);
        return { value, seconds, usage: current, contents };
      } finally {
        current = null;
      }
    },
  };
}

const lmsPath = join(homedir(), ".lmstudio", "bin", "lms");

/** The loaded model's entry in `lms ps --json`, or null without `lms` or the model. */
function lmsModel(model: string | undefined): Record<string, unknown> | null {
  if (!existsSync(lmsPath)) return null;
  try {
    const output = execFileSync(lmsPath, ["ps", "--json"], { encoding: "utf8", timeout: 10_000 });
    const models = JSON.parse(output) as Record<string, unknown>[];
    return models.find((entry) => entry.identifier === model || entry.modelKey === model) ?? models[0] ?? null;
  } catch {
    return null;
  }
}

/** How LM Studio has the model loaded: context, PARALLEL and TTL, for the report's header. */
export function lmStudioSettings(model: string | undefined): string {
  const entry = lmsModel(model);
  if (!entry) return "–";
  const ttl = entry.ttlMs === null || entry.ttlMs === undefined ? "ingen" : `${Number(entry.ttlMs) / 1000} s`;
  return `${String(entry.identifier)}, kontext ${String(entry.contextLength)}, PARALLEL ${String(entry.parallel)}, TTL ${ttl}`;
}

/** Idle time and memory just before a call. Every part is null where it cannot be read (not a Mac, no `lms`). */
export function machineState(model: string | undefined, now = Date.now()): MachineState {
  const entry = lmsModel(model);
  const lastUsed = typeof entry?.lastUsedTime === "number" ? entry.lastUsedTime : null;
  return {
    idleSeconds: lastUsed === null ? null : Math.max(0, (now - lastUsed) / 1000),
    ...memoryState(),
  };
}

function memoryState(): Pick<MachineState, "memoryFreePercent" | "compressedGb"> {
  if (process.platform !== "darwin") return { memoryFreePercent: null, compressedGb: null };
  let memoryFreePercent: number | null = null;
  let compressedGb: number | null = null;
  try {
    const pressure = execFileSync("memory_pressure", { encoding: "utf8", timeout: 10_000 });
    const match = /free percentage:\s*(\d+)%/.exec(pressure);
    if (match) memoryFreePercent = Number(match[1]);
  } catch {
    // Left unknown.
  }
  try {
    const vm = execFileSync("vm_stat", { encoding: "utf8", timeout: 10_000 });
    const pageSize = Number(/page size of (\d+) bytes/.exec(vm)?.[1] ?? 16384);
    const pages = /Pages occupied by compressor:\s*(\d+)/.exec(vm);
    if (pages) compressedGb = (Number(pages[1]) * pageSize) / 1024 ** 3;
  } catch {
    // Left unknown.
  }
  return { memoryFreePercent, compressedGb };
}

/** A row from a measured call: the state before it, its time and usage, and whether its answer was valid. */
export function timingRow(
  flow: string,
  run: number,
  state: MachineState,
  measured: { seconds: number; usage: Usage },
  valid: boolean,
  startedAt: Date,
  label = evalLabel(),
): TimingRow {
  return {
    flow,
    label,
    run,
    seconds: measured.seconds,
    ...measured.usage,
    ...state,
    valid,
    startedAt: startedAt.toISOString(),
  };
}

/** Groups rows by flow and label, in the order they first appear, with medians of the valid runs' numbers. */
export function summarize(rows: readonly TimingRow[]): TimingSummary[] {
  const groups = new Map<string, TimingRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.flow, row.label]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const valid = group.filter((row) => row.valid);
    const counted = valid.length > 0 ? valid : group;
    const seconds = counted.map((row) => row.seconds);
    const known = (pick: (row: TimingRow) => number | null) =>
      counted.map(pick).filter((value): value is number => value !== null);
    return {
      flow: group[0].flow,
      label: group[0].label,
      runs: group.length,
      valid: valid.length,
      medianSeconds: median(seconds),
      minSeconds: seconds.length > 0 ? Math.min(...seconds) : null,
      maxSeconds: seconds.length > 0 ? Math.max(...seconds) : null,
      medianInputTokens: median(known((row) => row.inputTokens)),
      medianOutputTokens: median(known((row) => row.outputTokens)),
      medianTokensPerSecond: median(known((row) => tokensPerSecond(row.outputTokens, row.seconds))),
    };
  });
}

const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** One Markdown row per call. */
export function renderRows(rows: readonly TimingRow[]): string[] {
  return [
    "| Flöde | Läge | Körning | Tid (s) | Token in | Token ut | Cachade | Anrop | Första anropet (s) | Token/s | Giltigt | Vilat (s) | Fritt minne | Komprimerat (GB) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.flow)} | ${escapeCell(row.label)} | ${row.run} | ${formatNumber(row.seconds)} | ${formatNumber(row.inputTokens, 0)} | ${formatNumber(row.outputTokens, 0)} | ${formatNumber(row.cachedTokens, 0)} | ${row.calls} | ${formatNumber(row.firstCallSeconds)} | ${formatNumber(tokensPerSecond(row.outputTokens, row.seconds))} | ${row.valid ? "ja" : "nej"} | ${formatNumber(row.idleSeconds, 0)} | ${row.memoryFreePercent === null ? "–" : `${row.memoryFreePercent} %`} | ${formatNumber(row.compressedGb)} |`,
    ),
  ];
}

/** One Markdown row per flow and label: medians of the valid runs (of all runs when none was valid). */
export function renderSummary(summary: readonly TimingSummary[]): string[] {
  return [
    "| Flöde | Läge | Körningar | Giltiga | Median (s) | Min–max (s) | Token in | Token ut | Token/s |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...summary.map(
      (entry) =>
        `| ${escapeCell(entry.flow)} | ${escapeCell(entry.label)} | ${entry.runs} | ${entry.valid} | ${formatNumber(entry.medianSeconds)} | ${formatNumber(entry.minSeconds)}–${formatNumber(entry.maxSeconds)} | ${formatNumber(entry.medianInputTokens, 0)} | ${formatNumber(entry.medianOutputTokens, 0)} | ${formatNumber(entry.medianTokensPerSecond)} |`,
    ),
  ];
}

export const reportsDir = () => join(process.cwd(), "tests", "eval", "reports");

/**
 * Writes reports/<label>-<kind>-<time>.md and .json for one evaluation file,
 * then reports/sammanfattning.md from every JSON report in the folder.
 */
export function writeTimingReport(kind: string, header: readonly string[], rows: readonly TimingRow[], dir = reportsDir()) {
  if (rows.length === 0) return;
  mkdirSync(dir, { recursive: true });
  const label = rows[0].label;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = join(dir, `${label}-${kind}-${stamp}`);
  writeFileSync(`${base}.json`, `${JSON.stringify({ kind, header, rows }, null, 2)}\n`);
  const lines = [
    `# Tider: ${kind} (${label})`,
    "",
    ...header.map((line) => `- ${line}`),
    "",
    "## Median per flöde",
    "",
    ...renderSummary(summarize(rows)),
    "",
    "## Varje körning",
    "",
    ...renderRows(rows),
    "",
  ];
  writeFileSync(`${base}.md`, lines.join("\n"));
  writeSummary(dir);
  console.log(`Wrote ${base}.md`);
}

/** reports/sammanfattning.md: the median per flow and label over every JSON report in the folder. */
export function writeSummary(dir = reportsDir()) {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const rows = files.flatMap((file) => {
    try {
      return (JSON.parse(readFileSync(join(dir, file), "utf8")) as { rows: TimingRow[] }).rows;
    } catch {
      return [];
    }
  });
  const summary = summarize(rows).sort(
    (a, b) => a.flow.localeCompare(b.flow, "sv") || a.label.localeCompare(b.label, "sv"),
  );
  const lines = [
    "# Tider: sammanfattning",
    "",
    `- Skriven: ${new Date().toISOString()}`,
    `- Rapporter: ${files.length}`,
    "",
    ...renderSummary(summary),
    "",
  ];
  writeFileSync(join(dir, "sammanfattning.md"), lines.join("\n"));
}
