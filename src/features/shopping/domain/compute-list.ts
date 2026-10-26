import {
  cleanIngredientText,
  isCountUnit,
  SECTIONS,
  type Section,
  type Unit,
} from "@/features/catalog";
import type { PlanRecipe } from "@/features/mealplan";
import {
  aggregateNeedsWithOrigins,
  atHomeText,
  coverage,
  type Coverage,
  type LineCoverage,
  type NeedLine,
  type OriginLine,
  type PantrySnapshot,
} from "@/features/pantry";
import { scaleFactor, scaleLines } from "@/features/recipes";
import type { CustomListItem } from "./custom-item";
import { customLineKey, recipeLineKey, textLineKey } from "./line-key";

// The shopping list (FR-15, AD-8): counted from the current meal plan, its
// recipes, the pantry and the catalog every time it is read; nothing is
// stored. computeList is the only source of list lines, for the view and
// later "Lägg i lagret" and the export. Each dish's lines are scaled to its
// servings (recipes.scaleLines), summed over the dishes per ingredient and
// unit (pantry.aggregateNeedsWithOrigins) and compared with the whole pantry
// (pantry.coverage, AD-7). Units are never converted (AD-12). Pure, so it is
// tested without a database.

/** One line on the shopping list. */
export type ShoppingLine = {
  /** The line's key (line-key.ts); never holds the coverage. */
  key: string;
  /** The catalog ingredient; missing for a recipe line without one. */
  ingredientId?: string;
  /** The catalog ingredient's name, or the recipe line's own text when it has no catalog ingredient. */
  label: string;
  /** What to buy, in `unit`; `null` for a vague line and a line without a catalog ingredient. */
  amount: number | null;
  unit: Unit | null;
  /** A vague line ("salt efter smak") whose ingredient is not at home: shown as "Finns hemma?". */
  isVague: boolean;
  /**
   * How the pantry covers the need; `unlinked` for a line that is not
   * compared with the pantry: a recipe line without a catalog ingredient, or
   * an own item (Story 3.5).
   */
  coverage: LineCoverage;
  /** What is at home in other units, beside the amount: "hemma: 1 kg". */
  pantryNote?: string;
  /**
   * For a line without a catalog ingredient, which is never scaled: the sum
   * of its dishes' scale factors, to one decimal, when it is not 1 ("×2").
   */
  multiplier?: number;
  section: Section;
  /** The matsedelsrätter (meal_plan_recipe ids) the line comes from, in plan order. */
  origins: string[];
  /** Checked off (Story 3.4); from the overlay. */
  checked: boolean;
  /** Pontus's own item (Story 3.5); never merged with recipe lines. */
  isCustom: boolean;
};

/** A matsedelsrätt as the list reads it; mealplan.getCurrentPlan gives these. */
export type ListDish = Pick<PlanRecipe, "id" | "recipeId" | "servings">;

/** A recipe line as the list reads it; recipes.getRecipesByIds gives these. */
export type ListRecipeLine = NeedLine & { originalText: string };

/** A recipe as the list reads it; recipes.getRecipesByIds gives these. */
export type ListRecipe = { id: string; originalServings: number; lines: readonly ListRecipeLine[] };

/**
 * What the list keeps per meal plan: checks (Story 3.4), corrected amounts
 * and hidden lines (3.6) and Pontus's own items (3.5). Overrides are empty
 * until Story 3.6 adds its table.
 */
export type Overlay = {
  /**
   * The keys of checked lines (shopping_check). A line whose key is here is
   * checked, whatever its amount now; a key without a line is ignored and
   * kept, so the check applies again if the line comes back.
   */
  checks: readonly string[];
  overrides: readonly never[];
  /**
   * Pontus's own items (shopping_custom_item), in the order read. Each is a
   * line of its own, keyed `c:<id>`, never merged with the recipes' lines.
   */
  customItems: readonly CustomListItem[];
};

export const emptyOverlay: Overlay = { checks: [], overrides: [], customItems: [] };

export type ShoppingListInput = {
  /** The current plan's dishes in plan order, or `null` when there is no current plan. */
  plan: { recipes: readonly ListDish[] } | null;
  /** The recipes behind the dishes; a dish whose recipe is not among them adds nothing. */
  recipes: readonly ListRecipe[];
  /** The whole pantry (pantry.getPantrySnapshot). */
  snapshot: PantrySnapshot;
  /**
   * The catalog ingredients' names (catalog.getIngredientNames) and sections
   * (catalog.getIngredientDefaults), by id: the recipes' ingredients, and the
   * sections of the ingredients own items point at. A section outside
   * SECTIONS is Övrigt.
   */
  catalog: {
    names: Readonly<Record<string, string>>;
    defaults: Readonly<Record<string, { section: string }>>;
  };
  overlay: Overlay;
};

