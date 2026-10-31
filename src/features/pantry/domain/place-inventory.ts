import { z } from "zod";
import { locationSchema, UNITS, unitSchema, type Location, type Unit } from "@/features/catalog";
import { roundSum, type PantryAmountRow, type PantryItem } from "./pantry-item";
import { suggestionLabel } from "./pantry-item-form";
import type { ConfirmItemInput, PantrySuggestion } from "./pantry-suggestion";

// "Inventera en plats med foto" (Story 6.4, FR-25, AD-6, AD-12, AD-19): a
// photo of a place that already has items is compared with what the place
// has, per catalog ingredient, so the suggestions fall into "Nytt" (the
// place does not have the ingredient), "Ändrat" (it has other amounts or
// units), "oförändrat" (the same, shown only as a count) and "Syns inte
// längre" (the place has an ingredient no suggestion has). The AI is not
// asked anything new: the comparison runs on the server after
// toPantrySuggestions, and nothing is removed without a tap. Pure, so it is
// tested without a database or a model. Only types come from
// pantry-suggestion.ts, which imports its schemas from here.

/** At most this many "Syns inte längre" items: a place never has more rows than one pantry page (pantryPageSize). */
export const maxMissingItems = 1000;

/** At most this many rows one suggestion replaces; a place has one row per unit of an ingredient at most. */
export const maxReplaces = 50;

/** What the place has of an ingredient now: unlimited, or its amounts per unit. */
export const placeStockSchema = z.object({
  unlimited: z.boolean(),
  amounts: z.array(z.object({ amount: z.number().positive(), unit: unitSchema })),
});
export type PlaceStock = z.infer<typeof placeStockSchema>;

const unitOrder = (unit: Unit) => UNITS.indexOf(unit);

/** The place's stock per catalog ingredient id, from its rows: unlimited, or the amounts per unit in the order of UNITS. */
export function stockByIngredient(rows: readonly PantryAmountRow[]): Map<string, PlaceStock> {
  const sums = new Map<string, { unlimited: boolean; byUnit: Map<Unit, number> }>();
  for (const row of rows) {
    const stock = sums.get(row.ingredientId) ?? { unlimited: false, byUnit: new Map<Unit, number>() };
    sums.set(row.ingredientId, stock);
    if (row.amount === null || row.unit === null) stock.unlimited = true;
    else stock.byUnit.set(row.unit, (stock.byUnit.get(row.unit) ?? 0) + row.amount);
  }
  return new Map(
    [...sums].map(([id, { unlimited, byUnit }]) => [
      id,
      {
        unlimited,
        amounts: [...byUnit]
          .map(([unit, amount]) => ({ amount: roundSum(amount), unit }))
          .sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit)),
      },
    ]),
  );
}

/** A suggestion's place in the comparison; `null` outside it (an empty place, or one that could not be read). */
export const suggestionChangeSchema = z.enum(["new", "changed", "unchanged"]).nullable();
export type SuggestionChange = z.infer<typeof suggestionChangeSchema>;

const amountHasUnit = (item: { amount: number | null; unit: string | null }) =>
  (item.amount === null) === (item.unit === null);

/** One row of a "Syns inte längre" item, by its id, so "Ta bort" removes exactly it. */
export const missingRowSchema = z
  .object({ id: z.uuid(), amount: z.number().positive().nullable(), unit: unitSchema.nullable() })
  .refine(amountHasUnit, { path: ["unit"] });

/**
 * "Syns inte längre": an ingredient the place has that no suggestion has,
 * with all its rows there (also unlimited ones) and what they add up to.
 */
export const missingItemSchema = z.object({
  /** "missing:m1", "missing:m2" …, unique within one analysis and never a suggestion's id. */
  id: z.string().min(1),
  ingredientId: z.uuid(),
  /** The catalog name. */
  name: z.string().trim().min(1),
  location: locationSchema,
  rows: z.array(missingRowSchema).min(1).max(maxMissingItems),
  stock: placeStockSchema,
});
export type MissingItem = z.infer<typeof missingItemSchema>;

