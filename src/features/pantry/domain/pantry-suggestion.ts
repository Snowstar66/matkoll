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
import {
  collapseName,
  maxIngredientNameLength,
  maxPantryAmount,
  unitWithoutUnit,
  type PantryItemForm,
  type PantryItemSet,
} from "./pantry-item-form";
import {
  maxReplaces,
  maxRequestReplaces,
  placeInventorySchema,
  placeStockSchema,
  stockByIngredient,
  suggestionChangeSchema,
  withoutComparison,
  type PlaceStock,
} from "./place-inventory";
import { readingSchema } from "./photo-numbers";
import { definite } from "./places";
import { photoSiteSchema } from "./site";

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
  /** Story 6.5: "osäker" for the model's likely guess; missing counts as "säker". */
  confidence?: "säker" | "osäker";
  amount: number | null;
  unit: string | null;
  hint: IngredientHint;
};

/** At most this many of the model's labels on one suggestion: its card's title. */
export const maxSuggestionLabels = 3;
/** The longest label kept from the model (the AI port's maxPantryItemTextChars). */
export const maxSuggestionLabelChars = 200;

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

export { placeStockSchema, type PlaceStock } from "./place-inventory";

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
    /** "Nytt", "Ändrat" or "oförändrat" when the photo was compared with the place (Story 6.4); `null` otherwise. */
    change: suggestionChangeSchema,
    /** The place's rows of the ingredient that confirming replaces (other units); empty outside "Ändrat". */
    replaces: z.array(z.uuid()).max(maxReplaces),
    /** All the place's rows of the ingredient, when compared: the sheet replaces them when it changes the unit. */
    placeRowIds: z.array(z.uuid()).max(maxReplaces).optional(),
    /**
     * Story 6.5: the model's labels for the items behind the suggestion (brand,
     * sort and size as on the package), different ones in the model's order;
     * the card's title. Text from the model, only ever shown as text.
     */
    labels: z.array(z.string().trim().min(1).max(maxSuggestionLabelChars)).max(maxSuggestionLabels).optional(),
    /** Story 6.5: some item behind it was the model's guess ("osäker"): "Bekräfta alla" leaves it out. */
    uncertain: z.boolean().optional(),
    /**
     * Story 6.6: the numbers of the items behind the suggestion in the
     * reading (`reading` of the answer, from 1), in order; the first is the
     * card's number on the photo.
     */
    itemNumbers: z.array(z.number().int().min(1).max(maxPantrySuggestions)).max(maxPantrySuggestions).optional(),
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
  /**
   * Story 8.4: the place the photo was taken for, as /api/ai/analyze read it
   * (FR-33, AD-24). Every write from the suggestions sends its id, also when
   * Hemma shows another place by then. `null` only for a user without places
   * yet (before ensure_pantry_defaults): the writes then go to the selected
   * place.
   */
  site: photoSiteSchema.nullable(),
  location: locationSchema,
  suggestions: z.array(pantrySuggestionSchema).max(maxPantrySuggestions),
  dropped: z.number().int().min(0),
  /** How the photo compares with what the place has (Story 6.4). */
  inventory: placeInventorySchema,
  /**
   * Story 6.6: the AI's items in reading order, as one-line labels: item n is
   * reading[n − 1], also the ones left out of the suggestions. Sent back with
   * the photo to /api/ai/locate for the numbers on the photo.
   */
  reading: readingSchema.optional(),
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

type Group = {
  name: string;
  ingredient: SuggestionIngredient;
  /** Summed amounts per unit, in the order they first came. */
  byUnit: Map<Unit, number>;
  /** Some item had an amount that cannot be kept: the suggestion is unlimited rather than undercounted. */
  unknown: boolean;
  /** The items' different labels, in order, at most maxSuggestionLabels. */
  labels: string[];
  /** Some item was the model's guess. */
  uncertain: boolean;
  /** Story 6.6: the items' numbers in the reading (index + 1), in order. */
  itemNumbers: number[];
  /** Story 6.6: the numbers of the items with an amount, per unit, for the card of each unit. */
  numbersByUnit: Map<Unit, number[]>;
};

