import "server-only";
import { requireUser } from "@/features/auth/server";
import { MealPlanDataError } from "@/features/mealplan/server";
import { RecipeDataError } from "@/features/recipes/server";
import { createClient } from "@/lib/supabase/server";
import { readDraftByIdIn, readSettingsIn, WeekAgentDataError, type StoredProposal } from "../data/week-agent";
import type { WeekAgentSettings } from "../domain/settings";

// Shared by the actions (not a Server Action file itself): the signed-in check, the draft by id, and the one place
// that turns the modules' data errors into a Swedish message. Only reasons and codes are logged, never a dish.

export const messages = {
  signedOut: "Du behöver logga in igen.",
  invalid: "Något gick fel med uppgifterna. Försök igen.",
  noDraft: "Förslaget finns inte längre, eller är redan använt. Gör ett nytt.",
  unavailable: "Det gick inte att läsa eller spara just nu. Försök igen om en stund.",
  badWeek: "Veckan går inte att planera: välj den här veckan eller en kommande.",
  weekFull: "Alla dagar har redan en rätt.",
} as const;

export type Signed = { ok: true } | { ok: false; message: string };

export async function signedIn(): Promise<Signed> {
  const user = await requireUser();
  return user.ok ? { ok: true } : { ok: false, message: messages.signedOut };
}

/** Runs `run`; a data error of the modules the agent reads or writes becomes the message (logged by reason), anything else is a bug and is thrown. */
export async function guarded<T>(run: () => Promise<T>): Promise<T | { status: "error"; message: string }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof WeekAgentDataError || error instanceof MealPlanDataError || error instanceof RecipeDataError) {
      console.error("week_agent_failed", { reason: error.detail });
      return { status: "error", message: messages.unavailable };
    }
    throw error;
  }
}

export async function draftById(id: string): Promise<StoredProposal | null> {
  return readDraftByIdIn(await createClient(), id);
}

export async function settingsOfHousehold(): Promise<WeekAgentSettings> {
  return readSettingsIn(await createClient());
}
