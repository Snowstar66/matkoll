"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { getRecipesByIds, listRecipeTitles, RecipeDataError } from "@/features/recipes/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { insertNoteIn, NoteDataError, setNoteDoneIn } from "../data/notes";
import { type NoteAction, type NoteInput, noteInputSchema, type RecipeTitle } from "../domain/note";

// Lappen på kylskåpet (Story 24.1): Skicka, Klar and its Ångra, and the
// recipe titles the write sheet matches the text against. Nothing is
// revalidated: the note card reads GET /api/notes itself, on every device.

/**
 * Skicka: a note (or, with `replyTo`, an answer) from the signed-in member to
 * the others. A recipe button keeps the recipe's own title, and is dropped
 * when the recipe is not the household's. Fails with `unauthorized`,
 * `validation`, `note_rate_limited` (more than 20 a day, kept by the
 * database) or `note_send_failed`.
 */
export async function sendNote(input: NoteInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    const planned = parsed.data.actions.flatMap((action) => (action.kind === "plan" ? [action.recipeId] : []));
    const recipes = new Map((planned.length ? await getRecipesByIds(planned) : []).map((recipe) => [recipe.id, recipe.title]));
    const seen = new Set<string>();
    const actions: NoteAction[] = parsed.data.actions.flatMap((action): NoteAction[] => {
      const key = action.kind === "plan" ? action.recipeId : "list";
      if (seen.has(key)) return [];
      seen.add(key);
      if (action.kind === "list") return [action];
      const title = recipes.get(action.recipeId);
      return title ? [{ kind: "plan", recipeId: action.recipeId, title }] : [];
    });
    const outcome = await insertNoteIn(await createClient(), { ...parsed.data, actions });
    if (outcome === "limited") return fail("note_rate_limited");
    return ok();
  } catch (error) {
    if (!(error instanceof NoteDataError) && !(error instanceof RecipeDataError)) throw error;
    console.error("note_send_failed", { reason: error.detail });
    return fail("note_send_failed");
  }
}

const idSchema = z.uuid();

/** Klar (`done` true) for the whole household, or its Ångra (false). Fails with `unauthorized`, `validation`, `note_gone` or `note_done_failed`. */
export async function setNoteDone(id: string, done: boolean): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(id).success || typeof done !== "boolean") return fail("validation");
  try {
    return (await setNoteDoneIn(await createClient(), id, done)) ? ok() : fail("note_gone");
  } catch (error) {
    if (!(error instanceof NoteDataError)) throw error;
    console.error("note_done_failed", { reason: error.detail });
    return fail("note_done_failed");
  }
}

/** The household's recipe titles, for the buttons the write sheet suggests. Empty when they cannot be read (no recipe buttons then). */
export async function noteRecipeTitles(): Promise<RecipeTitle[]> {
  const user = await requireUser();
  if (!user.ok) return [];
  try {
    return await listRecipeTitles();
  } catch (error) {
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("note_recipes_unavailable", { reason: error.detail });
    return [];
  }
}