/** A label as compared with the others of a suggestion: lower case, one space between words. */
const labelKey = (label: string) => label.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** Adds the item's label to the group's, unless it is there already, empty, too long or one too many. */
function addLabel(group: Group, label: string) {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text || text.length > maxSuggestionLabelChars || group.labels.length >= maxSuggestionLabels) return;
  if (!group.labels.some((other) => labelKey(other) === labelKey(text))) group.labels.push(text);
}

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
 * - Story 6.5: the items' different labels (at most maxSuggestionLabels) for
 *   the card's title, and `uncertain` when any of its items was the model's
 *   guess, since the summed amount then rests on it too;
 * - Story 6.6: the numbers of its items in `items` (index + 1, the reading
 *   order), so the card and the photo can show the same number; split by
 *   unit, each card has its own items' numbers (the first also those without
 *   amount), so two cards never share one;
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
      group = {
        name,
        ingredient: ingredient(),
        byUnit: new Map<Unit, number>(),
        unknown: false,
        labels: [],
        uncertain: false,
        itemNumbers: [],
        numbersByUnit: new Map<Unit, number[]>(),
      };
      groups.set(key, group);
    }
    addLabel(group, item.label);
    group.itemNumbers.push(index + 1);
    if (item.confidence === "osäker") group.uncertain = true;
    const amount = readAmount(item);
    if (amount.kind === "unknown") group.unknown = true;
    else if (amount.kind === "amount") {
      group.byUnit.set(amount.unit, (group.byUnit.get(amount.unit) ?? 0) + amount.amount);
      group.numbersByUnit.set(amount.unit, [...(group.numbersByUnit.get(amount.unit) ?? []), index + 1]);
    }
  });

  const stocks = current ? stockByIngredient(current) : new Map<string, PlaceStock>();
  const suggestions: Omit<PantrySuggestion, "id">[] = [];
  for (const { name, ingredient, byUnit, unknown, labels, uncertain, itemNumbers, numbersByUnit } of groups.values()) {
    const stock = ingredient.kind === "existing" ? (stocks.get(ingredient.ingredientId) ?? null) : null;
    const base = { name, ingredient, location, current: stock, change: null, replaces: [], labels, uncertain, itemNumbers };
    if (stock?.unlimited || unknown) {
      suggestions.push({ ...base, ...unlimited });
    } else if (byUnit.size > 0) {
      // Story 6.6: each unit's card has the numbers of its own items, and the first also those without amount, so
      // two cards never share a number.
      const withAmount = new Set([...numbersByUnit.values()].flat());
      const withoutAmount = itemNumbers.filter((n) => !withAmount.has(n));
      [...byUnit].forEach(([unit, sum], index) => {
        const numbers = [...(numbersByUnit.get(unit) ?? []), ...(index === 0 ? withoutAmount : [])].sort((a, b) => a - b);
        suggestions.push({ ...base, amount: clampAmount(sum), unit, itemNumbers: numbers });
      });
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

/**
 * A card's title and the catalog ingredient under it (Story 6.5): the
 * model's labels ("Arla mellanmjölk 1,5 l"), separated by commas, with the
 * catalog name under them; just the name when there are no labels, or when
 * the only one is the name ("Ägg" for "ägg").
 */
export function suggestionTitle(suggestion: Pick<PantrySuggestion, "name" | "labels">): {
  title: string;
  ingredientName: string | null;
} {
  const labels = suggestion.labels ?? [];
  if (labels.length === 0) return { title: suggestion.name, ingredientName: null };
  if (labels.length === 1 && normalizeIngredientText(labels[0]) === normalizeIngredientText(suggestion.name)) {
    return { title: suggestion.name, ingredientName: null };
  }
  return { title: labels.join(", "), ingredientName: suggestion.name };
}

/** Under a card's label, when the catalog ingredient differs from it: "Sparas som: vispgrädde". */
export function savedAsText(name: string): string {
  return `Sparas som: ${name}`;
}

/** The badge on a suggestion the model was unsure of (Story 6.5). */
export const uncertainBadgeText = "Osäker";

/** On a card the model was unsure of, under the amount. */
export const uncertainSuggestionText = "AI:n är osäker på varan, så Bekräfta alla tar inte med den.";

/** After "Bekräfta alla" when unsure suggestions are left: "1 osäker vara är kvar att bekräfta eller rätta." */
export function uncertainLeftText(count: number): string {
  return `${count} ${count === 1 ? "osäker vara är" : "osäkra varor är"} kvar att bekräfta eller rätta.`;
}

/** Whether "Bekräfta alla" takes the suggestion: never one the model was unsure of (Story 6.5). */
export function isBulkConfirmable(suggestion: Pick<PantrySuggestion, "uncertain">): boolean {
  return suggestion.uncertain !== true;
}

/** The camera button: "Fotografera kylen", "Fotografera frysen" or "Fotografera skafferiet". */
export function cameraButtonText(location: Location): string {
  return `Fotografera ${definite[location]}`;
}

/** The section's heading: "Lagerförslag från kylen". */
export function suggestionsHeading(location: Location): string {
  return `Lagerförslag från ${definite[location]}`;
}

/** The photo the suggestions were read from, during review: "Fotot av kylen". */
export function analyzedPhotoTitle(location: Location): string {
  return `Fotot av ${definite[location]}`;
}

/** The large photo's alt text: "Fotot av kylen som förslagen kommer från". */
export function analyzedPhotoAlt(location: Location): string {
  return `Fotot av ${definite[location]} som förslagen kommer från`;
}

/** Under the photo's thumbnail: it opens larger. */
export const analyzedPhotoOpenText = "Visa större";

/** Under the large photo's title: it is not kept (AD-15). */
export const analyzedPhotoNoteText = "Jämför förslagen med fotot. Det sparas inte.";

/** Instead of the photo, when the browser cannot show it. */
export const analyzedPhotoErrorText = "Fotot kunde inte visas.";

/** The large photo as a toggle: pressed, it shows in full size, so the labels can be read. */
export const analyzedPhotoFullSizeText = "Visa i full storlek";

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

/** An amount on the "Ändrat" card: "2 förp", "1 l, 2 förp" or "finns hemma". */
function stockText(stock: PlaceStock): string {
  return stock.unlimited ? "finns hemma" : stock.amounts.map(({ amount, unit }) => formatQuantity(amount, unit)).join(", ");
}

/** The suggestion's amount in a sentence: "1 förp", or "finns hemma" when it has none. */
function photoAmountText(suggestion: Pick<PantrySuggestion, "amount" | "unit">): string {
  return suggestion.amount === null ? "finns hemma" : formatQuantity(suggestion.amount, suggestion.unit);
}

/** What an "Ändrat" card shows instead of "I kylen nu": "nu: 2 förp → bilden: 1 förp" (the arrow is hidden from screen readers). */
export function changeText(current: PlaceStock, suggestion: Pick<PantrySuggestion, "amount" | "unit">): string {
  return `nu: ${stockText(current)} → bilden: ${photoAmountText(suggestion)}`;
}

/** What a screen reader hears for changeText: "I kylen nu: 2 förp. På bilden: 1 förp." */
export function changeSpokenText(
  location: Location,
  current: PlaceStock,
  suggestion: Pick<PantrySuggestion, "amount" | "unit">,
): string {
  return `I ${definite[location]} nu: ${stockText(current)}. På bilden: ${photoAmountText(suggestion)}.`;
}

/** Under the heading, for the suggestions that match the place: "1 vara stämmer med lagret." or "2 varor stämmer med lagret." */
export function unchangedCountText(count: number): string {
  return `${count} ${count === 1 ? "vara stämmer" : "varor stämmer"} med lagret.`;
}

/** In the camera area when every suggestion matches the place and nothing is missing: "Allt i kylen stämmer med bilden." */
export function allUnchangedText(location: Location): string {
  return `Allt i ${definite[location]} stämmer med bilden.`;
}

/** Under "Syns inte längre" when some of the AI's items could not be read, so a missing item may just not be understood. */
export const incompleteComparisonText = "Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort.";

/** Under the heading when the place could not be read: "Det gick inte att jämföra med lagret i kylen." */
export function unreadPlaceText(location: Location): string {
  return `Det gick inte att jämföra med lagret i ${definite[location]}.`;
}

/** Under the heading when the place was emptied and put back since the photo: "Lagret i kylen har ändrats sedan bilden togs." */
export function changedPlaceText(location: Location): string {
  return `Lagret i ${definite[location]} har ändrats sedan bilden togs.`;
}

/**
 * In the camera area when what the photo shows matches the place, but the
 * comparison is incomplete: "Det som syns på bilden stämmer med lagret i
 * kylen, men några varor gick inte att tolka."
 */
export function partlyUnchangedText(location: Location): string {
  return `Det som syns på bilden stämmer med lagret i ${definite[location]}, men några varor gick inte att tolka.`;
}

/** After "Bekräfta alla" when some changes did not fit in one call: "1 ändring är kvar att bekräfta." */
export function changesLeftText(count: number): string {
  return `${count} ${count === 1 ? "ändring är" : "ändringar är"} kvar att bekräfta.`;
}

/** The undo button of a confirmation whose "Ångra" puts back only the removals ("Bekräfta alla"). */
export const undoRemovalLabel = "Ångra borttagning";

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

/**
 * The errors "Försök igen" (the same photo again) may help with; never for a
 * photo that cannot be read or is too large, nor for a place that is gone
 * (`pantry_site_gone`, Story 8.4: the same place fails again). The places
 * that could not be read before the AI was asked (`pantry_unavailable`,
 * Story 8.4) may be read the next time.
 */
export const analyzeRetryCodes: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "ai_unavailable",
  "ai_invalid",
  "ai_rejected",
  "catalog_unavailable",
  "pantry_unavailable",
]);

