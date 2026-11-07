import { nameInSentence } from "@/features/catalog";
import { noStaples, recipeStatus, type PantrySnapshot, type StapleRules } from "@/features/pantry";
import type { RecipeListRow } from "@/features/recipes";
import { dishKind, type DishKind } from "@/lib/dish-kind";

// "Vad kan jag laga nu?" (Story 25.2): the library recipes that can be cooked
// with what is at home ("Dina recept": nothing missing beyond Basvaror) and
// those that miss exactly one thing ("Saknar bara en vara"), counted by code
// with the library's own status (pantry.recipeStatus). Pure, so it is tested
// without a database.

/** At most this many recipes in each of the two lists. */
export const maxCookNowRecipes = 8;
/** At most this many names in "Använder ägg, mjölk och smör." */
export const maxUsesNames = 5;

/** A library recipe that can be cooked now, with what the expanded row says. */
export type CookNowRecipe = {
  id: string;
  title: string;
  imageUrl: string | null;
  /** UX-13b: the kind of dish drawn when there is no photo; from the title when left out. */
  dish?: DishKind;
  totalMinutes: number | null;
  servings: number;
  /** The catalog names (in lower case) of the recipe's ingredients, each once, as "Använder …" lists them. */
  uses: string[];
};

/** A library recipe that misses exactly one thing: "Köttbullar och potatismos — Saknar lingon". */
export type CookNowOneMissing = { id: string; title: string; missing: string };

export type CookNowLists = { own: CookNowRecipe[]; oneMissing: CookNowOneMissing[] };

function statusOf(row: RecipeListRow, snapshot: PantrySnapshot, staples: StapleRules) {
  return recipeStatus({ servings: row.originalServings, lines: row.lines }, row.originalServings, snapshot, staples);
}

/** The catalog ids the lists need names for: the ingredients of recipes that can be cooked, and the missing one. */
export function cookNowNameIds(rows: readonly RecipeListRow[], snapshot: PantrySnapshot, staples: StapleRules = noStaples): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const status = statusOf(row, snapshot, staples);
    if (status.missingCount === 0) {
      for (const line of row.lines) if (line.ingredientId) ids.add(line.ingredientId);
    } else if (status.missingCount === 1) {
      ids.add(status.missingIngredientIds[0]);
    }
  }
  return [...ids];
}

/**
 * The lists: recipes with nothing missing, and with one thing missing, each
 * at most `maxCookNowRecipes`. The recipes that use the item that has lain
 * longest come first (`oldIds`, oldest first), then the others in the given
 * order (newest first). `names` are catalog names by id.
 */
export function cookNowLists(
  rows: readonly RecipeListRow[],
  snapshot: PantrySnapshot,
  names: Readonly<Record<string, string>>,
  staples: StapleRules = noStaples,
  oldIds: readonly string[] = [],
): CookNowLists {
  const inSentence = (id: string): string | null => (names[id] ? nameInSentence(names[id].trim()) : null);
  const own: { recipe: CookNowRecipe; rank: number }[] = [];
  const oneMissing: CookNowOneMissing[] = [];
  for (const row of rows) {
    const status = statusOf(row, snapshot, staples);
    if (status.missingCount === 0) {
      const used = [...new Set(row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))];
      const uses = [...new Set(used.flatMap((id) => inSentence(id) ?? []))].slice(0, maxUsesNames);
      const ranks = used.map((id) => oldIds.indexOf(id)).filter((index) => index >= 0);
      own.push({
        recipe: {
          id: row.id,
          title: row.title,
          imageUrl: row.imageUrl,
          dish: dishKind(row.title, row.lines.map((line) => line.originalText)),
          totalMinutes: row.totalMinutes,
          servings: row.originalServings,
          uses,
        },
        rank: ranks.length > 0 ? Math.min(...ranks) : Infinity,
      });
    } else if (status.missingCount === 1) {
      const missing = inSentence(status.missingIngredientIds[0]);
      if (missing) oneMissing.push({ id: row.id, title: row.title, missing });
    }
  }
  // A stable sort keeps the given order among equals.
  own.sort((a, b) => (a.rank === b.rank ? 0 : a.rank < b.rank ? -1 : 1));
  return { own: own.slice(0, maxCookNowRecipes).map(({ recipe }) => recipe), oneMissing: oneMissing.slice(0, maxCookNowRecipes) };
}
