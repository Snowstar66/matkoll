"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import type { PantrySnapshot, SelectedSite, StapleRules } from "@/features/pantry";
import { fail, type Result } from "@/lib/errors";
import { saveSharedRecipe } from "../actions/save-shared-recipe";
import { buyKey, type LineOffer } from "../domain/line-status";
import type { SavedRecipe } from "../domain/saved-recipe";
import { copyIngredientMap } from "../domain/shared-recipe";
import type { AddToPlan, BuyMissing, RecipeWeek, RemoveFromPlan, UndoBuy } from "./recipe-body";
import { RecipeView } from "./recipe-view";

type Copy = { id: string; ingredients: Map<string, string> };

export type SharedRecipeViewProps = {
  /** The shared recipe as recipes.getSharedRecipeWithPantry gives it: lines matched to the household's own catalog. */
  recipe: SavedRecipe;
  /** "Delat av Lindqvists". */
  householdName: string;
  /** The household's copy, when it has saved the recipe already: "✓ Sparat" at once. */
  savedCopyId: string | null;
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
 * Lindqvists" under the title and no heart and no menu. At the bottom "Spara i mina recept" and
 * "Lägg på matsedeln"; "Köp det som saknas (N)" is a text button beside the portion selector.
 *
 * Spara makes the household's own copy (saveSharedRecipe; saving again gives the same copy) and
 * says "Sparat i dina recept" with "Öppna"; the button is then "✓ Sparat". The meal plan and the
 * shopping list hold only own recipes, so "Lägg på matsedeln" and "Köp det som saknas" first save
 * the copy quietly and then act on it: the dish is the copy, and the items are the copy's
 * ingredients (keyed by the copy, so their "Ångra" finds them).
 */
export function SharedRecipeView({ recipe, householdName, savedCopyId, addToPlan, buyMissing, undoBuy, ...rest }: SharedRecipeViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [savedId, setSavedId] = useState(savedCopyId);
  const [saving, setSaving] = useState(false);
  const copy = useRef<Copy | null>(null);

  async function ensureCopy(): Promise<Result<Copy>> {
    if (copy.current) return { ok: true, data: copy.current };
    let result: Result<{ id: string; ingredientIds: (string | null)[] }>;
    try {
      result = await saveSharedRecipe(recipe.id);
    } catch {
      result = fail("recipe_shared_save_failed");
    }
    if (!result.ok) return result;
    copy.current = { id: result.data.id, ingredients: copyIngredientMap(recipe.lines, result.data.ingredientIds) };
    setSavedId(result.data.id);
    return { ok: true, data: copy.current };
  }

  /** The key RecipeBody made with the shared recipe's id and the view's ingredient, as the copy's. */
  function copyKey(key: string, target: Copy): string | null {
    const prefix = buyKey(recipe.id, "");
    if (!key.startsWith(prefix)) return null;
    const ingredientId = target.ingredients.get(key.slice(prefix.length));
    return ingredientId ? buyKey(target.id, ingredientId) : null;
  }

  async function save() {
    if (saving || savedId) return;
    setSaving(true);
    const result = await ensureCopy();
    setSaving(false);
    if (result.ok) {
      const id = result.data.id;
      showToast("Sparat i dina recept", { show: { label: "Öppna", onShow: () => router.push(`/recept/${id}`) } });
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  const addCopyToPlan: AddToPlan = async (input) => {
    const target = await ensureCopy();
    if (!target.ok) return target;
    return addToPlan({ ...input, recipeId: target.data.id });
  };

  const buyForCopy: BuyMissing = async ({ items }) => {
    const target = await ensureCopy();
    if (!target.ok) return target;
    const mapped = items.flatMap((item) => {
      const key = copyKey(item.key, target.data);
      const ingredientId = item.ingredientId ? target.data.ingredients.get(item.ingredientId) : null;
      return key && ingredientId ? [{ key, label: item.label, ingredientId }] : [];
    });
    if (mapped.length === 0) return fail("recipe_shared_save_failed");
    return buyMissing({ items: mapped });
  };

  const undoForCopy: UndoBuy = async ({ keys }) => {
    if (!copy.current) return fail("shopping_remove_failed");
    const target = copy.current;
    return undoBuy({ keys: keys.flatMap((key) => copyKey(key, target) ?? []) });
  };

  const saveButton = (
    <Button
      variant="secondary"
      disabled={saving || savedId !== null}
      onClick={save}
      data-testid="save-shared"
      className="grow basis-auto"
    >
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
      buyInline
      extraAction={saveButton}
      addToPlan={addCopyToPlan}
      buyMissing={buyForCopy}
      undoBuy={undoForCopy}
    />
  );
}
