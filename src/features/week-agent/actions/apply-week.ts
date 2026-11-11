"use server";

import { z } from "zod";
import { clampServings } from "@/features/mealplan";
import { addAgentDishes, undoAgentDishes, type WeekDish } from "@/features/mealplan/server";
import { getShoppingList } from "@/features/shopping/server";
import { createClient } from "@/lib/supabase/server";
import { finishDraftIn, finishDraftUsedIn, readDraftAnyStatusIn, reopenUsedDraftIn } from "../data/week-agent";
import { appliedWeekSchema } from "../domain/proposal";
import { applyPlan } from "../domain/apply";
import { dishIdFor } from "../dish-id";
import { isPlannableWeek, readApplyFacts } from "../context";
import type { ApplyWeekInput, ApplyWeekResult, DiscardDraftInput, OkOrError, UndoWeekInput, UndoWeekResult } from "./contract";
import { draftById, guarded, messages, signedIn } from "./support";

const applySchema = z.object({ draftId: z.uuid(), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), overwrite: z.boolean().optional(), replaceAgentDays: z.boolean().optional() });
const discardSchema = z.object({ draftId: z.uuid() });
const undoSchema = z.object({ draftId: z.uuid() });

/**
 * "Använd veckan": writes the draft's proposed dishes into the household's meal plan for the week (meal_plan_recipe
 * with source 'week_agent'), on the days that are EMPTY now. A day that already has a dish is skipped
 * (`skippedOccupied`) and the proposal's own fixed days are never written again. Two explicit ways to take a day over:
 * `replaceAgentDays` (full-week "Gör om": a day whose dishes the agent put there is replaced; the household's own days
 * are never touched) and `overwrite` (the household confirmed: any day). A dish is only replaced when "Ångra" can put
 * it back (it has a recipe and is not marked cooked); otherwise its day counts as occupied and is skipped. What was
 * written and what was replaced is kept on the used draft so `undoWeek` can take exactly that back. The draft is marked
 * used, so it is never applied twice; when nothing was written but days were skipped, the draft is kept so the household
 * can confirm. The shopping list needs no call of its own: it is derived from the week's plan, and the write revalidates it.
 */
export async function applyWeek(input: ApplyWeekInput): Promise<ApplyWeekResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const { draftId, weekStart, overwrite = false, replaceAgentDays = false } = parsed.data;
  if (!isPlannableWeek(weekStart)) return { status: "error", message: messages.badWeek };

  return guarded(async (): Promise<ApplyWeekResult> => {
    const draft = await draftById(draftId);
    if (!draft || draft.weekStart !== weekStart) return { status: "error", message: messages.noDraft };

    const { dishes, servingsOf } = await readApplyFacts(weekStart);
    // The dishes this very draft wrote earlier (a retry) are ours, never "occupied" and never "replaced".
    const own = new Set(draft.proposal.days.map((day) => dishIdFor(draftId, day.dayIndex)));
    const others = dishes.filter((dish) => !own.has(dish.id));
    const takeable = (dish: WeekDish) => overwrite || (replaceAgentDays && dish.source === "week_agent");
    // A day is occupied when a dish on it may not be taken over; a dish that "Ångra" could not put back is never taken.
    const restorable = (dish: WeekDish) => dish.recipeId !== null && dish.cookedAt === null;
    const occupied = others.flatMap((dish) => (dish.weekday === null || (takeable(dish) && restorable(dish)) ? [] : [dish.weekday]));
    const plan = applyPlan(draft.proposal, occupied, false);
    const skippedOccupied = plan.skippedOccupied.map((day) => day.dayIndex);
    if (plan.write.some((day) => servingsOf(day.recipeId ?? "") === null)) return { status: "error", message: "Ett recept i förslaget finns inte längre. Gör ett nytt förslag." };

    if (plan.write.length === 0) {
      // Nothing to write: with days skipped the draft stays (the household may confirm), otherwise there was nothing to do.
      if (skippedOccupied.length === 0) await finishDraftUsedIn(await createClient(), draftId, draft.proposal, { writtenDays: [], replaced: [] });
      return { status: "ok", written: [], skippedOccupied };
    }

    const writeDays = new Set(plan.write.map((day) => day.dayIndex));
    const replaced = others.flatMap((dish) => (dish.weekday !== null && writeDays.has(dish.weekday) && takeable(dish) && dish.recipeId ? [{ id: dish.id, recipeId: dish.recipeId, recipeTitle: dish.recipeTitle, servings: dish.servings, weekday: dish.weekday, source: dish.source === "week_agent" ? ("week_agent" as const) : ("user" as const) }] : []));
    const applied = appliedWeekSchema.safeParse({ writtenDays: [...writeDays].sort((a, b) => a - b), replaced });
    // More to put back than the store keeps: refuse rather than write something that cannot be undone.
    if (!applied.success) return { status: "error", message: "Det är för många rätter att byta ut på en gång. Behåll några av dina egna och försök igen." };

    await addAgentDishes(
      weekStart,
      plan.write.map((day) => ({
        id: dishIdFor(draftId, day.dayIndex),
        recipeId: day.recipeId ?? "",
        recipeTitle: day.title ?? "",
        servings: clampServings(servingsOf(day.recipeId ?? "") ?? 4),
        weekday: day.dayIndex,
      })),
      replaced.map((dish) => dish.id),
    );
    // Another phone may have used the draft in the same moment: the dish ids are the same, so nothing was added twice.
    await finishDraftUsedIn(await createClient(), draftId, draft.proposal, applied.data);
    return { status: "ok", written: plan.write.map((day) => day.dayIndex), skippedOccupied, toBuy: await shoppingLineCount(weekStart) };
  });
}

/** "14 varor att köpa": the lines of the week's shopping list now (the list is derived from the plan minus the pantry, so it already holds the new dishes). A help: null when the list cannot be read. */
async function shoppingLineCount(weekStart: string): Promise<number | null> {
  try {
    const list = await getShoppingList(weekStart);
    return list.ok ? list.data.lines.length : null;
  } catch {
    return null;
  }
}

/**
 * "Ångra" ("Använd veckan"): takes back exactly what `applyWeek` did for the draft: removes the dishes it wrote
 * (their ids are derived from the draft and the day) and puts back the dishes it replaced on their days, then the
 * draft is a draft again (or discarded, when the week got another draft meanwhile). Household-scoped (RLS). Safe to
 * run twice: a draft that is not used (never applied, already undone, discarded) answers ok with nothing removed.
 * The household's own days that apply never touched are not touched here either.
 */
export async function undoWeek(input: UndoWeekInput): Promise<UndoWeekResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  return guarded(async (): Promise<UndoWeekResult> => {
    const db = await createClient();
    const used = await readDraftAnyStatusIn(db, parsed.data.draftId);
    if (!used) return { status: "error", message: messages.noDraft };
    if (used.status !== "used") return { status: "ok", removed: [], restored: [] };
    const applied = used.applied ?? { writtenDays: [], replaced: [] };
    await undoAgentDishes(
      used.weekStart,
      applied.writtenDays.map((day) => dishIdFor(used.id, day)),
      applied.replaced.map((dish) => ({ id: dish.id, recipeId: dish.recipeId, recipeTitle: dish.recipeTitle, servings: dish.servings, weekday: dish.weekday, source: dish.source })),
    );
    await reopenUsedDraftIn(db, used.id, used.proposal);
    return { status: "ok", removed: applied.writtenDays, restored: applied.replaced.map((dish) => dish.weekday) };
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
