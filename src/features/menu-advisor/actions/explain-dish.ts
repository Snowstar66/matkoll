"use server";

import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, type Result } from "@/lib/errors";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import type { DishExplanation } from "@/server/ai";
import type { Menu } from "../domain/types";

/** The time the model gets: one short text call. */
const explainDeadlineMs = 25_000;

const languages: readonly Menu["sprak"][] = ["sv", "en", "es", "annat"];

/** What is asked about one dish: only text the menu itself gave, never a name of a person or anything of the household. */
export type ExplainDishRequest = {
  name: string;
  language: Menu["sprak"];
  restaurant: string | null;
  summary: string;
  ingredients: string[];
};

const oneLine = (text: unknown, max: number): string => (typeof text === "string" ? cutCodePoints(cleanModelText(text), max).trim() : "");

/**
 * "Mer om rätten" in Tolka menyn: one dish explained in Swedish (its Swedish name, what it is, how it tastes, where it
 * comes from), from the AI port's explainDish through getAiServiceForUser, so the daily cap is asked and the usage
 * counted. Called when a person taps for more, never in the background. Nothing is stored or logged. The text is the
 * model's reading of what the dish usually is, not what the restaurant serves.
 */
export async function explainDish(input: ExplainDishRequest): Promise<Result<DishExplanation>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const name = oneLine(input?.name, 120);
  if (name === "" || !languages.includes(input.language)) return fail("validation");
  const restaurant = oneLine(input.restaurant, 80);
  const ingredients = (Array.isArray(input.ingredients) ? input.ingredients : []).map((item) => oneLine(item, 40)).filter((item) => item !== "").slice(0, 12);
  try {
    const ai = await getAiServiceForUser();
    return await ai.explainDish(
      { name, language: input.language, restaurant: restaurant === "" ? null : restaurant, summary: oneLine(input.summary, 400), ingredients },
      AbortSignal.timeout(explainDeadlineMs + 5_000),
      { deadline: Date.now() + explainDeadlineMs },
    );
  } catch (error) {
    console.error("menu_explain_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return fail("ai_unavailable");
  }
}