/** At most this many items in one confirmation: more than one photo's suggestions, never a whole pantry. */
export const maxConfirmItems = 40;

/**
 * The catalog ingredient of a confirmed suggestion: one in the catalog (its
 * id is checked against the user's catalog by commitIngredients), or a new
 * one, created only now (AD-6). A new name is collapsed to single spaces,
 * must have something to normalise and has at most maxIngredientNameLength
 * characters. `proposalId` is the suggestion's (6.1), taken but not needed:
 * the same new name is one ingredient anyway.
 */
export const confirmIngredientSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), ingredientId: z.uuid() }),
  z.object({
    kind: z.literal("new"),
    proposalId: z.string().min(1).max(40).optional(),
    name: z
      .string()
      .max(maxIngredientNameLength * 2)
      .transform(collapseName)
      .refine((name) => normalizeIngredientText(name) !== "")
      .refine((name) => name.length <= maxIngredientNameLength),
    section: sectionSchema,
    /** The new ingredient's default place. */
    location: locationSchema,
    defaultUnit: unitSchema.nullable(),
  }),
]);
export type ConfirmIngredient = z.infer<typeof confirmIngredientSchema>;

/**
 * One confirmed suggestion, as confirmPantrySuggestions takes it: the
 * ingredient, the place, and an amount below maxPantryAmount with its unit,
 * or neither (unlimited).
 */
