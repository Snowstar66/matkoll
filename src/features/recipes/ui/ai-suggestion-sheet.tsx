"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AiBadge } from "@/components/badges";
import { Button } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, fail } from "@/lib/errors";
import { saveRecipe } from "../actions/save-recipe";
import { isDraftDirty } from "../domain/preview";
import { validateDraft, type PendingFieldText, type RecipeDraft } from "../domain/recipe-draft";
import { RecipePreview } from "./recipe-preview";
import type { ShownSuggestion } from "./use-dish-suggestions";

// "Spara AI-förslag" (FR-23, AD-10): the preview of an AI suggestion with the
// AI label at the top, as for an import. Nothing is saved until "Spara
// recept", which calls saveRecipe with the suggestion's id (new catalog ingredients are created then)
// and opens the recipe view, where the source is "AI-förslag" and the label is
// gone. Mounted afresh for each suggestion it opens (the caller's `key`).

export type AiSuggestionSheetProps = {
  /** The suggestion to save; `null` keeps the sheet closed. */
  suggestion: ShownSuggestion | null;
  onClose: () => void;
  /** The suggestion was saved: it leaves the section, and the sheet closes. */
  onSaved: (key: number) => void;
  searchIngredients: SearchIngredients;
};

export function AiSuggestionSheet({ suggestion, onClose, onSaved, searchIngredients }: AiSuggestionSheetProps) {
  const [draft, setDraft] = useState<RecipeDraft | null>(suggestion?.draft ?? null);
  const [names, setNames] = useState<Readonly<Record<string, string>>>(suggestion?.ingredientNames ?? {});
  /** Typed text in the preview that did not become a value. */
  const [pending, setPending] = useState<PendingFieldText>({});
  const [saving, startSaving] = useTransition();
  /** Why "Spara recept" failed; the preview stays as it was. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();

  const isDirty = suggestion !== null && draft !== null && isDraftDirty(draft, suggestion.draft, pending);
  const errors = draft ? validateDraft(draft, pending) : {};
  /** "Spara recept" saves only a valid draft. */
  const isValid = Object.keys(errors).length === 0;

  /** "Spara recept": saves the draft, then closes the sheet and opens the recipe view. */
  function save() {
    if (!suggestion || !draft || !isValid || saving) return;
    setSaveError(null);
    startSaving(async () => {
      let result: Awaited<ReturnType<typeof saveRecipe>>;
      try {
        // The suggestion's own id, so saving it again never makes a copy.
        result = await saveRecipe(draft, suggestion.recipeId);
      } catch {
        // The connection broke or the server failed: nothing to show but the save error.
        result = fail("recipe_save_failed");
      }
      if (!result.ok) {
        setSaveError(result.error.code === "unauthorized" ? result.error.message : errorMessages.recipe_save_failed);
        return;
      }
      onSaved(suggestion.key);
      router.push(`/recept/${result.data.id}`);
      showToast("Receptet är sparat.");
    });
  }

  return (
    <Sheet
      open={suggestion !== null}
      onClose={onClose}
      title="Spara AI-förslag"
      closeLabel="Stäng"
      isDirty={isDirty}
      preventClose={saving}
      footer={
        draft ? (
          <>
            {saveError ? <Notice role="alert">{saveError}</Notice> : null}
            <Button fullWidth disabled={!isValid || saving} onClick={save}>
              {saving ? "Sparar …" : "Spara recept"}
            </Button>
          </>
        ) : null
      }
    >
      {draft ? (
        // Nothing in the preview can change while it is being saved.
        <div data-valid={isValid} inert={saving}>
          <RecipePreview
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
            badge={<AiBadge />}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
