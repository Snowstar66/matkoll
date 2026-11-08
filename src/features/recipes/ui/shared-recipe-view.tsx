"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import type { PantrySnapshot, SelectedSite, StapleRules } from "@/features/pantry";
import { fail, type AppError, type Result } from "@/lib/errors";
import { saveSharedRecipe } from "../actions/save-shared-recipe";
import { buyKey, type LineOffer } from "../domain/line-status";
import type { SavedRecipe } from "../domain/saved-recipe";
import { copyIngredientFor, sharedSavedNote } from "../domain/shared-recipe";
import type { AddToPlan, BuyMissing, RecipeWeek, RemoveFromPlan, UndoBuy } from "./recipe-body";
import { RecipeView } from "./recipe-view";

/** The household's copy: its id and its catalog ingredient for each line of the recipe as shown when it was saved. */
type Copy = { id: string; ingredientIds: (string | null)[] };

export type SharedRecipeViewProps = {
  /** The shared recipe as recipes.getSharedRecipeWithPantry gives it: lines matched to the household's own catalog. */
  recipe: SavedRecipe;
  /** "Delat av Lindqvists". */
  householdName: string;
  /** The household's copy, when it has saved the recipe already: "✓ Sparat" at once. */
  savedCopyId: string | null;
  /** The version of the lines shown (get_shared_recipe): saving refuses when they changed since. */
  version?: string;
  snapshot: PantrySnapshot | null;
  site?: SelectedSite | null;
  staples?: StapleRules;
  offers?: Record<string, LineOffer>;
  listedIds?: readonly string[];
  weeks?: readonly RecipeWeek[];
  defaultWeekStart?: string;
  addToPlan: AddToPlan;
  buyMissing: BuyMissing;
  undoBuy: UndoBuy;
  removeFromPlan: RemoveFromPlan;
};

/**
 * Another household's shared recipe, opened (/recept/delade/[id]): usable as it is (the steps and
 * their timers, the servings, what is at home in the household's own pantry), with "Delat av
 * Lindqvists" under the title and no heart and no menu. At the bottom, one above the other,
 * "Spara i mina recept" and "Lägg på matsedeln"; "Köp det som saknas (N)" is a text button beside
 * the portion selector.
 *
 * Spara makes the household's own copy (saveSharedRecipe; saving again gives the same copy) and
 * says "Sparat i dina recept" with "Öppna"; the button is then "✓ Sparat", and a quiet line says
 * the household that shares it sees who saved it. The meal plan and the shopping list hold only
 * own recipes, so "Lägg på matsedeln" and "Köp det som saknas" first save the copy quietly and
 * then act on it: the dish is the copy, and the items are the copy's ingredients (keyed by the
 * copy, so their "Ångra" finds them). One save at a time: a second tap waits for the first.
 * When the recipe changed since the page was read, the page is read again and says so.
 */
export function SharedRecipeView({ recipe, householdName, savedCopyId, version, addToPlan, buyMissing, undoBuy, ...rest }: SharedRecipeViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [savedId, setSavedId] = useState(savedCopyId ?? null);
  const [saving, setSaving] = useState(false);
  const copy = useRef<Copy | null>(null);
  const pending = useRef<Promise<Result<Copy>> | null>(null);
  const saveTapped = useRef(false);

  function ensureCopy(): Promise<Result<Copy>> {
    if (copy.current) return Promise.resolve({ ok: true, data: copy.current });
    pending.current ??= (async (): Promise<Result<Copy>> => {
      let result: Result<{ id: string; ingredientIds: (string | null)[] }>;
      try {
        result = await saveSharedRecipe(recipe.id, version);
      } catch {
        result = fail("recipe_shared_save_failed");
      }
      pending.current = null;
      if (!result.ok) return result;
      copy.current = { id: result.data.id, ingredientIds: result.data.ingredientIds };
      setSavedId(result.data.id);
      return { ok: true, data: copy.current };
    })();
    return pending.current;
  }

  /** A recipe that changed or stopped being shared is read again (the toast says why). */
  function refreshFor(error: AppError) {
    if (error.code === "recipe_shared_changed" || error.code === "recipe_shared_gone") router.refresh();
  }

  /** The copy's ingredient for an ingredient shown (by its line), or null. */
  function copyIngredient(target: Copy, viewIngredientId: string): string | null {
    return copyIngredientFor(recipe.lines, target.ingredientIds, viewIngredientId);
  }

  /** The key RecipeBody made with the shared recipe's id and the shown ingredient, as the copy's. */
  function copyKey(key: string, target: Copy): string | null {
    const prefix = buyKey(recipe.id, "");
    if (!key.startsWith(prefix)) return null;
    const ingredientId = copyIngredient(target, key.slice(prefix.length));
    return ingredientId ? buyKey(target.id, ingredientId) : null;
  }

  async function save() {
    if (saveTapped.current || savedId) return;
    saveTapped.current = true;
    setSaving(true);
    const result = await ensureCopy();
    setSaving(false);
    saveTapped.current = false;
    if (result.ok) {
      const id = result.data.id;
      showToast("Sparat i dina recept", { show: { label: "Öppna", onShow: () => router.push(`/recept/${id}`) } });
    } else if (result.error.code === "unauthorized") router.refresh();
    else {
      refreshFor(result.error);
      showToast(result.error.message, { role: "alert" });
    }
  }

  // A failed quiet copy goes back to RecipeBody, which shows its message (and refreshes for unauthorized).
  const addCopyToPlan: AddToPlan = async (input) => {
    const target = await ensureCopy();
    if (!target.ok) {
      refreshFor(target.error);
      return target;
    }
    return addToPlan({ ...input, recipeId: target.data.id });
  };

  const buyForCopy: BuyMissing = async ({ items }) => {
    const target = await ensureCopy();
    if (!target.ok) {
      refreshFor(target.error);
      return target;
    }
    const mapped = items.flatMap((item) => {
      const key = copyKey(item.key, target.data);
      const ingredientId = item.ingredientId ? copyIngredient(target.data, item.ingredientId) : null;
      return key && ingredientId ? [{ key, label: item.label, ingredientId }] : [];
    });
    if (mapped.length === 0) return fail("recipe_shared_save_failed");
    return buyMissing({ items: mapped });
  };

  const undoForCopy: UndoBuy = async ({ keys }) => {
    const target = copy.current;
    if (!target) return fail("shopping_remove_failed");
    return undoBuy({ keys: keys.flatMap((key) => copyKey(key, target) ?? []) });
  };

  const saveButton = (
    <Button variant="secondary" disabled={saving || savedId !== null} onClick={save} data-testid="save-shared" className="w-full">
      {savedId ? (
        <>
          <CheckIcon size={20} className="shrink-0" />
          Sparat
        </>
      ) : (
        "Spara i mina recept"
      )}
    </Button>
  );

  return (
    <RecipeView
      {...rest}
      recipe={recipe}
      withFavorite={false}
      sharedBy={householdName}
      sharedNote={savedId ? sharedSavedNote : undefined}
      buyInline
      stackActions
      extraAction={saveButton}
      addToPlan={addCopyToPlan}
      buyMissing={buyForCopy}
      undoBuy={undoForCopy}
    />
  );
}
