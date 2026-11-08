import { z } from "zod";
import {
  normalizeIngredientText,
  unitSchema,
  type IngredientChoice,
  type IngredientMatch,
  type MatchItem,
} from "@/features/catalog";
import { dishKind } from "@/lib/dish-kind";
import { recipeCategories } from "./recipe-category";
import { sourceKindSchema, type SourceKind } from "./recipe-draft";
import type { RecipeListItem } from "./recipe-list";
import type { SavedRecipe, SavedRecipeLine } from "./saved-recipe";

// Delade recept: a recipe another household shares, as get_shared_recipe and
// list_shared_recipes give it (only the recipe: no ids of the other household's
// catalog, no notes, favourites or people), and the texts around sharing. Pure,
// so it is tested without a database.

/** A line of a shared recipe: as written, and its catalog ingredient by name only. */
export type SharedLine = {
  originalText: string;
  amount: number | null;
  unit: SavedRecipeLine["unit"];
  isVague: boolean;
  /** The ingredient group the line is listed under, or null. */
  group: string | null;
  /** The index of the line's first step among the steps, or null. */
  stepIndex: number | null;
  /** The name of the owner's catalog ingredient of the line, or null for a line without one. */
  ingredientName: string | null;
  /** That ingredient's section (a fixed list), a hint for a new ingredient in the saver's catalog. */
  ingredientSection: string | null;
  /** The source marks the line as a staple (•). */
  isStapleMarked: boolean;
};

/** A shared recipe opened (get_shared_recipe). */
export type SharedRecipe = {
  id: string;
  title: string;
  servings: number;
  totalMinutes: number | null;
  imageUrl: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  /** The sharing household's name: "Delat av Lindqvists". */
  householdName: string;
  /** The viewer's own copy, when the household has saved it already. */
  savedCopyId: string | null;
  /** The version of the lines; saving with another one (they changed in between) is refused. */
  version: string;
  steps: { title: string | null; text: string }[];
  lines: SharedLine[];
};

const sharedRecipeSchema = z.object({
  id: z.guid(),
  title: z.string().min(1),
  servings: z.number().int().min(1),
  total_minutes: z.number().int().nullable(),
  image_url: z.string().nullable(),
  source_kind: sourceKindSchema,
  source_url: z.string().nullable(),
  household_name: z.string().min(1),
  saved_copy_id: z.guid().nullable(),
  version: z.string(),
  steps: z.array(z.object({ title: z.string().nullable(), text: z.string() })),
  lines: z.array(
    z.object({
      original_text: z.string(),
      amount: z.number().nullable(),
      unit: unitSchema.nullable(),
      is_vague: z.boolean(),
      section: z.string().nullable(),
      is_staple_marked: z.boolean().optional(),
      step_index: z.number().int().min(0).nullable(),
      ingredient_name: z.string().nullable(),
      ingredient_section: z.string().nullable(),
    }),
  ),
});

/** get_shared_recipe's answer as a SharedRecipe; `null` for none, and for an answer that does not parse. */
export function parseSharedRecipe(value: unknown): SharedRecipe | null {
  if (value === null || value === undefined) return null;
  const parsed = sharedRecipeSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    totalMinutes: row.total_minutes,
    imageUrl: row.image_url,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    householdName: row.household_name,
    savedCopyId: row.saved_copy_id,
    version: row.version,
    steps: row.steps,
    lines: row.lines.map((line) => ({
      originalText: line.original_text,
      amount: line.amount,
      unit: line.unit,
      isVague: line.is_vague,
      group: line.section,
      stepIndex: line.step_index !== null && line.step_index < row.steps.length ? line.step_index : null,
      ingredientName: line.ingredient_name,
      ingredientSection: line.ingredient_section,
      isStapleMarked: line.is_staple_marked ?? false,
    })),
  };
}

/**
 * What the viewer's catalog is matched with, one item per line (catalog.matchIngredients): the shared
 * ingredient's name, with its section as the hint for a new one, the way an import gives the AI's hint.
 * A line without an ingredient has no text, so it stays without one ("unmatched").
 */
export function sharedMatchItems(lines: readonly SharedLine[]): MatchItem[] {
  return lines.map((line) =>
    line.ingredientName
      ? { text: line.ingredientName, hint: { name: line.ingredientName, section: line.ingredientSection ?? "", location: "", defaultUnit: "" } }
      : { text: "" },
  );
}

/**
 * The choices catalog.commitIngredients saves for a copy, one per line: the match, keyed by the
 * ingredient's name (so no synonym is made from the line's text).
 */
export function sharedChoices(lines: readonly SharedLine[], matches: readonly IngredientMatch[]): IngredientChoice[] {
  if (matches.length !== lines.length) throw new Error("sharedChoices needs one match per line");
  return lines.map((line, index) => ({ text: line.ingredientName ?? line.originalText, ingredient: matches[index] }));
}

/** The id a line gets in the view when the viewer's catalog has no such ingredient yet: never at home. */
export function newIngredientViewId(name: string): string {
  return `new:${normalizeIngredientText(name) || name}`;
}

/**
 * The shared recipe as the recipe view shows it, against the viewer's own pantry: each line's
 * ingredient is the viewer's catalog ingredient of that name (`matches`, from matchIngredients),
 * or, when the viewer has none, an id of its own (newIngredientViewId) that no pantry has, so the
 * line counts as missing. Steps and lines get ids by their place ("step-0", "line-0").
 */
