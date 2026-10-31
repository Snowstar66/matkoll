import {
  parseRecipeSort,
  parseRecipeView,
  type RecipeSort,
  type RecipeView,
} from "../domain/recipe-list";
import { parseRecipeCategory, type RecipeCategory } from "../domain/recipe-category";
import { createDeviceChoice } from "./device-choice-store";

// The library's view, sort and category, each kept on the device like the
// filter pill (EXPERIENCE.md, Receptbiblioteket). `undefined` until the client
// has read the saved choice.

export const recipeViewStore = createDeviceChoice<RecipeView>("matkoll.recept.vy", parseRecipeView, String);
export const recipeSortStore = createDeviceChoice<RecipeSort>("matkoll.recept.sortering", parseRecipeSort, String);
/** `null` is no category. */
export const recipeCategoryStore = createDeviceChoice<RecipeCategory | null>(
  "matkoll.recept.kategori",
  parseRecipeCategory,
  (category) => category ?? "",
);

export const useRecipeView = recipeViewStore.use;
export const useRecipeSort = recipeSortStore.use;
export const useRecipeCategory = recipeCategoryStore.use;

/** Forgets the in-memory choices; for tests. */
export function resetRecipeViewStores() {
  recipeViewStore.reset();
  recipeSortStore.reset();
  recipeCategoryStore.reset();
}
