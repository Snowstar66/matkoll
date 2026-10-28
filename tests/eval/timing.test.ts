import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addUsage,
  attemptOf,
  evalLabel,
  evalRuns,
  formatNumber,
  installUsageMeter,
  median,
  renderRows,
  summarize,
  timingRow,
  tokensPerSecond,
  writeTimingReport,
  type TimingRow,
} from "./timing";

const state = { idleSeconds: 12, memoryFreePercent: 50, compressedGb: 1.25 };

function row(flow: string, label: string, seconds: number, outputTokens: number | null, valid = true): TimingRow {
  return timingRow(
    flow,
    1,
    state,
    { seconds, usage: { inputTokens: 100, outputTokens, cachedTokens: null, calls: 1, firstCallSeconds: seconds } },
    valid,
    new Date("2026-10-26T22:00:00Z"),
    label,
  );
}

describe("evalLabel and evalRuns", () => {
  it("makes the label file-safe and has a default", () => {
    expect(evalLabel({ EVAL_LABEL: " Parallel 1 / varm " })).toBe("parallel-1-varm");
    expect(evalLabel({})).toBe("utan-etikett");
    expect(evalLabel({ EVAL_LABEL: "../" })).toBe("utan-etikett");
  });

  it("reads EVAL_RUNS with 3 as the default and at least 1", () => {
    expect(evalRuns({})).toBe(3);
    expect(evalRuns({ EVAL_RUNS: "5" })).toBe(5);
    expect(evalRuns({ EVAL_RUNS: "0" })).toBe(3);
    expect(evalRuns({ EVAL_RUNS: "-2" })).toBe(1);
    expect(evalRuns({ EVAL_RUNS: "x" })).toBe(3);
  });
});

describe("numbers", () => {
  it("takes the median of odd and even counts", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("gives tokens per second only when both are known", () => {
    expect(tokensPerSecond(100, 4)).toBe(25);
    expect(tokensPerSecond(null, 4)).toBeNull();
    expect(tokensPerSecond(100, 0)).toBeNull();
  });

  it("formats with one decimal, or a dash when unknown", () => {
    expect(formatNumber(12.345)).toBe("12.3");
    expect(formatNumber(12.345, 0)).toBe("12");
    expect(formatNumber(null)).toBe("–");
  });
});

describe("addUsage", () => {
  const empty = { inputTokens: null, outputTokens: null, cachedTokens: null, calls: 0, firstCallSeconds: null };

  it("adds the usage of each response and counts the calls", () => {
    const once = addUsage(empty, { usage: { prompt_tokens: 900, completion_tokens: 300 } });
    const twice = addUsage(once, {
      usage: { prompt_tokens: 950, completion_tokens: 310, prompt_tokens_details: { cached_tokens: 800 } },
    });
    expect(twice).toEqual({ inputTokens: 1850, outputTokens: 610, cachedTokens: 800, calls: 2, firstCallSeconds: null });
  });

  it("counts a call without usage and keeps the numbers unknown", () => {
    expect(addUsage(empty, { choices: [] })).toEqual({ ...empty, calls: 1 });
    expect(addUsage(empty, null)).toEqual({ ...empty, calls: 1 });
  });
});

describe("installUsageMeter", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("sums the usage of the chat completions made while measuring, and nothing else", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/chat/completions")
        ? { usage: { prompt_tokens: 1000, completion_tokens: 200 } }
        : { data: [{ id: "model" }] };
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const meter = installUsageMeter();

    await fetch("http://localhost:1234/v1/chat/completions");
    const measured = await meter.measure(async () => {
      await (await fetch("http://localhost:1234/v1/models")).json();
      const first = await (await fetch("http://localhost:1234/v1/chat/completions")).json();
      await fetch("http://localhost:1234/v1/chat/completions");
      return first as unknown;
    });

    expect(measured.value).toEqual({ usage: { prompt_tokens: 1000, completion_tokens: 200 } });
    expect(measured.usage).toMatchObject({ inputTokens: 2000, outputTokens: 400, cachedTokens: null, calls: 2 });
    expect(measured.usage.firstCallSeconds).toBeGreaterThanOrEqual(0);
    expect(measured.seconds).toBeGreaterThanOrEqual(0);
  });

  it("keeps each measured chat completion's text, tokens out and finish reason (Story 12.3)", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      const body = {
        choices: [{ message: { content: `svar ${call}` }, finish_reason: call === 2 ? "length" : "stop" }],
        usage: { completion_tokens: call * 1000 },
      };
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const meter = installUsageMeter();

    await fetch("http://localhost:1234/v1/chat/completions");
    const measured = await meter.measure(async () => {
      await fetch("http://localhost:1234/v1/chat/completions");
      await fetch("http://localhost:1234/v1/chat/completions");
    });
    expect(measured.attempts).toEqual([
      { content: "svar 2", outputTokens: 2000, finishReason: "length" },
      { content: "svar 3", outputTokens: 3000, finishReason: "stop" },
    ]);
    expect(measured.usage.outputTokens).toBe(5000);
    expect((await meter.measure(async () => {})).attempts).toEqual([]);
  });

  it("reads a body without choices or usage as an attempt with nothing known", () => {
    expect(attemptOf({})).toEqual({ content: null, outputTokens: null, finishReason: null });
    expect(attemptOf(null)).toEqual({ content: null, outputTokens: null, finishReason: null });
  });
});

