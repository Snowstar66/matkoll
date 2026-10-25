"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { deleteRecipe } from "../actions/delete-recipe";
import { updateRecipe } from "../actions/update-recipe";
import { savedIngredientNames, toEditableDraft } from "../domain/editable-draft";
import { isDraftDirty, isShownField } from "../domain/preview";
import { validateDraft, type PendingFieldText, type RecipeDraft } from "../domain/recipe-draft";
import type { SavedRecipe } from "../domain/saved-recipe";
import type { SearchIngredients } from "./ingredient-picker";
import { RecipePreview } from "./recipe-preview";

// Ändra recept (FR-6, FR-10, Story 1.11): the preview's form for a saved
// recipe, with "Spara ändringar" and, at the bottom, "Ta bort recept". Saving
// calls updateRecipe and stays in the recipe view; removing asks first, in the
// same sheet, then calls deleteRecipe and goes to the library. Sheets never
// stack (EXPERIENCE.md, Ark), so the question replaces the form until
// "Avbryt" brings it back as it was.

export type EditRecipeSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The recipe as saved. */
  recipe: SavedRecipe;
  /**
   * Increases each time the sheet opens: the form then starts afresh from
   * `recipe`. (The sheet itself stays mounted; a sheet mounted already open
   * would be closed by React's double effects in development.)
   */
  session: number;
  searchIngredients: SearchIngredients;
};

/** For a schema error on something the form has no field for (image address, source). */
export const unshownErrorMessage = "Receptet har en uppgift som inte går att spara, till exempel bildadressen eller källan.";

export function EditRecipeSheet({ open, onClose, recipe, session, searchIngredients }: EditRecipeSheetProps) {
  const [formSession, setFormSession] = useState(session);
  const [initial, setInitial] = useState<RecipeDraft>(() => toEditableDraft(recipe));
  /** The recipe's updated_at when the form was filled; updateRecipe refuses a recipe changed since. */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(recipe.updatedAt);
  const [draft, setDraft] = useState<RecipeDraft>(initial);
  const [names, setNames] = useState<Readonly<Record<string, string>>>(() => savedIngredientNames(recipe));
  const [pending, setPending] = useState<PendingFieldText>({});
  const [view, setView] = useState<"form" | "confirmDelete">("form");
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  /** Why "Spara ändringar" or "Ta bort" failed; the form stays as it was. */
  const [error, setError] = useState<string | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  // A new session: the form starts from the recipe as last saved (state adjusted while rendering).
  if (session !== formSession) {
    const fresh = toEditableDraft(recipe);
    setFormSession(session);
    setInitial(fresh);
    setBaseUpdatedAt(recipe.updatedAt);
    setDraft(fresh);
    setNames(savedIngredientNames(recipe));
    setPending({});
    setView("form");
    setError(null);
  }

  const errors = validateDraft(draft, pending);
  const isValid = Object.keys(errors).length === 0;
  const isDirty = isDraftDirty(draft, initial, pending);
  /** Errors on what the form has no field for; without a notice, save would just be disabled. */
  const hasUnshownErrors = Object.keys(errors).some((path) => !isShownField(path));
  const busy = saving || deleting;

  function save() {
    if (!isValid || busy) return;
    setError(null);
    startSaving(async () => {
      let result: Result<{ id: string }>;
      try {
        result = await updateRecipe(recipe.id, draft, baseUpdatedAt);
      } catch {
        // The connection broke or the server failed.
        result = fail("recipe_save_failed");
      }
      if (!result.ok) {
        setError(result.error.message);
        // Changed elsewhere: fetch the recipe again, so the form opens from it next time.
        if (result.error.code === "recipe_conflict") router.refresh();
        return;
      }
      // The action revalidated the recipe, so the view behind shows the change.
      onClose();
      showToast("Ändringarna är sparade.");
    });
  }

  function remove() {
    if (busy) return;
    setError(null);
    startDeleting(async () => {
      let result: Result<{ id: string }>;
      try {
        result = await deleteRecipe(recipe.id);
      } catch {
        result = fail("recipe_delete_failed");
      }
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Navigate first, in the same transition as the action's revalidated
      // page, so the gone recipe's "Sidan finns inte." never shows. Replace, so
      // "back" never leads to it either.
      router.replace("/recept");
      onClose();
      showToast("Receptet är borttaget.");
    });
  }

  function askDelete() {
    setError(null);
    setView("confirmDelete");
  }

  function keepRecipe() {
    setError(null);
    setView("form");
    // Back to where the question came from.
    requestAnimationFrame(() => deleteButton.current?.focus());
  }

  const footer =
    view === "confirmDelete" ? (
      <>
        <p role="alert" className="text-body text-ink">
          Ta bort {recipe.title}? Det går inte att ångra.
        </p>
        {error ? <Notice role="alert">{error}</Notice> : null}
        <Button fullWidth disabled={deleting} onClick={remove}>
          {deleting ? "Tar bort …" : "Ta bort"}
        </Button>
        <Button variant="text" fullWidth autoFocus disabled={deleting} onClick={keepRecipe}>
          Avbryt
        </Button>
      </>
    ) : (
      <>
        {hasUnshownErrors ? <Notice>{unshownErrorMessage}</Notice> : null}
        {error ? <Notice role="alert">{error}</Notice> : null}
        <Button fullWidth disabled={!isValid || saving} onClick={save}>
          {saving ? "Sparar …" : "Spara ändringar"}
        </Button>
      </>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={view === "confirmDelete" ? "Ta bort recept" : "Ändra recept"}
      closeLabel="Stäng"
      isDirty={isDirty}
      preventClose={busy}
      footer={footer}
    >
      {/* Hidden, not unmounted, while asking, so "Avbryt" keeps every change. Nothing changes while saving. */}
      <div hidden={view === "confirmDelete"} inert={busy} data-valid={isValid}>
        <RecipePreview
          key={formSession}
          draft={draft}
          names={names}
          onChange={(next, nextNames) => {
            setDraft(next);
            setNames(nextNames);
          }}
          pending={pending}
          onPendingChange={setPending}
          errors={errors}
          searchIngredients={searchIngredients}
          end={
            <div className="border-t border-hairline pt-3">
              <Button ref={deleteButton} variant="text" onClick={askDelete} className="-ml-3">
                Ta bort recept
              </Button>
            </div>
          }
        />
      </div>
    </Sheet>
  );
}