export function toSharedView(shared: SharedRecipe, matches: readonly IngredientMatch[]): SavedRecipe {
  if (matches.length !== shared.lines.length) throw new Error("toSharedView needs one match per line");
  return {
    id: shared.id,
    title: shared.title,
    servings: shared.servings,
    totalMinutes: shared.totalMinutes,
    imageUrl: shared.imageUrl,
    sourceKind: shared.sourceKind,
    sourceUrl: shared.sourceUrl,
    isFavorite: false,
    updatedAt: "",
    steps: shared.steps.map((step, position) => ({ id: `step-${position}`, position, text: step.text, title: step.title })),
    lines: shared.lines.map((line, position) => {
      const match = matches[position];
      const ingredientId =
        match.kind === "match" ? match.ingredientId : line.ingredientName ? newIngredientViewId(line.ingredientName) : null;
      return {
        id: `line-${position}`,
        position,
        originalText: line.originalText,
        amount: line.amount,
        unit: line.unit,
        isVague: line.isVague,
        ingredientId,
        ingredientName: line.ingredientName,
        stepId: line.stepIndex !== null ? `step-${line.stepIndex}` : null,
        group: line.group,
        isStapleMarked: line.isStapleMarked,
      };
    }),
  };
}

/**
 * The copy's catalog ingredient for an ingredient the view shows (toSharedView), by the line it
 * is on: the view's line i has the copy's `copyIngredientIds[i]` (saveSharedRecipe gives them in
 * line order). `viewLines` are the lines shown now, which may have been read again since the copy
 * was saved (then a new ingredient has the household's catalog id), so an id of the household's
 * own catalog that no line has is the copy's as it is. `null` for an ingredient the copy lacks.
 */
export function copyIngredientFor(
  viewLines: readonly Pick<SavedRecipeLine, "ingredientId">[],
  copyIngredientIds: readonly (string | null)[],
  viewIngredientId: string,
): string | null {
  const index = viewLines.findIndex((line) => line.ingredientId === viewIngredientId);
  const copyId = index >= 0 ? (copyIngredientIds[index] ?? null) : null;
  if (copyId) return copyId;
  return viewIngredientId.startsWith("new:") ? null : viewIngredientId;
}

/**
 * The copy's catalog ingredient for each line of the shared recipe, from the copy's own lines (a
 * copy saved before): the copy's line with the same text, each used once, or `null`.
 */
export function copyLineIngredients(
  sharedLines: readonly Pick<SharedLine, "originalText">[],
  copyLines: readonly { originalText: string; ingredientId: string | null }[],
): (string | null)[] {
  const used = new Set<number>();
  return sharedLines.map((line) => {
    const index = copyLines.findIndex((copy, at) => !used.has(at) && copy.originalText === line.originalText);
    if (index < 0) return null;
    used.add(index);
    return copyLines[index].ingredientId;
  });
}

/** What the page says under "Delat av …" once the household has saved the recipe. */
export const sharedSavedNote = "Den som delar ser att ni har sparat det.";

/** A row of list_shared_recipes. */
export type SharedListRow = {
  id: string;
  title: string;
  originalServings: number;
  totalMinutes: number | null;
  imageUrl: string | null;
  householdName: string;
  createdAt: string;
  savedCopyId: string | null;
  lineTexts: readonly string[];
};

/** A recipe in Delade: a library row (no favourite, no status) with whose it is and whether it is saved. */
export type SharedListItem = RecipeListItem & {
  householdName: string;
  /** The viewer's copy, for "✓ Sparat". */
  savedCopyId: string | null;
  /** The lines as written, for the search. */
  lineTexts: readonly string[];
};

/** The Delade rows as library items, with categories and the drawing worked out like an own recipe's. */
export function toSharedListItems(rows: readonly SharedListRow[]): SharedListItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    imageUrl: row.imageUrl,
    totalMinutes: row.totalMinutes,
    originalServings: row.originalServings,
    isFavorite: false,
    createdAt: row.createdAt,
    missingCount: null,
    categories: recipeCategories({ title: row.title, ingredients: row.lineTexts, totalMinutes: row.totalMinutes }),
    dish: dishKind(row.title, row.lineTexts),
    householdName: row.householdName,
    savedCopyId: row.savedCopyId,
    lineTexts: row.lineTexts,
  }));
}

/** The shared recipes whose title or a line contains `query` (any case); all of them for blank text. */
export function searchShared<T extends Pick<SharedListItem, "title" | "lineTexts">>(items: readonly T[], query: string): T[] {
  const text = query.trim().toLocaleLowerCase("sv");
  if (!text) return [...items];
  return items.filter(
    (item) => item.title.toLocaleLowerCase("sv").includes(text) || item.lineTexts.some((line) => line.toLocaleLowerCase("sv").includes(text)),
  );
}

/** "Sparat av Lindqvists och Bergs" for the households that saved a copy; more than three are counted; `null` for none. */
export function savedByText(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length > 3) return `Sparat av ${names.length} hushåll`;
  if (names.length === 1) return `Sparat av ${names[0]}`;
  return `Sparat av ${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/** "Delat av Lindqvists", under a shared recipe's title and a saved copy's. */
export function sharedByText(householdName: string): string {
  return `Delat av ${householdName}`;
}

/** "från Lindqvists", on a card in Delade. */
export function sharedFromText(householdName: string): string {
  return `från ${householdName}`;
}

/** "8 delade recept" ("1 delat recept"), the count over Delade. */
export function sharedCountText(count: number): string {
  return count === 1 ? "1 delat recept" : `${count} delade recept`;
}

/** The question before Sluta dela alla, and what it says under it. */
export const stopSharingQuestion = "Sluta dela alla?";
export function stopSharingDetail(count: number): string {
  return `${count} recept slutar delas. Kopior som andra redan har sparat finns kvar hos dem.`;
}

/** What setRecipeShared takes. */
export const shareChangeSchema = z.object({ id: z.guid(), shared: z.boolean() });
export type ShareChange = z.infer<typeof shareChangeSchema>;