export const confirmItemSchema = z
  .object({
    ingredient: confirmIngredientSchema,
    location: locationSchema,
    amount: z.number().positive().lt(maxPantryAmount).nullable(),
    unit: unitSchema.nullable(),
  })
  .refine(amountHasUnit, { path: ["unit"] });
export type ConfirmItem = z.infer<typeof confirmItemSchema>;
export type ConfirmItemInput = z.input<typeof confirmItemSchema>;

/** The place a confirmation writes to (Story 8.4): the photo's place, or `null` for the selected one. */
const confirmSiteSchema = z.uuid().nullable();

/**
 * What confirmPantrySuggestions takes: the photo's place (`siteId`, Story
 * 8.4) and 1–40 items.
 */
export const confirmSuggestionsSchema = z.object({
  siteId: confirmSiteSchema,
  items: z.array(confirmItemSchema).min(1).max(maxConfirmItems),
});
export type ConfirmSuggestionsInput = z.input<typeof confirmSuggestionsSchema>;

/** At most this many rows one inventory replaces ("Ändrat" in other units); inventoryRequest keeps to it. */
export const maxInventoryReplaces = maxRequestReplaces;
/** At most this many rows one inventory removes ("Syns inte längre"): one pantry page (pantryPageSize). */
export const maxInventoryRemovals = 1000;

