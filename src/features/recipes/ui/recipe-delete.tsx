"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { deleteRecipe } from "../actions/delete-recipe";

/** The question before "Ta bort recept" (Story 13.2), from the recipe's title. */
export function deleteRecipeQuestion(title: string, onMenu: boolean): string {
  const base = `Ta bort receptet ${title}? Det går inte att ångra.`;
  return onMenu ? `${base} Den ligger på matsedeln och tas bort därifrån.` : base;
}

export type DeleteTarget = { id: string; title: string; onMenu: boolean };

/**
 * Asks, then deletes a recipe with deleteRecipe (Story 1.11 semantics: the
 * dish leaves the current meal plan, earlier plans keep it without the
 * recipe). `ask` opens the question; `onDeleted` runs after a success. The
 * question sits behind this one hook so Story 13.1's shared smart confirm can
 * replace `dialog` without touching the callers.
 */
export function useRecipeDelete(onDeleted: (id: string) => void): {
  ask: (target: DeleteTarget) => void;
  dialog: ReactNode;
} {
  const { showToast } = useToast();
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  function remove() {
    if (!target || deleting) return;
    const { id } = target;
    setError(null);
    startDeleting(async () => {
      let result: Result<{ id: string }>;
      try {
        result = await deleteRecipe(id);
      } catch {
        result = fail("recipe_delete_failed");
      }
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setTarget(null);
      onDeleted(id);
      showToast("Receptet är borttaget.");
    });
  }

  const dialog = (
    <Sheet
      open={target !== null}
      onClose={() => setTarget(null)}
      title="Ta bort recept"
      closeLabel="Stäng"
      preventClose={deleting}
      footer={
        <>
          {error ? <Notice role="alert">{error}</Notice> : null}
          <Button fullWidth disabled={deleting} onClick={remove}>
            {deleting ? "Tar bort …" : "Ta bort"}
          </Button>
          <Button variant="text" fullWidth autoFocus disabled={deleting} onClick={() => setTarget(null)}>
            Avbryt
          </Button>
        </>
      }
    >
      <p role="alert" className="text-body text-ink">
        {target ? deleteRecipeQuestion(target.title, target.onMenu) : ""}
      </p>
    </Sheet>
  );

  return {
    ask: (next) => {
      setError(null);
      setTarget(next);
    },
    dialog,
  };
}
