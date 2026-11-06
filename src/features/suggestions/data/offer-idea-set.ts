import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { staleSetMs, type OfferIdeaSetRow, type SavedIdea } from "../domain/offer-idea-set";

// offer_idea_set: the saved "Nya idéer med extrapris" of a household and offer week (one row each).
// RLS limits every call to the signed-in user's household. The claim is one conditional write, like
// store_offer's ai_matched_at, so two tabs never both run the model.

export type OfferIdeaDb = SupabaseClient<Database>;

/** A failed query. The message holds only a fixed reason and the Postgres code, never user data. */
export class OfferIdeaSetError extends Error {
  constructor(readonly detail: string) {
    super(`offer_idea_set: ${detail}`);
    this.name = "OfferIdeaSetError";
  }
}

/** The household's set for the offer week, or `null`. Throws OfferIdeaSetError. */
export async function loadSetIn(db: OfferIdeaDb, weekStart: string): Promise<OfferIdeaSetRow | null> {
  const { data, error } = await db
    .from("offer_idea_set")
    .select("status, claimed_at, intro, ideas, error_code")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new OfferIdeaSetError(`load ${error.code}`);
  return data ? { status: data.status, claimedAt: data.claimed_at, intro: data.intro, ideas: data.ideas, errorCode: data.error_code } : null;
}

/**
 * Takes the set for one run: a new row, or the existing one when it failed, when its run is gone (pending past
 * staleSetMs), or, with `replace`, when it is ready ("Andra idéer"). Gives the claim's token (`claimed_at`), which
 * finishing and failing must show, or `null` when someone else holds it or has it ready. Throws OfferIdeaSetError.
 */
export async function claimSetIn(db: OfferIdeaDb, weekStart: string, replace: boolean, now: Date): Promise<string | null> {
  const stamp = now.toISOString();
  const inserted = await db.from("offer_idea_set").insert({ week_start: weekStart, status: "pending", claimed_at: stamp });
  if (!inserted.error) return stamp;
  if (inserted.error.code !== "23505") throw new OfferIdeaSetError(`claim_insert ${inserted.error.code}`);
  const staleBefore = new Date(now.getTime() - staleSetMs).toISOString();
  const open = [`status.eq.failed`, `and(status.eq.pending,claimed_at.lt.${staleBefore})`, ...(replace ? [`status.eq.ready`] : [])].join(",");
  const { data, error } = await db
    .from("offer_idea_set")
    .update({ status: "pending", claimed_at: stamp, error_code: null, updated_at: stamp })
    .eq("week_start", weekStart)
    .or(open)
    .select("id");
  if (error) throw new OfferIdeaSetError(`claim_update ${error.code}`);
  return data.length > 0 ? stamp : null;
}

/** Saves the run's answer, if this run still holds the set. Throws OfferIdeaSetError. */
export async function finishSetIn(db: OfferIdeaDb, weekStart: string, token: string, answer: { intro: string; ideas: SavedIdea[] }): Promise<void> {
  const { error } = await db
    .from("offer_idea_set")
    .update({ status: "ready", intro: answer.intro, ideas: answer.ideas as unknown as NonNullable<Json>, error_code: null, updated_at: new Date().toISOString() })
    .eq("week_start", weekStart)
    .eq("status", "pending")
    .eq("claimed_at", token);
  if (error) throw new OfferIdeaSetError(`finish ${error.code}`);
}

/** Records that the run failed, with the app's error code, if this run still holds the set. Throws OfferIdeaSetError. */
export async function failSetIn(db: OfferIdeaDb, weekStart: string, token: string, errorCode: string): Promise<void> {
  const { error } = await db
    .from("offer_idea_set")
    .update({ status: "failed", error_code: errorCode.slice(0, 64), updated_at: new Date().toISOString() })
    .eq("week_start", weekStart)
    .eq("status", "pending")
    .eq("claimed_at", token);
  if (error) throw new OfferIdeaSetError(`fail ${error.code}`);
}
