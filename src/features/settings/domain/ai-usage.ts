import { claudeModels, sekPerUsd } from "./ai-choice";

// What the AI has cost this month (Story 17.6). Client-safe: pure functions
// over the rows the database groups per model. The price table is the one
// of Story 17.5 (claudeModels); a model that is not in it (Qwen in LM Studio,
// the mock) is local and costs 0 kr.

/** One model's calls and tokens in a month, as ai_usage_month gives them. */
export type ModelUsage = { model: string; calls: number; inputTokens: number; outputTokens: number };

/** What the section AI shows for the month. */
export type AiMonthUsage = {
  /** The month's name in Swedish, lower case: "oktober". */
  monthName: string;
  calls: number;
  costSek: number;
};

const timeZone = "Europe/Stockholm";

/** What `models` cost in kronor, from the price table; an unknown (local) model is 0. */
export function usageCostSek(models: readonly ModelUsage[]): number {
  let usd = 0;
  for (const { model, inputTokens, outputTokens } of models) {
    const price = claudeModels.find((candidate) => candidate.id === model);
    if (!price) continue;
    usd += (inputTokens * price.usdPerMTokIn + outputTokens * price.usdPerMTokOut) / 1_000_000;
  }
  return usd * sekPerUsd;
}

/** The year, month (1-12) and day of `at` on the clock in Stockholm. */
function stockholmDate(at: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "numeric" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month") };
}

/** Milliseconds Stockholm's clock is ahead of UTC at `at`. */
function offsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant midnight starts the 1st of `month` (1-12, may be 13 for January next year) in Stockholm. */
function monthStart(year: number, month: number): Date {
  const wallClock = Date.UTC(year, month - 1, 1);
  // The offset at the first guess may be the other side of a clock change; asking again at the corrected time settles it.
  const first = wallClock - offsetMs(new Date(wallClock));
  return new Date(wallClock - offsetMs(new Date(first)));
}

/** The calendar month `now` is in, on Stockholm's clock: from its first midnight (inclusive) to the next (exclusive). */
export function stockholmMonth(now: Date): { from: Date; to: Date; monthName: string } {
  const { year, month } = stockholmDate(now);
  const monthName = new Intl.DateTimeFormat("sv-SE", { timeZone, month: "long" }).format(now);
  return { from: monthStart(year, month), to: monthStart(year, month + 1), monthName };
}

const sekFormat = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "ca 1,20 kr"; "0 kr" when nothing was spent; at least "ca 0,01 kr" for a few öre. */
export function formatMonthCost(sek: number): string {
  if (sek <= 0) return "0 kr";
  return `ca ${sekFormat.format(Math.max(sek, 0.01))} kr`;
}

/** "Kostnad i oktober". */
export function costRowTitle(monthName: string): string {
  return `Kostnad i ${monthName}`;
}
