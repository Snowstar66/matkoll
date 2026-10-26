import { z } from "zod";
import {
  displayAmount,
  formatQuantity,
  locationSchema,
  normalizeIngredientText,
  normalizeUnit,
  sectionSchema,
  UNITS,
  unitSchema,
  type IngredientHint,
  type IngredientMatch,
  type Location,
  type Unit,
} from "@/features/catalog";
import type { AppError, ErrorCode } from "@/lib/errors";
import { roundSum, type PantryAmountRow } from "./pantry-item";
import { collapseName, maxIngredientNameLength, maxPantryAmount, unitWithoutUnit } from "./pantry-item-form";
import { definite } from "./places";

// Lagerförslag (FR-24, AD-6, AD-12, AD-19): what a photo of a place at home
// suggests for the pantry, before Pontus has confirmed anything. Each
// suggestion points at a catalog ingredient (existing, or new and created only
// when confirmed), has the photographed place and an amount and unit, or
// none (unlimited: "Finns hemma"), and shows what the place has of it now.
// Pure, so it is tested without a database or a model.

/**
 * What the AI port answers per item (AiPantryItem), declared here because the
 * domain never imports the port: what the model sees, an amount and unit as
 * it says them, and its catalog hint.
 */
export type AiPantryItemLike = {
  label: string;
  amount: number | null;
  unit: string | null;
  hint: IngredientHint;
};

/** At most this many suggestions from one photo; the server keeps the AI's first 25 items (the AI port's inputLimits.analyze.maxItems). */
export const maxPantrySuggestions = 25;

/** The largest amount a suggestion keeps: summed duplicates and amounts from the place are cut here, below maxPantryAmount. */
export const maxSuggestionAmount = 999_999.999;

/** The longest name of a new catalog ingredient from a photo: a food's base form, not a label (far below maxIngredientNameLength). */
export const maxNewNameChars = 40;
/** The most words in a new ingredient's name from a photo ("gul lök", "crème fraiche lätt"). */
export const maxNewNameWords = 4;
/** Letters, digits, spaces, hyphens and common punctuation; nothing else from the model becomes a name. */
const nameCharacters = /^[\p{L}\p{M}\p{N} .,'’&%/()-]+$/u;
/** Something that reads as a web address ("www.", "http", "exempel.se"): never a food's name. */
const addressLike = /www\.|\bhttps?\b|\p{L}{2,}\.\p{L}{2,}/iu;

/**
 * A name a new catalog ingredient from a photo can have. The model's text is
 * untrusted, so only a short base form passes: single spaces, something to
 * normalise, at most maxNewNameChars (and maxIngredientNameLength) characters
 * and maxNewNameWords words, only letters, digits, spaces, hyphens and common
 * punctuation, and nothing that reads as a web address.
 */
export function isUsableNewName(name: string): boolean {
  return (
    name === collapseName(name) &&
    normalizeIngredientText(name) !== "" &&
    name.length <= Math.min(maxNewNameChars, maxIngredientNameLength) &&
    name.split(" ").length <= maxNewNameWords &&
    nameCharacters.test(name) &&
    !addressLike.test(name)
  );
}

/** The suggestion's catalog ingredient: one in the catalog, or one created only when the suggestion is confirmed (AD-6). */
export const suggestionIngredientSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), ingredientId: z.uuid() }),
  z.object({
    kind: z.literal("new"),
    /** "n1", "n2" …: the same new ingredient in suggestions of different units has the same id, so it is created once. */
    proposalId: z.string().min(1),
    name: z.string().refine(isUsableNewName),
    section: sectionSchema,
    /** The photographed place: the item is seen there. */
    location: locationSchema,
    defaultUnit: unitSchema.nullable(),
  }),
]);
export type SuggestionIngredient = z.infer<typeof suggestionIngredientSchema>;

const amountHasUnit = (item: { amount: number | null; unit: string | null }) =>
  (item.amount === null) === (item.unit === null);

