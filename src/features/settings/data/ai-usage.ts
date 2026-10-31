import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import type { ModelUsage } from "../domain/ai-usage";

// The user's rows in ai_usage (Story 17.6). RLS limits every call to them.

/** Saves one AI call's model and tokens. Throws SettingsDataError. */
export async function insertAiUsageIn(
  db: SettingsDb,
  usage: { model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  const { error } = await db
    .from("ai_usage")
    .insert({ model: usage.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens });
  if (error) throw new SettingsDataError(`insert_ai_usage_failed ${error.code}`);
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
