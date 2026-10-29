"use client";

import type { ReactNode } from "react";
import { useConfirmDelete } from "@/components/confirm-delete";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { deleteRecipe } from "../actions/delete-recipe";

/** The question before "Ta bort recept" (Story 13.2), from the recipe's title. */
export function deleteRecipeQuestion(title: string): string {
  return `Ta bort receptet ${title}? Det går inte att ångra.`;
}

/** Said under the question when the recipe is on the current meal plan (Story 1.11 semantics). */
export const onMenuDetail = "Den ligger på matsedeln och tas bort därifrån.";

export type DeleteTarget = { id: string; title: string; onMenu: boolean };

/**
 * Deletes a recipe with deleteRecipe after Story 13.1's smart confirm (and
 * its 60 s grace window). The dish leaves the current meal plan; earlier plans
 * keep it without the recipe. `ask` is for the trash buttons; `onDeleted` runs
 * after a success, then the toast says so; a failure shows its message in the
 * toast and keeps the recipe.
 */
export function useRecipeDelete(onDeleted: (id: string) => void): {
  ask: (target: DeleteTarget) => void;
  dialog: ReactNode;
} {
  const { showToast } = useToast();
  const { requestDelete, dialog } = useConfirmDelete();

  async function remove(id: string) {
    let result: Result<{ id: string }>;
    try {
      result = await deleteRecipe(id);
    } catch {
      result = fail("recipe_delete_failed");
    }
    if (!result.ok) {
      showToast(result.error.message);
      return;
    }
    onDeleted(id);
    showToast("Receptet är borttaget.");
  }

  return {
    ask: ({ id, title, onMenu }) =>
      requestDelete({
        question: deleteRecipeQuestion(title),
        detail: onMenu ? onMenuDetail : undefined,
        onConfirm: () => remove(id),
      }),
    dialog,
  };
}