/**
 * What confirmPantryInventory takes (Story 6.4): the photo's place (`siteId`,
 * Story 8.4) and location, 0–40 items, the rows they replace and the rows to
 * remove, at least one item or removal, and an operation id (the client's,
 * for "Ångra") with any removal. The limits equal apply_pantry_inventory's.
 */
export const inventoryConfirmSchema = z
  .object({
    siteId: confirmSiteSchema,
    location: locationSchema,
    items: z.array(confirmItemSchema).max(maxConfirmItems),
    replaceRowIds: z.array(z.uuid()).max(maxInventoryReplaces),
    removeRowIds: z.array(z.uuid()).max(maxInventoryRemovals),
    operationId: z.uuid().nullable(),
  })
  .refine(({ items, removeRowIds }) => items.length + removeRowIds.length > 0, { path: ["items"] })
  .refine(({ removeRowIds, operationId }) => removeRowIds.length === 0 || operationId !== null, { path: ["operationId"] });
export type InventoryConfirmInput = z.input<typeof inventoryConfirmSchema>;

/** The ingredient's key: its id, or its new name normalised (commitIngredients makes one ingredient of a name). */
const ingredientKey = (ingredient: ConfirmIngredient) =>
  ingredient.kind === "existing" ? `id:${ingredient.ingredientId}` : `new:${normalizeIngredientText(ingredient.name)}`;

/**
 * The items as set_pantry_items can take them in one call (AD-19), in the
 * order they first came:
 * - one item per ingredient (id, or normalised new name), place and unit,
 *   with the amounts summed and kept below maxPantryAmount (999 999,999);
 * - an ingredient and place with an amount in some item drop the items
 *   without amount, since one place has it either unlimited or with amounts,
 *   and set_pantry_items would let the later item remove the earlier;
 * - a new ingredient keeps its first item's name, section, default place and
 *   unit, so every item creates the same one.
 */
export function mergeConfirmations(items: readonly ConfirmItem[]): ConfirmItem[] {
  const ingredients = new Map<string, ConfirmIngredient>();
  const withAmount = new Set<string>();
  for (const item of items) {
    const key = ingredientKey(item.ingredient);
    if (!ingredients.has(key)) ingredients.set(key, item.ingredient);
    if (item.amount !== null) withAmount.add(`${key}|${item.location}`);
  }
  const merged = new Map<string, ConfirmItem>();
  for (const item of items) {
    const key = ingredientKey(item.ingredient);
    const place = `${key}|${item.location}`;
    if (item.amount === null && withAmount.has(place)) continue;
    const at = `${place}|${item.unit ?? ""}`;
    const earlier = merged.get(at);
    if (earlier && earlier.amount !== null && item.amount !== null) {
      merged.set(at, { ...earlier, amount: clampAmount(earlier.amount + item.amount) });
    } else if (!earlier) {
      merged.set(at, { ...item, ingredient: ingredients.get(key)! });
    }
  }
  return [...merged.values()];
}

