import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parseWeekAgentSettings, toStoredSettings, type WeekAgentSettings } from "../domain/settings";
import { weekProposalSchema, type ProposalStatus } from "../domain/proposal";
import type { WeekProposal } from "../domain/types";

// The tables household_week_agent_settings and week_agent_proposals (supabase/migrations/20261110130000_week_agent.sql).
// Every call runs with the signed-in member's session, so RLS keeps it to the member's own household. Errors carry a
// fixed reason and the database's code, never a dish or a setting.

type Db = SupabaseClient<Database>;

export class WeekAgentDataError extends Error {
  constructor(readonly detail: string) {
    super(`week_agent_data: ${detail}`);
    this.name = "WeekAgentDataError";
  }
}

export type StoredProposal = {
  id: string;
  weekStart: string;
  status: ProposalStatus;
  proposal: WeekProposal;
  model: string | null;
  createdAt: string;
};

/** The household's settings; the defaults when it has none (or a field that is not valid). Throws WeekAgentDataError when they cannot be read. */
export async function readSettingsIn(db: Db): Promise<WeekAgentSettings> {
  const { data, error } = await db.from("household_week_agent_settings").select("settings").maybeSingle();
  if (error) throw new WeekAgentDataError(`settings_read_failed ${error.code}`);
  return parseWeekAgentSettings(data?.settings ?? {});
}

/** Saves the household's settings: changes its row, or adds it. Two phones saving first at once end as one row. */
export async function saveSettingsIn(db: Db, settings: WeekAgentSettings): Promise<void> {
  const stored = toStoredSettings(settings) as unknown as Json;
  for (let attempt = 0; attempt < 2; attempt++) {
    const updated = await db.from("household_week_agent_settings").update({ settings: stored as NonNullable<Json> }).not("id", "is", null).select("id");
    if (updated.error) throw new WeekAgentDataError(`settings_save_failed ${updated.error.code}`);
    if (updated.data.length > 0) return;
    const inserted = await db.from("household_week_agent_settings").insert({ settings: stored as NonNullable<Json> });
    if (!inserted.error) return;
    if (inserted.error.code !== "23505") throw new WeekAgentDataError(`settings_save_failed ${inserted.error.code}`);
  }
  throw new WeekAgentDataError("settings_save_failed conflict");
}

type ProposalRow = Pick<Database["public"]["Tables"]["week_agent_proposals"]["Row"], "id" | "week_start" | "status" | "proposal" | "model" | "created_at">;

/** One stored row as the app's; null when what is stored is not a proposal the app knows. */
function toStored(row: ProposalRow): StoredProposal | null {
  const proposal = weekProposalSchema.safeParse(row.proposal);
  if (!proposal.success) return null;
  const status = row.status === "draft" || row.status === "used" || row.status === "discarded" ? row.status : null;
  if (!status) return null;
  return { id: row.id, weekStart: row.week_start, status, proposal: proposal.data as WeekProposal, model: row.model, createdAt: row.created_at };
}

const columns = "id, week_start, status, proposal, model, created_at";

/** The week's draft, if any. Throws WeekAgentDataError. */
export async function readDraftIn(db: Db, weekStart: string): Promise<StoredProposal | null> {
  const { data, error } = await db.from("week_agent_proposals").select(columns).eq("week_start", weekStart).eq("status", "draft").maybeSingle();
  if (error) throw new WeekAgentDataError(`draft_read_failed ${error.code}`);
  return data ? toStored(data) : null;
}

/**
 * Saves a new draft for the week: an earlier draft of that week is marked discarded first (one draft per week). Two
 * phones making one at once end with one draft. Returns the new id.
 */
export async function saveDraftIn(db: Db, weekStart: string, proposal: WeekProposal, model: string): Promise<string> {
  const checked = weekProposalSchema.parse(proposal);
  for (let attempt = 0; attempt < 2; attempt++) {
    const discarded = await db.from("week_agent_proposals").update({ status: "discarded" }).eq("week_start", weekStart).eq("status", "draft");
    if (discarded.error) throw new WeekAgentDataError(`draft_save_failed ${discarded.error.code}`);
    const inserted = await db.from("week_agent_proposals").insert({ week_start: weekStart, status: "draft", proposal: checked as unknown as NonNullable<Json>, model }).select("id").single();
    if (!inserted.error) return inserted.data.id;
    if (inserted.error.code !== "23505") throw new WeekAgentDataError(`draft_save_failed ${inserted.error.code}`);
  }
  throw new WeekAgentDataError("draft_save_failed conflict");
}

/** Replaces the content of a draft ("Gör om", a day locked or changed). False when the draft is no longer a draft. */
export async function updateDraftIn(db: Db, id: string, proposal: WeekProposal, model: string): Promise<boolean> {
  const checked = weekProposalSchema.parse(proposal);
  const { data, error } = await db.from("week_agent_proposals").update({ proposal: checked as unknown as NonNullable<Json>, model }).eq("id", id).eq("status", "draft").select("id");
  if (error) throw new WeekAgentDataError(`draft_update_failed ${error.code}`);
  return data.length > 0;
}

/** Marks a draft used ("Använd veckan") or discarded. False when it is not a draft any more (so it is never used twice). */
export async function finishDraftIn(db: Db, id: string, status: Exclude<ProposalStatus, "draft">): Promise<boolean> {
  const { data, error } = await db.from("week_agent_proposals").update({ status }).eq("id", id).eq("status", "draft").select("id");
  if (error) throw new WeekAgentDataError(`draft_finish_failed ${error.code}`);
  return data.length > 0;
}