/** What the place has of the suggestion's ingredient now: unlimited, or its amounts per unit. */
export const placeStockSchema = z.object({
  unlimited: z.boolean(),
  amounts: z.array(z.object({ amount: z.number().positive(), unit: unitSchema })),
});
export type PlaceStock = z.infer<typeof placeStockSchema>;

export const pantrySuggestionSchema = z
  .object({
    /** "s1", "s2" …, unique within one analysis. */
    id: z.string().min(1),
    /** The catalog name for an existing ingredient, the proposed name for a new one. */
    name: z.string().trim().min(1),
    ingredient: suggestionIngredientSchema,
    location: locationSchema,
    /** `null` together with `unit`: unlimited ("Finns hemma"). */
    amount: z.number().positive().lt(maxPantryAmount).nullable(),
    unit: unitSchema.nullable(),
    /** The place's stock of the ingredient, or `null` when it has none or it could not be read. */
    current: placeStockSchema.nullable(),
  })
  .refine(amountHasUnit, { path: ["unit"] });
export type PantrySuggestion = z.infer<typeof pantrySuggestionSchema>;

/**
 * What /api/ai/analyze answers, checked by the client too: the photographed
 * place, its suggestions and how many of the AI's items were left out (no
 * catalog link or name, a name that cannot be used, or not valid). No
 * suggestions but some left out means the photo had items that could not be
 * read, not that it had none.
 */
export const analyzeResultSchema = z.object({
  location: locationSchema,
  suggestions: z.array(pantrySuggestionSchema).max(maxPantrySuggestions),
  dropped: z.number().int().min(0),
});
export type AnalyzeResult = z.infer<typeof analyzeResultSchema>;

type Amount = { amount: number; unit: Unit } | { amount: null; unit: null };
const unlimited: Amount = { amount: null, unit: null };

/** An item's amount as read: none, an amount in a unit the pantry knows, or one that cannot be kept (an unknown unit, too large). */
type ReadAmount = { kind: "none" } | { kind: "amount"; amount: number; unit: Unit } | { kind: "unknown" };

/**
 * The item's amount as the pantry keeps it (AD-12): rounded first as it is
 * shown (displayAmount), so an amount that rounds to 0 is none; the unit read
 * by normalizeUnit, where an amount without unit is pieces (`st`); an unknown
 * unit or an amount the pantry cannot keep is `unknown`, which makes the
 * suggestion unlimited.
 */
function readAmount(item: Pick<AiPantryItemLike, "amount" | "unit">): ReadAmount {
  if (item.amount === null || !Number.isFinite(item.amount)) return { kind: "none" };
  const amount = displayAmount(item.amount);
  if (amount <= 0) return { kind: "none" };
  if (amount >= maxPantryAmount) return { kind: "unknown" };
  const unit = normalizeUnit(item.unit);
  if (!unit.known) return { kind: "unknown" };
  return { kind: "amount", amount, unit: unit.unit ?? unitWithoutUnit };
}

/** An amount below maxPantryAmount, as a suggestion keeps it. */
const clampAmount = (amount: number) => Math.min(roundSum(amount), maxSuggestionAmount);

const unitOrder = (unit: Unit) => UNITS.indexOf(unit);

/** The place's stock per catalog ingredient id, from its rows: unlimited, or the amounts per unit in the order of UNITS. */
function stockByIngredient(rows: readonly PantryAmountRow[]): Map<string, PlaceStock> {
  const sums = new Map<string, { unlimited: boolean; byUnit: Map<Unit, number> }>();
  for (const row of rows) {
    const stock = sums.get(row.ingredientId) ?? { unlimited: false, byUnit: new Map<Unit, number>() };
    sums.set(row.ingredientId, stock);
    if (row.amount === null || row.unit === null) stock.unlimited = true;
    else stock.byUnit.set(row.unit, (stock.byUnit.get(row.unit) ?? 0) + row.amount);
  }
  return new Map(
    [...sums].map(([id, { unlimited: isUnlimited, byUnit }]) => [
      id,
      {
        unlimited: isUnlimited,
        amounts: [...byUnit]
          .map(([unit, amount]) => ({ amount: roundSum(amount), unit }))
          .sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit)),
      },
    ]),
  );
}

