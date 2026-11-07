import { type ModelUsage, usageCostSek } from "./ai-usage";

// The daily AI cap per household (Tak för AI-kostnad per hushåll). Client-safe: pure functions
// over the rows the database groups per model (ai_cap_status, ai_cap_households). The price table
// stays the one in ai-usage.ts, so the database only sums tokens and the cost is worked out here.
// The figures are estimates: the Anthropic Console has the real bill.

/** The most the cap can be set to, and the least (0 = no AI for the households that are not exempt). */
export const aiCapBounds = { min: 0, max: 1000 } as const;

/** The cap before the owner has changed it (the same as the migration's default). */
export const defaultAiCapSek = 10;

/** What a flow shows when the cap stopped the call. */
export const aiCapReachedText = "Dagens AI-tak är nått – prova igen i morgon.";

/** A row of ai_cap_status as the database gives it: tokens per model today, or a null model without usage. */
export type CapStatusRow = { cap_sek: number; exempt: boolean; model: string | null; input_tokens: number; output_tokens: number };

/** A household's standing against the cap today. */
export type AiCapStatus = { capSek: number; exempt: boolean; spentSek: number };

/** Rows of tokens per model, as numbers (the database's bigint may arrive as a string). */
function toModelUsage(rows: readonly { model: string | null; input_tokens: number; output_tokens: number }[]): ModelUsage[] {
  return rows.flatMap((row) =>
    row.model === null ? [] : [{ model: row.model, calls: 0, inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) }],
  );
}

/** The caller's household today, from the rows of ai_cap_status; `null` for no rows (no household). */
export function capStatusFromRows(rows: readonly CapStatusRow[]): AiCapStatus | null {
  const first = rows[0];
  if (!first) return null;
  return { capSek: Number(first.cap_sek), exempt: first.exempt, spentSek: usageCostSek(toModelUsage(rows)) };
}

/**
 * True when the household may not ask the model any more today: not exempt, and today's cost has
 * reached the cap. A cap of 0 is reached at once (no AI for the households that are not exempt).
 */
export function aiCapReached(status: AiCapStatus): boolean {
  return !status.exempt && status.spentSek >= status.capSek;
}

/** A row of ai_cap_households: one household and one model (null without usage this month). */
export type HouseholdUsageRow = {
  household_id: string;
  name: string;
  members: string;
  exempt: boolean;
  cap_sek: number;
  model: string | null;
  day_input_tokens: number;
  day_output_tokens: number;
  month_input_tokens: number;
  month_output_tokens: number;
};

/** One line of the owner's list. */
export type HouseholdCost = {
  id: string;
  name: string;
  members: string;
  exempt: boolean;
  todaySek: number;
  monthSek: number;
  /** Today's cost has reached the cap (never for an exempt household). */
  capped: boolean;
};

/** The owner's list from ai_cap_households: one line per household, the most expensive this month first. */
export function householdCostsFromRows(rows: readonly HouseholdUsageRow[]): { capSek: number; households: HouseholdCost[] } {
  const byHousehold = new Map<string, HouseholdUsageRow[]>();
  for (const row of rows) byHousehold.set(row.household_id, [...(byHousehold.get(row.household_id) ?? []), row]);
  let capSek = defaultAiCapSek;
  const households = [...byHousehold.values()].map((group): HouseholdCost => {
    const first = group[0]!;
    capSek = Number(first.cap_sek);
    const todaySek = usageCostSek(toModelUsage(group.map((row) => ({ model: row.model, input_tokens: row.day_input_tokens, output_tokens: row.day_output_tokens }))));
    const monthSek = usageCostSek(toModelUsage(group.map((row) => ({ model: row.model, input_tokens: row.month_input_tokens, output_tokens: row.month_output_tokens }))));
    return {
      id: first.household_id,
      name: first.name,
      members: first.members,
      exempt: first.exempt,
      todaySek,
      monthSek,
      capped: aiCapReached({ capSek, exempt: first.exempt, spentSek: todaySek }),
    };
  });
  households.sort((a, b) => b.monthSek - a.monthSek || a.name.localeCompare(b.name, "sv"));
  return { capSek, households };
}

const sekFormat = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1,20 kr" (an estimate, so the owner's list never promises more than the price table knows). */
export function formatSek(sek: number): string {
  return `${sekFormat.format(Math.max(sek, 0))} kr`;
}

/** The cap as the field takes it, "10" or "7,5". */
export function capFieldText(capSek: number): string {
  return String(capSek).replace(".", ",");
}

/** The number typed in the cap field ("10", "7,5", "7.50"), or `null` when it is not 0 to 1000 kronor. */
export function parseCapInput(text: string): number | null {
  const clean = text.trim().replace(/\s*kr$/i, "").replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value >= aiCapBounds.min && value <= aiCapBounds.max ? value : null;
}