const nameOrder = new Intl.Collator("sv-SE", { sensitivity: "base", numeric: true });
const sectionRank = (section: Section) => SECTIONS.indexOf(section);

/** The list's order: by section in the order of SECTIONS, then by name in Swedish order, then by key. */
export function compareShoppingLines(a: ShoppingLine, b: ShoppingLine): number {
  return (
    sectionRank(a.section) - sectionRank(b.section) ||
    nameOrder.compare(a.label, b.label) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/** The last resort for a line's name; a label is never empty. */
export const unknownItemLabel = "Okänd vara";

/** A section the list knows (SECTIONS); anything else is Övrigt. */
function knownSection(section: string | undefined): Section {
  return (SECTIONS as readonly string[]).includes(section ?? "") ? (section as Section) : "Övrigt";
}

/** Text with single spaces and no spaces around it. */
const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** What is bought: a whole number in a unit that counts things (1,5 st is 2 st), else the amount as it is. */
function toBuy(amount: number, unit: Unit): number {
  return isCountUnit(unit) ? Math.ceil(amount) : amount;
}

/** A text line's multiplier, the sum of its dishes' scale factors, to one decimal and never 0. */
function roundMultiplier(sum: number): number {
  return Math.max(0.1, Math.round(sum * 10) / 10);
}

/** The part of a need that becomes a line, or `null` when the pantry covers it. */
function shortfall(
  covered: Coverage,
  need: { amount: number | null; unit: Unit | null },
): { amount: number | null; isVague: boolean; pantryNote?: string } | null {
  switch (covered.kind) {
    case "covered":
      return null;
    case "partial": {
      // What is at home in other units, beside what is short in this one.
      const others = covered.amounts.filter((amount) => amount.unit !== need.unit);
      return {
        amount: covered.remaining,
        isVague: false,
        ...(others.length > 0 ? { pantryNote: atHomeText(others) } : {}),
      };
    }
    case "other-unit":
      return { amount: need.amount, isVague: false, pantryNote: atHomeText(covered.amounts) };
    case "missing":
      return { amount: need.amount, isVague: false };
    case "vague-missing":
      return { amount: null, isVague: true };
  }
}

/** The dishes the list counts: those whose recipe was read. A dish whose recipe is deleted or not read adds nothing. */
export function countedDishIds(plan: ShoppingListInput["plan"], recipes: readonly Pick<ListRecipe, "id">[]): string[] {
  if (!plan) return [];
  const read = new Set(recipes.map((recipe) => recipe.id));
  return plan.recipes.flatMap((dish) => (dish.recipeId !== null && read.has(dish.recipeId) ? [dish.id] : []));
}

/**
 * The shopping list's lines, sorted by section and name (compareShoppingLines):
 *
 * - Each dish's lines are scaled by its servings over the recipe's own
 *   (recipes.scaleFactor), then the same catalog ingredient in the same unit
 *   is one line over all dishes. "1 purjolök" counts as 1 st.
 * - A need the pantry covers (an unlimited item, enough in the same unit, or
 *   the ingredient in any form for a vague line) gives no line; partly
 *   covered gives what is short, with what is at home in other units beside
 *   it; at home only in other units gives the whole need with "hemma: 1 kg";
 *   a missing vague line gives a line without amount ("Finns hemma?"),
 *   unless the same ingredient already has a line with an amount, which then
 *   also names the vague line's dishes.
 * - In a unit that counts things (st, förp, …) the amount to buy is rounded
 *   up to a whole number; the comparison with the pantry uses the exact need.
 * - A recipe line without a catalog ingredient is a line under Övrigt with
 *   its own text, not scaled and not compared with the pantry; the same text
 *   from several dishes is one line, whose multiplier is the sum of the
 *   dishes' scale factors (decision 2026-10-26).
 * - A section not in SECTIONS is Övrigt. Without a catalog name, a line is
 *   named by its text without amount and unit, else "Okänd vara".
 * - Each of Pontus's own items (overlay.customItems, Story 3.5) is a line of
 *   its own, keyed `c:<id>`, with his text, amount and unit as given, under
 *   its catalog ingredient's section, else Övrigt. It is never merged with a
 *   recipe line of the same ingredient and never compared with the pantry
 *   (AD-8). It is there with a plan even without dishes.
 * - A line is checked when its key is in overlay.checks.
 */
export function computeList({ plan, recipes, snapshot, catalog, overlay }: ShoppingListInput): ShoppingLine[] {
  if (!plan) return [];
  const checks = new Set(overlay.checks);
  return [...recipeLines({ plan, recipes, snapshot, catalog }, checks), ...customLines(overlay.customItems, catalog, checks)].sort(
    compareShoppingLines,
  );
}

/** Pontus's own items as lines: never merged, never compared with the pantry (AD-8). */
function customLines(
  items: readonly CustomListItem[],
  catalog: ShoppingListInput["catalog"],
  checks: ReadonlySet<string>,
): ShoppingLine[] {
  return items.map((item) => {
    const key = customLineKey(item.id);
    const hasAmount = item.amount !== null && item.unit !== null;
    return {
      key,
      ...(item.ingredientId ? { ingredientId: item.ingredientId } : {}),
      label: collapse(item.label) || unknownItemLabel,
      amount: hasAmount ? item.amount : null,
      unit: hasAmount ? item.unit : null,
      isVague: false,
      coverage: { kind: "unlinked" },
      section: item.ingredientId ? knownSection(catalog.defaults[item.ingredientId]?.section) : "Övrigt",
      origins: [],
      checked: checks.has(key),
      isCustom: true,
    };
  });
}

/** The lines the plan's recipes give, unsorted; see computeList. */
function recipeLines(
  { plan, recipes, snapshot, catalog }: Omit<ShoppingListInput, "overlay" | "plan"> & { plan: NonNullable<ShoppingListInput["plan"]> },
  checks: ReadonlySet<string>,
): ShoppingLine[] {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const dishOrder = new Map(plan.recipes.map((dish, index) => [dish.id, index]));
  const linked: OriginLine[] = [];
  /** A line's own text, for an ingredient whose name the catalog does not give. */
  const writtenLabels = new Map<string, string>();
  const texts = new Map<string, { label: string; origins: string[]; multiplier: number }>();

  for (const dish of plan.recipes) {
    const recipe = dish.recipeId === null ? undefined : recipesById.get(dish.recipeId);
    if (!recipe) continue;
    const factor = scaleFactor(dish.servings, recipe.originalServings);
    for (const line of scaleLines(recipe.lines, factor)) {
      if (line.ingredientId === null) {
        const key = textLineKey(line.originalText);
        const text = texts.get(key) ?? {
          label: collapse(line.originalText) || unknownItemLabel,
          origins: [],
          multiplier: 0,
        };
        if (!text.origins.includes(dish.id)) text.origins.push(dish.id);
        text.multiplier += factor;
        texts.set(key, text);
        continue;
      }
      if (!writtenLabels.has(line.ingredientId)) {
        const written = cleanIngredientText(line.originalText) || collapse(line.originalText);
        if (written) writtenLabels.set(line.ingredientId, written);
      }
      linked.push({ ...line, origin: dish.id });
    }
  }

  const lines: ShoppingLine[] = [];
  /** The ingredients' first line with an amount, which a missing vague line of the same ingredient joins. */
  const withAmount = new Map<string, ShoppingLine>();
  const vagueMissing: { ingredientId: string; origins: string[]; line: ShoppingLine }[] = [];
  for (const need of aggregateNeedsWithOrigins(linked)) {
    const covered = coverage(need, snapshot);
    const short = shortfall(covered, need);
    if (!short) continue;
    const key = recipeLineKey(need.ingredientId, need.unit);
    const unit = short.amount === null ? null : need.unit;
    const line: ShoppingLine = {
      key,
      ingredientId: need.ingredientId,
      label: catalog.names[need.ingredientId] || writtenLabels.get(need.ingredientId) || unknownItemLabel,
      amount: short.amount === null || unit === null ? null : toBuy(short.amount, unit),
      unit,
      isVague: short.isVague,
      coverage: covered,
      ...(short.pantryNote ? { pantryNote: short.pantryNote } : {}),
      section: knownSection(catalog.defaults[need.ingredientId]?.section),
      origins: need.origins,
      checked: checks.has(key),
      isCustom: false,
    };
    if (short.isVague) {
      vagueMissing.push({ ingredientId: need.ingredientId, origins: need.origins, line });
    } else if (!withAmount.has(need.ingredientId)) {
      withAmount.set(need.ingredientId, line);
    }
    lines.push(line);
  }
  // A missing vague line folds into the same ingredient's line with an amount (decision 2026-10-26).
  const folded = new Set<ShoppingLine>();
  for (const { ingredientId, origins, line } of vagueMissing) {
    const target = withAmount.get(ingredientId);
    if (!target) continue;
    target.origins = [...new Set([...target.origins, ...origins])].sort(
      (a, b) => (dishOrder.get(a) ?? 0) - (dishOrder.get(b) ?? 0),
    );
    folded.add(line);
  }
  for (const [key, { label, origins, multiplier }] of texts) {
    const rounded = roundMultiplier(multiplier);
    lines.push({
      key,
      label,
      amount: null,
      unit: null,
      isVague: false,
      coverage: { kind: "unlinked" },
      ...(rounded !== 1 ? { multiplier: rounded } : {}),
      section: "Övrigt",
      origins,
      checked: checks.has(key),
      isCustom: false,
    });
  }
  return lines.filter((line) => !folded.has(line));
}