/** A suggestion as it is confirmed: its ingredient, place, amount and unit. */
export function confirmItemFromSuggestion(suggestion: PantrySuggestion): ConfirmItemInput {
  const { ingredient, location, amount, unit } = suggestion;
  return { ingredient, location, amount, unit };
}

/**
 * A suggestion corrected in the sheet Lagervara, as it is confirmed: the
 * form's ingredient, place, amount and unit. A new ingredient gets the form's
 * place as its default place, unless it is still the suggestion's own new
 * ingredient (the same name): then it keeps the suggestion's proposal id,
 * default place and unit, with the form's section, so Rätta and then
 * Bekräfta create the same catalog ingredient as Bekräfta alone.
 */
export function confirmItemFromForm(form: PantryItemForm, suggestion?: PantrySuggestion): ConfirmItemInput {
  const { ingredient, location, amount, unit } = form;
  const own = suggestion?.ingredient;
  let confirmed: ConfirmItemInput["ingredient"];
  if (ingredient.kind === "existing") {
    confirmed = { kind: "existing", ingredientId: ingredient.ingredientId };
  } else if (own?.kind === "new" && collapseName(own.name) === collapseName(ingredient.name)) {
    confirmed = { ...own, section: ingredient.section };
  } else {
    confirmed = { kind: "new", name: ingredient.name, section: ingredient.section, location, defaultUnit: ingredient.defaultUnit };
  }
  return { ingredient: confirmed, location, amount, unit };
}

/**
 * Items for setPantryItems once every ingredient has its id: merged again on
 * (ingredient id, place, unit) as mergeConfirmations does, since a new name
 * and an existing id can turn out to be the same ingredient ("gurka").
 */
export function mergePantrySets(items: readonly PantryItemSet[]): PantryItemSet[] {
  return mergeConfirmations(
    items.map(({ ingredientId, location, amount, unit }) => ({
      ingredient: { kind: "existing", ingredientId },
      location,
      amount,
      unit,
    })),
  ).flatMap(({ ingredient, location, amount, unit }) =>
    ingredient.kind === "existing" ? [{ ingredientId: ingredient.ingredientId, location, amount, unit }] : [],
  );
}

/**
 * The suggestions left after a confirmation, with "I kylen nu" as the place
 * has it now: for each confirmed item (merged as the server merges them), an
 * amount replaces the same unit's and makes the ingredient no longer
 * unlimited there, and an unlimited item leaves only "finns hemma". Matched
 * by catalog id, or by the new ingredient's normalised name, and the place.
 * Items that would not pass the schema change nothing.
 */
