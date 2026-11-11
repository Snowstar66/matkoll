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
  noDraft: "Det här förslaget är inte längre aktuellt. Vi hämtar ett nytt.",
  unavailable: "Det gick inte att läsa eller spara just nu. Försök igen om en stund.",
  badWeek: "Veckan går inte att planera: välj den här veckan eller en kommande.",
  weekFull: "Alla dagar har redan en rätt.",
  /** The week already holds as many dinners as the setting says, but these days have no dish. */
  dinnersReached: (dinners: number, emptyDays: readonly string[]) => {
    const list = emptyDays.length > 1 ? `${emptyDays.slice(0, -1).join(", ")} och ${emptyDays[emptyDays.length - 1]}` : (emptyDays[0] ?? "");
    return `Veckan har redan ${dinners} middagar, så många som du ställt in. ${list.charAt(0).toLocaleUpperCase("sv-SE")}${list.slice(1)} har ingen rätt. Höj antalet middagar i Ställ in om agenten ska fylla fler.`;
  },
} as const;

/** The answer when the draft a screen holds is gone (used, replaced from elsewhere, discarded). Carries a code so the screen reads the week again instead of matching on the text. */
export const noDraftError = { status: "error", message: messages.noDraft, code: "no_draft" } as const;

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