type Group = {
  name: string;
  ingredient: SuggestionIngredient;
  /** Summed amounts per unit, in the order they first came. */
  byUnit: Map<Unit, number>;
  /** Some item had an amount that cannot be kept: the suggestion is unlimited rather than undercounted. */
  unknown: boolean;
};

/** How many of the AI's items toPantrySuggestions left out, and why. */
export type DroppedItems = {
  /** matchIngredients found nothing to link or propose. */
  unmatched: number;
  /** Linked to a catalog ingredient whose name could not be found. */
  unnamed: number;
  /** A new ingredient whose name cannot be used (isUsableNewName). */
  unusable: number;
};

export type ToSuggestionsOptions = {
  /** The photographed place: every suggestion's place, and a new ingredient's default place. */
  location: Location;
  /** The catalog names of the matched ingredients, by id (catalog.getIngredientNames). */
  names: Readonly<Record<string, string>>;
  /** The place's pantry rows (listPantry), or `null` when they could not be read: no "I kylen nu" then. */
  current: readonly PantryAmountRow[] | null;
};

/**
 * The suggestions for the AI's items and their catalog matches (one match per
 * item, in order; the link comes from matchIngredients alone, AD-6):
 * - an unmatched item, a match whose name is missing and a new ingredient
 *   whose name cannot be used are left out, and counted in `dropped`;
 * - the name is the catalog's for a match and the proposal's for a new one,
 *   which gets the photographed place, the proposal's section and unit, and a
 *   proposal id shared by all its suggestions;
 * - amount and unit as readAmount reads them;
 * - the same ingredient (id, or normalised new name) and unit are one
 *   suggestion with the amounts summed (below maxPantryAmount), an item
 *   without amount goes into one with an amount, and an item whose amount
 *   cannot be kept makes the ingredient's suggestion unlimited;
 * - an ingredient unlimited at the place stays unlimited (as addToPantry
 *   does), and one without amount whose place has it in exactly one unit gets
 *   that amount, so confirming never turns "mjölk 2 förp" into "Finns hemma";
 * - sorted by name (Swedish order), with the ids s1, s2 ….
 */
