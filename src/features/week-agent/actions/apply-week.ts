"use server";

import { z } from "zod";
import { clampServings } from "@/features/mealplan";
import { addAgentDishes } from "@/features/mealplan/server";
import { createClient } from "@/lib/supabase/server";
import { finishDraftIn } from "../data/week-agent";
import { applyPlan } from "../domain/apply";
import { dishIdFor } from "../dish-id";
import { isPlannableWeek, readApplyFacts } from "../context";
import type { ApplyWeekInput, ApplyWeekResult, DiscardDraftInput, OkOrError } from "./contract";
import { draftById, guarded, messages, signedIn } from "./support";

const applySchema = z.object({ draftId: z.uuid(), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), overwrite: z.boolean().optional() });
const discardSchema = z.object({ draftId: z.uuid() });

/**
 * "Använd veckan": writes the draft's proposed dishes into the household's meal plan for the week (meal_plan_recipe
 * with source 'week_agent'), on the days that are EMPTY now. A day that already has a dish is skipped
 * (`skippedOccupied`) unless `overwrite` is true, and the proposal's own fixed days are never written again. The
 * draft is marked used, so it is never applied twice; when every proposed day was occupied and nothing was written,
 * the draft is kept so the household can confirm `overwrite`. The shopping list needs no call of its own: it is
 * derived from the week's plan, and the write revalidates it.
 */
export async function applyWeek(input: ApplyWeekInput): Promise<ApplyWeekResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const { draftId, weekStart, overwrite = false } = parsed.data;
  if (!isPlannableWeek(weekStart)) return { status: "error", message: messages.badWeek };

  return guarded(async (): Promise<ApplyWeekResult> => {
    const draft = await draftById(draftId);
    if (!draft || draft.weekStart !== weekStart) return { status: "error", message: messages.noDraft };

    const { dishes, servingsOf } = await readApplyFacts(weekStart);
    const occupied = dishes.flatMap((dish) => (dish.weekday === null ? [] : [dish.weekday]));
    const plan = applyPlan(draft.proposal, occupied, overwrite);
    const skippedOccupied = plan.skippedOccupied.map((day) => day.dayIndex);
    if (plan.write.some((day) => servingsOf(day.recipeId ?? "") === null)) return { status: "error", message: "Ett recept i förslaget finns inte längre. Gör ett nytt förslag." };

    if (plan.write.length === 0) {
      // Nothing to write: with days skipped the draft stays (the household may confirm overwrite), otherwise there was nothing to do.
      if (skippedOccupied.length === 0) await finishDraftIn(await createClient(), draftId, "used");
      return { status: "ok", written: [], skippedOccupied };
    }

    const replaceDishIds = overwrite ? dishes.flatMap((dish) => (dish.weekday !== null && plan.write.some((day) => day.dayIndex === dish.weekday) ? [dish.id] : [])) : [];
    await addAgentDishes(
      weekStart,
      plan.write.map((day) => ({
        id: dishIdFor(draftId, day.dayIndex),
        recipeId: day.recipeId ?? "",
        recipeTitle: day.title ?? "",
        servings: clampServings(servingsOf(day.recipeId ?? "") ?? 4),
        weekday: day.dayIndex,
      })),
      replaceDishIds,
    );
    // Another phone may have used the draft in the same moment: the dish ids are the same, so nothing was added twice.
    await finishDraftIn(await createClient(), draftId, "used");
    return { status: "ok", written: plan.write.map((day) => day.dayIndex), skippedOccupied };
  });
}

/** Throws the draft away ("Släng förslaget"). Fails when it is not a draft any more (used or already discarded). */
export async function discardDraft(input: DiscardDraftInput): Promise<OkOrError> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  return guarded(async (): Promise<OkOrError> => {
    const done = await finishDraftIn(await createClient(), parsed.data.draftId, "discarded");
    return done ? { status: "ok" } : { status: "error", message: messages.noDraft };
  });
}
