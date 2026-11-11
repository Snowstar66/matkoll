import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import type { ModelUsage } from "../domain/ai-usage";

// The household's rows in ai_usage (Story 17.6). Members read them through RLS; since the security
// review (S-03, supabase/migrations/…_ai_usage_reservation.sql) no client inserts them: every row is
// written by ai_usage_reserve and ai_usage_settle, as the signed-in user, in their household.

export type UsageRow = { model: string; inputTokens: number; outputTokens: number };

/** What ai_usage_reserve answers: the reservation (null when refused for too many rows today), and the household's day before it. */
export type UsageReservation = {
  reservation: string | null;
  capSek: number;
  exempt: boolean;
  tooMany: boolean;
  /** The household's tokens per model today before this reservation (empty for an exempt household). */
  today: ModelUsage[];
};

const toJson = (rows: readonly UsageRow[]) =>
  rows.map((row) => ({ model: row.model, input_tokens: row.inputTokens, output_tokens: row.outputTokens }));

/** Reserves `rows` (a call's worst case) as placeholders in the signed-in user's household. Throws SettingsDataError. */
export async function reserveAiUsageIn(db: SettingsDb, rows: readonly UsageRow[]): Promise<UsageReservation> {
  const { data, error } = await db.rpc("ai_usage_reserve", { usage: toJson(rows) });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new SettingsDataError(`reserve_ai_usage_failed ${error?.code ?? "shape"}`);
  const answer = data as { reservation?: unknown; cap_sek?: unknown; exempt?: unknown; too_many?: unknown; usage?: unknown };
  const today = Array.isArray(answer.usage) ? (answer.usage as { model: string; input_tokens: number; output_tokens: number }[]) : [];
  return {
    reservation: typeof answer.reservation === "string" ? answer.reservation : null,
    capSek: Number(answer.cap_sek),
    exempt: answer.exempt === true,
    tooMany: answer.too_many === true,
    today: today.map((row) => ({ model: row.model, calls: 0, inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) })),
  };
}

/** Replaces a reservation's placeholders with `rows` (none releases it). False when there was nothing to settle. Throws SettingsDataError. */
export async function settleAiUsageIn(db: SettingsDb, reservation: string, rows: readonly UsageRow[]): Promise<boolean> {
  const { data, error } = await db.rpc("ai_usage_settle", { reservation, usage: toJson(rows) });
  if (error) throw new SettingsDataError(`settle_ai_usage_failed ${error.code}`);
  return data === true;
}

/**
 * Saves one AI call's model and tokens after the fact (a call that made no reservation, such as the
 * mock's): a reservation of exactly that, settled at once. Throws SettingsDataError.
 */
export async function insertAiUsageIn(db: SettingsDb, usage: UsageRow): Promise<void> {
  const reserved = await reserveAiUsageIn(db, [usage]);
  if (!reserved.reservation) throw new SettingsDataError("insert_ai_usage_failed too_many");
  await settleAiUsageIn(db, reserved.reservation, [usage]);
}

/** The signed-in user's calls and tokens per model from `from` (inclusive) to `to` (exclusive). Throws SettingsDataError. */
export async function loadAiUsageIn(db: SettingsDb, from: Date, to: Date): Promise<ModelUsage[]> {
  const { data, error } = await db.rpc("ai_usage_month", { from_at: from.toISOString(), to_at: to.toISOString() });
  if (error) throw new SettingsDataError(`load_ai_usage_failed ${error.code}`);
  return data.map((row) => ({
    model: row.model,
    calls: Number(row.calls),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
  }));
}