/**
 * How the photo compares with the place: `empty` (the place had nothing,
 * so the suggestions are a plain list as in Story 6.2), `unread` (the place
 * could not be read, likewise; `changed` when it was emptied and put back
 * since the photo, so the comparison no longer holds), or `compared`, with
 * the items no longer seen and whether the comparison is incomplete: some
 * of the AI's items could not be read, were cut, or became new catalog
 * ingredients (which may be an item of the place under another name), so
 * something "Syns inte längre" may just not have been understood.
 */
export const placeInventorySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({ kind: z.literal("unread"), changed: z.boolean().optional() }),
  z.object({
    kind: z.literal("compared"),
    missing: z.array(missingItemSchema).max(maxMissingItems),
    incomplete: z.boolean(),
  }),
]);
export type PlaceInventory = z.infer<typeof placeInventorySchema>;

/** A row of the photographed place, as listPantry gives it. */
export type PlaceItem = Pick<PantryItem, "id" | "ingredientId" | "name" | "location" | "amount" | "unit">;

export type CompareOptions = {
  /** The photographed place: only its suggestions are compared with its rows. */
  location: Location;
  /** Every catalog id the AI's items matched, also those whose suggestion was left out: never "Syns inte längre". */
  seenIngredientIds: ReadonlySet<string>;
  /** Some of the AI's items could not be read or were cut: "Syns inte längre" says to check. */
  incomplete: boolean;
};

/**
 * Whether the photo's stock of an ingredient counts as what the place has:
 * a photo without an amount (the AI gave none, or one the pantry cannot
 * keep) never counts as a change, since it does not say how much there is;
 * otherwise the same amount in every unit, and nothing unlimited at the
 * place.
 */
function sameStock(photo: PlaceStock, place: PlaceStock): boolean {
  if (photo.unlimited) return true;
  if (place.unlimited) return false;
  return (
    photo.amounts.length === place.amounts.length &&
    photo.amounts.every(({ amount, unit }) =>
      place.amounts.some((other) => other.unit === unit && roundSum(other.amount) === roundSum(amount)),
    )
  );
}

/**
 * The suggestions compared with the place's rows (`placeItems`), per
 * catalog ingredient:
 * - `null` rows (the place could not be read) give `unread`, and no rows
 *   give `empty`; the suggestions then have `change: null` and no
 *   `replaces`;
 * - only suggestions for the photographed place are compared; one for
 *   another place is `new` there, replaces nothing and keeps nothing of the
 *   photographed place out of "Syns inte längre";
 * - a new catalog ingredient, or one the place does not have, is `new`;
 * - otherwise the photo's amounts of the ingredient (all its suggestions:
 *   unlimited, or an amount per unit) are compared with the place's after
 *   roundSum: the same is `unchanged`, anything else `changed`; a photo
 *   without an amount is `unchanged`, never "finns hemma" over measured rows;
 * - Story 6.5: an ingredient with a suggestion the AI was unsure of is never
 *   `unchanged`, so it is a card with the badge "Osäker"; when its stock is
 *   the same as the place's it is `changed` without replacing any row;
 * - `replaces` is, for every suggestion of a changed ingredient, the ids of
 *   the place's rows of it in a unit the photo does not have for it (also an
 *   unlimited row), and `placeRowIds` all its rows in the place, for the
 *   sheet when it changes the unit;
 * - `missing` is the place's ingredients that no suggestion has and that
 *   are not in `seenIngredientIds`, with all their rows (unlimited ones
 *   too), sorted by name in Swedish order, with the ids missing:m1, … ;
 * - the comparison is incomplete when `incomplete` says so, when a
 *   suggestion for the place is a new catalog ingredient, or when there is
 *   no suggestion for the place at all.
 */