export function toPantrySuggestions(
  items: readonly AiPantryItemLike[],
  matches: readonly IngredientMatch[],
  { location, names, current }: ToSuggestionsOptions,
): { suggestions: PantrySuggestion[]; dropped: DroppedItems } {
  const dropped: DroppedItems = { unmatched: 0, unnamed: 0, unusable: 0 };
  const groups = new Map<string, Group>();
  let proposals = 0;
  items.forEach((item, index) => {
    const match = matches[index];
    let key: string;
    let name: string;
    let ingredient: () => SuggestionIngredient;
    if (!match || match.kind === "unmatched") {
      dropped.unmatched++;
      return;
    }
    if (match.kind === "match") {
      const catalogName = names[match.ingredientId];
      if (catalogName === undefined) {
        dropped.unnamed++;
        return;
      }
      key = `id:${match.ingredientId}`;
      name = catalogName;
      ingredient = () => ({ kind: "existing", ingredientId: match.ingredientId });
    } else {
      name = collapseName(match.proposal.name);
      if (!isUsableNewName(name)) {
        dropped.unusable++;
        return;
      }
      key = `new:${normalizeIngredientText(name)}`;
      const { section, defaultUnit } = match.proposal;
      ingredient = () => ({ kind: "new", proposalId: `n${++proposals}`, name, section, location, defaultUnit });
    }
    let group = groups.get(key);
    if (!group) {
      group = { name, ingredient: ingredient(), byUnit: new Map<Unit, number>(), unknown: false };
      groups.set(key, group);
    }
    const amount = readAmount(item);
    if (amount.kind === "unknown") group.unknown = true;
    else if (amount.kind === "amount") group.byUnit.set(amount.unit, (group.byUnit.get(amount.unit) ?? 0) + amount.amount);
  });

  const stocks = current ? stockByIngredient(current) : new Map<string, PlaceStock>();
  const suggestions: Omit<PantrySuggestion, "id">[] = [];
  for (const { name, ingredient, byUnit, unknown } of groups.values()) {
    const stock = ingredient.kind === "existing" ? (stocks.get(ingredient.ingredientId) ?? null) : null;
    const base = { name, ingredient, location, current: stock };
    if (stock?.unlimited || unknown) {
      suggestions.push({ ...base, ...unlimited });
    } else if (byUnit.size > 0) {
      for (const [unit, sum] of byUnit) suggestions.push({ ...base, amount: clampAmount(sum), unit });
    } else if (stock && stock.amounts.length === 1) {
      const [{ amount, unit }] = stock.amounts;
      suggestions.push({ ...base, amount: clampAmount(amount), unit });
    } else {
      suggestions.push({ ...base, ...unlimited });
    }
  }
  return {
    suggestions: suggestions
      .sort((a, b) => a.name.localeCompare(b.name, "sv"))
      .map((suggestion, index) => ({ id: `s${index + 1}`, ...suggestion })),
    dropped,
  };
}

/** The camera button: "Fotografera kylen", "Fotografera frysen" or "Fotografera skafferiet". */
export function cameraButtonText(location: Location): string {
  return `Fotografera ${definite[location]}`;
}

/** The section's heading: "Lagerförslag från kylen". */
export function suggestionsHeading(location: Location): string {
  return `Lagerförslag från ${definite[location]}`;
}

/** What the place has now: "I kylen nu: 2 förp", "I kylen nu: 1 l, 2 förp" or "I kylen nu: finns hemma". */
export function currentAmountText(location: Location, current: PlaceStock): string {
  const amounts = current.unlimited
    ? "finns hemma"
    : current.amounts.map(({ amount, unit }) => formatQuantity(amount, unit)).join(", ");
  return `I ${definite[location]} nu: ${amounts}`;
}

/** The suggestion's amount: "1 förp", "6 st", or "Finns hemma" when it has none. */
export function suggestionAmountText(suggestion: Pick<PantrySuggestion, "amount" | "unit">): string {
  return suggestion.amount === null ? "Finns hemma" : formatQuantity(suggestion.amount, suggestion.unit);
}

/** When the photo shows no food (EXPERIENCE.md, State Patterns). */
export const noSuggestionsText = "Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand.";

/** When the AI named items, but none of them could become a suggestion. */
export const unreadableItemsText = "Det gick inte att tolka varorna på bilden. Ta en ny bild eller lägg till för hand.";

/** Read out when suggestions arrive while focus is elsewhere: "6 lagerförslag från kylen." */
export function suggestionsArrivedText(location: Location, count: number): string {
  return `${count} lagerförslag från ${definite[location]}.`;
}

/** `ai_rejected` for a photo: the shared text asks for a shorter text, which a photo cannot be. */
export const analyzeRejectedMessage = "AI-tjänsten tog inte emot bilden. Ta en ny bild eller försök igen senare.";

/** The text for an analysis error. */
export function analyzeErrorMessage(error: Pick<AppError, "code" | "message">): string {
  return error.code === "ai_rejected" ? analyzeRejectedMessage : error.message;
}

/** The errors "Försök igen" (the same photo again) may help with; never for a photo that cannot be read or is too large. */
export const analyzeRetryCodes: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "ai_unavailable",
  "ai_invalid",
  "ai_rejected",
  "catalog_unavailable",
]);