describe("summarize", () => {
  it("groups by flow and label and takes the medians of the valid runs", () => {
    const rows = [
      row("förslag", "p4-varm", 40, 1600),
      row("förslag", "p4-varm", 50, 2000),
      row("förslag", "p4-varm", 116, null, false),
      row("förslag", "p1-varm", 30, 1500),
    ];
    const [p4, p1] = summarize(rows);
    expect(p4).toMatchObject({ flow: "förslag", label: "p4-varm", runs: 3, valid: 2, medianSeconds: 45, minSeconds: 40, maxSeconds: 50 });
    expect(p4.medianOutputTokens).toBe(1800);
    expect(p4.medianTokensPerSecond).toBe(40);
    expect(p1).toMatchObject({ label: "p1-varm", runs: 1, valid: 1, medianSeconds: 30 });
  });

  it("falls back to every run when none was valid", () => {
    const [entry] = summarize([row("nummer x", "kall", 20, null, false), row("nummer x", "kall", 30, null, false)]);
    expect(entry).toMatchObject({ valid: 0, medianSeconds: 25, medianOutputTokens: null, medianTokensPerSecond: null });
  });
});

describe("reports", () => {
  it("renders a row with dashes for unknown numbers and escapes pipes", () => {
    const [, , line] = renderRows([{ ...row("a|b", "kall", 12.34, null), idleSeconds: null, memoryFreePercent: null, compressedGb: null }]);
    expect(line).toBe("| a\\|b | kall | 1 | 12.3 | 100 | – | – | 1 | 12.3 | – | ja | – | – | – |");
  });

  it("writes Markdown and JSON per report and a summary over every report", () => {
    const dir = mkdtempSync(join(tmpdir(), "matkoll-timing-"));
    try {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      writeTimingReport("förslag", ["Läge: p4-varm"], [row("förslag", "p4-varm", 40, 1600)], dir);
      writeTimingReport("förslag", ["Läge: p1-varm"], [row("förslag", "p1-varm", 30, 1500)], dir);
      log.mockRestore();
      const files = readdirSync(dir);
      expect(files.filter((file) => file.endsWith(".json"))).toHaveLength(2);
      expect(files.filter((file) => file.endsWith(".md"))).toHaveLength(3);
      const summary = readFileSync(join(dir, "sammanfattning.md"), "utf8");
      expect(summary).toContain("| förslag | p1-varm | 1 | 1 | 30.0 |");
      expect(summary).toContain("| förslag | p4-varm | 1 | 1 | 40.0 |");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing without rows", () => {
    const dir = join(tmpdir(), "matkoll-timing-none");
    writeTimingReport("import", [], [], dir);
    expect(() => readdirSync(dir)).toThrow();
  });
});