export function compareWithPlace(
  suggestions: readonly PantrySuggestion[],
  placeItems: readonly PlaceItem[] | null,
  { location, seenIngredientIds, incomplete }: CompareOptions,
): { suggestions: PantrySuggestion[]; inventory: PlaceInventory } {
  if (placeItems === null || placeItems.length === 0) {
    return {
      suggestions: suggestions.map((suggestion) => withoutComparison(suggestion)),
      inventory: { kind: placeItems === null ? "unread" : "empty" },
    };
  }

  const ownPlace = suggestions.filter((suggestion) => suggestion.location === location);
  const rows = placeItems.filter((row) => row.location === location);
  const stocks = stockByIngredient(rows);
  const photos = new Map<string, PantrySuggestion[]>();
  for (const suggestion of ownPlace) {
    if (suggestion.ingredient.kind !== "existing") continue;
    const { ingredientId } = suggestion.ingredient;
    photos.set(ingredientId, [...(photos.get(ingredientId) ?? []), suggestion]);
  }

  type Compared = { change: "changed" | "unchanged"; replaces: string[]; placeRowIds: string[] };
  const compared = new Map<string, Compared>();
  for (const [ingredientId, own] of photos) {
    const place = stocks.get(ingredientId);
    if (!place) continue;
    const unlimited = own.some((suggestion) => suggestion.amount === null || suggestion.unit === null);
    const units = new Set(own.flatMap((suggestion) => (suggestion.unit === null ? [] : [suggestion.unit])));
    const photo = stockByIngredient(
      own.map(({ amount, unit }) => (unlimited ? { ingredientId, amount: null, unit: null } : { ingredientId, amount, unit })),
    ).get(ingredientId)!;
    const ofIngredient = rows.filter((row) => row.ingredientId === ingredientId);
    const same = sameStock(photo, place);
    // Story 6.5: a suggestion the AI was unsure of is never "stämmer med förrådet": it is a card Pontus confirms.
    const change = same && !own.some((suggestion) => suggestion.uncertain) ? "unchanged" : "changed";
    compared.set(ingredientId, {
      change,
      replaces:
        change === "changed" && !same
          ? ofIngredient
              .filter((row) => row.unit === null || !units.has(row.unit))
              .map((row) => row.id)
              .slice(0, maxReplaces)
          : [],
      placeRowIds: ofIngredient.map((row) => row.id).slice(0, maxReplaces),
    });
  }

  const withChange = suggestions.map((suggestion): PantrySuggestion => {
    const own =
      suggestion.location === location && suggestion.ingredient.kind === "existing"
        ? compared.get(suggestion.ingredient.ingredientId)
        : undefined;
    if (!own) return { ...withoutComparison(suggestion), change: "new" };
    return { ...suggestion, ...own };
  });

  const missingRows = new Map<string, PlaceItem[]>();
  for (const row of rows) {
    if (photos.has(row.ingredientId) || seenIngredientIds.has(row.ingredientId)) continue;
    missingRows.set(row.ingredientId, [...(missingRows.get(row.ingredientId) ?? []), row]);
  }
  const missing = [...missingRows]
    .map(([ingredientId, own]) => ({
      ingredientId,
      name: own[0].name,
      location: own[0].location,
      rows: own.map(({ id, amount, unit }) => ({ id, amount, unit })),
      stock: stocks.get(ingredientId)!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"))
    .slice(0, maxMissingItems)
    .map((item, index): MissingItem => ({ id: `missing:m${index + 1}`, ...item }));

  const unsure =
    incomplete || ownPlace.length === 0 || ownPlace.some((suggestion) => suggestion.ingredient.kind === "new");
  return { suggestions: withChange, inventory: { kind: "compared", missing, incomplete: unsure } };
}

/** A suggestion outside a comparison: no change, nothing to replace. */
export function withoutComparison(suggestion: PantrySuggestion): PantrySuggestion {
  const plain: PantrySuggestion = { ...suggestion, change: null, replaces: [] };
  delete plain.placeRowIds;
  return plain;
}

/** The review's groups: what Hemma shows as cards, and how many suggestions already match. */
export type SuggestionGroups = {
  /** "Nytt", or every suggestion when the photo was not compared. */
  added: PantrySuggestion[];
  /** "Ändrat". */
  changed: PantrySuggestion[];
  /** Suggestions that match the place: "2 varor stämmer med förrådet." */
  unchanged: number;
  /** "Syns inte längre". */
  missing: MissingItem[];
  /** The photo was compared with the place: the groups are shown. */
  compared: boolean;
  /** The comparison is incomplete: "Bekräfta alla" leaves out "Syns inte längre", and the group says to check. */
  incomplete: boolean;
};

/** The suggestions and the items no longer seen, grouped as Hemma shows them. */
export function groupSuggestions(result: {
  suggestions: readonly PantrySuggestion[];
  inventory: PlaceInventory;
}): SuggestionGroups {
  const { suggestions, inventory } = result;
  if (inventory.kind !== "compared") {
    return { added: [...suggestions], changed: [], unchanged: 0, missing: [], compared: false, incomplete: false };
  }
  return {
    added: suggestions.filter((suggestion) => suggestion.change !== "changed" && suggestion.change !== "unchanged"),
    changed: suggestions.filter((suggestion) => suggestion.change === "changed"),
    unchanged: suggestions.filter((suggestion) => suggestion.change === "unchanged").length,
    missing: [...inventory.missing],
    compared: true,
    incomplete: inventory.incomplete,
  };
}

/** What confirmPantryInventory takes, before its own validation. */
export type InventoryRequest = {
  location: Location;
  items: ConfirmItemInput[];
  /** The rows the suggestions replace ("Ändrat" in other units). */
  replaceRowIds: string[];
  /** The rows of the "Syns inte längre" items to remove. */
  removeRowIds: string[];
};

/** At most this many rows one request replaces: the limit of confirmPantryInventory and apply_pantry_inventory. */
export const maxRequestReplaces = 50;

/**
 * The request for confirmPantryInventory: the suggestions as items (in
 * order, so a refused item's index points at its suggestion), the rows they
 * replace, and the rows of the missing items. The rows replaced stay within
 * maxRequestReplaces: a suggestion whose rows would go beyond it is left
 * out, in `left`, to be confirmed on its own afterwards (a single card
 * always fits, since it replaces at most maxReplaces).
 */
export function inventoryRequest({
  location,
  suggestions,
  missing,
}: {
  location: Location;
  suggestions: readonly Pick<
    PantrySuggestion,
    "id" | "name" | "labels" | "ingredient" | "location" | "amount" | "unit" | "replaces"
  >[];
  missing: readonly Pick<MissingItem, "rows">[];
}): InventoryRequest & { included: string[]; left: string[] } {
  const replaces = new Set<string>();
  const included: (typeof suggestions)[number][] = [];
  const left: string[] = [];
  for (const suggestion of suggestions) {
    const more = suggestion.replaces.filter((id) => !replaces.has(id));
    if (replaces.size + more.length > maxRequestReplaces) {
      left.push(suggestion.id);
      continue;
    }
    for (const id of more) replaces.add(id);
    included.push(suggestion);
  }
  return {
    location,
    items: included.map((suggestion) => {
      const { ingredient, location: place, amount, unit } = suggestion;
      // Story 11.2: the photo's label, as confirmItemFromSuggestion gives it: it fills only an item without one.
      const photoLabel = suggestionLabel(suggestion);
      return { ingredient, location: place, amount, unit, ...(photoLabel === null ? {} : { photoLabel }) };
    }),
    replaceRowIds: [...replaces],
    removeRowIds: missing.flatMap((item) => item.rows.map((row) => row.id)),
    included: included.map(({ id }) => id),
    left,
  };
}