export function withConfirmedStock(
  suggestions: readonly PantrySuggestion[],
  confirmed: readonly ConfirmItemInput[],
): PantrySuggestion[] {
  const valid = confirmed.flatMap((item) => {
    const parsed = confirmItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const items = mergeConfirmations(valid);
  if (items.length === 0) return [...suggestions];
  return suggestions.map((suggestion) => {
    const key = ingredientKey(suggestion.ingredient);
    const mine = items.filter((item) => ingredientKey(item.ingredient) === key && item.location === suggestion.location);
    if (mine.length === 0) return suggestion;
    let current: PlaceStock = suggestion.current ?? { unlimited: false, amounts: [] };
    for (const { amount, unit } of mine) {
      if (amount === null || unit === null) {
        current = { unlimited: true, amounts: [] };
      } else {
        current = {
          unlimited: false,
          amounts: [...current.amounts.filter((other) => other.unit !== unit), { amount, unit }].sort(
            (a, b) => unitOrder(a.unit) - unitOrder(b.unit),
          ),
        };
      }
    }
    return { ...suggestion, current };
  });
}

/** On a card whose suggestion cannot be confirmed as it is; "Bekräfta alla" leaves it out. */
export const suggestionInvalidText = "Förslaget går inte att spara som det är. Rätta eller avvisa det.";

/**
 * Story 8.4: above the suggestions while Hemma shows another place than the
 * photo's: "Förslagen gäller Stugan."
 */
export function suggestionsSiteText(name: string): string {
  return `Förslagen gäller ${name}.`;
}

/**
 * Whether `result` is from a photo of the place `siteId` (Story 8.4). A
 * result without a place (a user without places) is of the selected place,
 * the only one there is.
 */
export function isPhotoOfSite(result: Pick<AnalyzeResult, "site">, siteId: string): boolean {
  return result.site === null || result.site.id === siteId;
}

/** When the sheet's suggestion was replaced by a newer photo's, or is gone, before Bekräfta or Avvisa. */
export const suggestionGoneText = "Förslaget finns inte längre.";

/** Whether a suggestion can be confirmed as it is (confirmItemSchema). */
export function isConfirmable(suggestion: PantrySuggestion): boolean {
  return confirmItemSchema.safeParse(confirmItemFromSuggestion(suggestion)).success;
}

/**
 * After "Töm kylen" (Story 6.3): the location is empty, so its suggestions
 * lose "I kylen nu"; the others keep theirs.
 */
export function withoutStock(suggestions: readonly PantrySuggestion[], location: Location): PantrySuggestion[] {
  return suggestions.map((suggestion) =>
    suggestion.location === location && (suggestion.current !== null || suggestion.change !== null)
      ? { ...withoutComparison(suggestion), current: null }
      : suggestion,
  );
}

/**
 * After "Töm kylen" (Story 6.3) with suggestions from a photo (Story 6.4):
 * the location is empty, so its suggestions lose "I kylen nu" and their
 * place in the comparison, and a comparison with the emptied location
 * becomes `empty`: the suggestions are a plain list, as for an empty place,
 * and "Syns inte längre" goes. Story 8.4: only when the emptied location is
 * on the photo's place (`siteId`); emptying another place changes nothing.
 */
export function withoutPlace(result: AnalyzeResult, siteId: string, location: Location): AnalyzeResult {
  if (!isPhotoOfSite(result, siteId)) return result;
  return {
    ...result,
    suggestions: withoutStock(result.suggestions, location),
    inventory: result.location === location ? { kind: "empty" } : result.inventory,
  };
}

/**
 * After "Ångra" for an emptied location: the photographed location has items
 * again, but not the ones the photo was compared with, so its comparison is
 * `unread` with `changed` ("Lagret i kylen har ändrats sedan bilden togs."),
 * and the suggestions stay a plain list. Story 8.4: only for the photo's
 * place (`siteId`).
 */
export function withRestoredPlace(result: AnalyzeResult, siteId: string, location: Location): AnalyzeResult {
  return isPhotoOfSite(result, siteId) && result.location === location
    ? { ...result, inventory: { kind: "unread", changed: true } }
    : result;
}

/**
 * After "Ångra" for an emptied location: "I kylen nu" on the location's
 * suggestions gains the rows put back, next to what was confirmed since. A
 * restored row never shares a unit with a row there now (those are skipped),
 * and an ingredient is either unlimited or has amounts.
 */
export function withRestoredStock(
  suggestions: readonly PantrySuggestion[],
  location: Location,
  rows: readonly (PantryAmountRow & { location: Location })[],
): PantrySuggestion[] {
  const stocks = stockByIngredient(rows.filter((row) => row.location === location));
  if (stocks.size === 0) return [...suggestions];
  return suggestions.map((suggestion) => {
    const { ingredient } = suggestion;
    const restored = ingredient.kind === "existing" ? stocks.get(ingredient.ingredientId) : undefined;
    if (suggestion.location !== location || !restored) return suggestion;
    const now = suggestion.current;
    if (!now) return { ...suggestion, current: restored };
    if (now.unlimited || restored.unlimited) return { ...suggestion, current: { unlimited: true, amounts: [] } };
    const amounts = [...now.amounts, ...restored.amounts.filter(({ unit }) => !now.amounts.some((other) => other.unit === unit))];
    return {
      ...suggestion,
      current: { unlimited: false, amounts: amounts.sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit)) },
    };
  });
}
