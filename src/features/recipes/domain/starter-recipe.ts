import { z } from "zod";
import type { PreferenceNote } from "@/components/preference-notes";
import { recipeCategories, recipeCategoryLabels, type RecipeCategory } from "./recipe-category";
import type { RecipeImageSize } from "./recipe-image";
import { parseSharedRecipe, type SharedRecipe } from "./shared-recipe";

// Kom igång med recept (startrecept, 20261112120000_starter_recipes.sql): a pack of the app
// owner's own recipes that a household may CHOOSE to copy into its own list. The texts are copied
// exactly as the owner's recipes have them. Pure, so it is tested without a database.

/** The most recipes a household has for a starter copy to be made (starter_recipe_household_cap). */
export const starterRecipeHouseholdCap = 400;
/** The most recipes in the pack (starter_pack_cap). */
export const starterPackCap = 60;
/** The most characters of a pack item's note. */
export const starterNoteMaxChars = 140;
/** How long the Ångra on Klart stays (the sketch: 6 seconds). */
export const starterUndoMs = 6000;

/** One pack recipe as the picker lists it (starter_pack_list). */
export type StarterListRow = {
  itemId: string;
  title: string;
  servings: number;
  totalMinutes: number | null;
  imageUrl: string | null;
  hasImage: boolean;
  note: string | null;
  lineTexts: string[];
  /** The household's own copy, or the owner's own recipe for the owner's household; null when not added. */
  copyId: string | null;
};

/** A pack recipe as the picker shows it. */
export type StarterItem = StarterListRow & {
  /** The thumbnail to show: the app's own copy of the pack recipe's picture, else its address on the site, else none. */
  imageSrc: string | null;
  categories: RecipeCategory[];
  /** The household's preferences held against it ("Kan innehålla gluten (Anna)"); empty without any. */
  fit: PreferenceNote[];
};

/** How many recipes the household has and the cap starter copies stop at (starter_recipe_room). */
export type StarterRoom = { count: number; cap: number };

/** One pack recipe opened before it is chosen (get_starter_recipe): the shared recipe's shape, plus its note. */
export type StarterRecipe = SharedRecipe & { note: string | null; hasImage: boolean };

/** The owner's view of one pack item (starter_pack_items). */
export type StarterPackEntry = {
  itemId: string;
  recipeId: string;
  title: string;
  servings: number;
  totalMinutes: number | null;
  imageUrl: string | null;
  imagePath: string | null;
  position: number;
  note: string | null;
  /** How many households have a copy (a number only). */
  copies: number;
};

/** The app's own route for a pack recipe's stored picture (src/app/api/starter-image). */
export function starterImageRoute(itemId: string, size: RecipeImageSize): string {
  return `/api/starter-image/${itemId}/${size}`;
}

/** The picture of a pack recipe: the stored copy when there is one, else the address on the site. */
export function starterImageSrc(row: { itemId: string; hasImage: boolean; imageUrl: string | null }, size: RecipeImageSize): string | null {
  return row.hasImage ? starterImageRoute(row.itemId, size) : row.imageUrl;
}

const extraSchema = z.object({ note: z.string().nullable(), has_image: z.boolean() });

/** get_starter_recipe's answer, or `null` for none and for an answer that does not parse. */
export function parseStarterRecipe(value: unknown): StarterRecipe | null {
  const shared = parseSharedRecipe(value);
  const extra = extraSchema.safeParse(value);
  if (!shared || !extra.success) return null;
  return { ...shared, note: extra.data.note, hasImage: extra.data.has_image };
}

/** The pack rows as the picker shows them, with categories and the household's notes (`fits` by item id). */
export function toStarterItems(rows: readonly StarterListRow[], fits: Readonly<Record<string, readonly PreferenceNote[]>> = {}): StarterItem[] {
  return rows.map((row) => ({
    ...row,
    imageSrc: starterImageSrc(row, "thumb"),
    categories: recipeCategories({ title: row.title, ingredients: row.lineTexts, totalMinutes: row.totalMinutes }),
    fit: [...(fits[row.itemId] ?? [])],
  }));
}

/** The rows as a new household sees them: nothing added yet (the owner's preview). */
export function asNewHousehold(rows: readonly StarterListRow[]): StarterListRow[] {
  return rows.map((row) => ({ ...row, copyId: null }));
}

/** Whether an item has a note about an allergy of the household. */
export function hasAllergy(item: Pick<StarterItem, "fit">): boolean {
  return item.fit.some((note) => note.kind === "allergy");
}

/** The picker's filters: all, the categories that some pack recipe has, and "Passar alla" when an allergy is in play. */
export type StarterFilter = "all" | "safe" | RecipeCategory;

const filterOrder: readonly RecipeCategory[] = ["vegetarian", "fish", "poultry", "meat", "quick", "pasta", "soup", "stew", "salad"];

/** The chips over the picker, in order, with their labels and counts (of all pack recipes, added or not). */
export function starterFilters(items: readonly StarterItem[]): { id: StarterFilter; label: string; count: number }[] {
  const chips: { id: StarterFilter; label: string; count: number }[] = [{ id: "all", label: "Alla", count: items.length }];
  if (items.some(hasAllergy)) chips.push({ id: "safe", label: "Passar alla", count: items.filter((item) => !hasAllergy(item)).length });
  for (const category of filterOrder) {
    const count = items.filter((item) => item.categories.includes(category)).length;
    if (count > 0) chips.push({ id: category, label: category === "fish" ? "Fisk" : recipeCategoryLabels[category], count });
  }
  return chips;
}

/** The items a filter shows. */
export function filterStarterItems(items: readonly StarterItem[], filter: StarterFilter): StarterItem[] {
  if (filter === "all") return [...items];
  if (filter === "safe") return items.filter((item) => !hasAllergy(item));
  return items.filter((item) => item.categories.includes(filter));
}

/** How many more recipes the household may add (never below 0). */
export function roomLeft(room: StarterRoom): number {
  return Math.max(0, room.cap - room.count);
}

/** The pack recipes the household does not have yet. */
export function availableItems(items: readonly StarterItem[]): StarterItem[] {
  return items.filter((item) => item.copyId === null);
}

/** The most that may be chosen now: what is left of the pack, at most the room left. */
export function selectionLimit(items: readonly StarterItem[], room: StarterRoom): number {
  return Math.min(availableItems(items).length, roomLeft(room));
}

/**
 * "Välj alla": the shown items that may be chosen, added to the chosen ones in order, until the
 * limit. With everything chosen that may be, the link is "Rensa" and empties the choice instead.
 */
export function selectAll(shown: readonly StarterItem[], selected: readonly string[], limit: number): string[] {
  const out = [...selected];
  for (const item of shown) {
    if (out.length >= limit) break;
    if (item.copyId === null && !out.includes(item.itemId)) out.push(item.itemId);
  }
  return out;
}

/** Whether everything that may be chosen among the shown is chosen (the link then says "Rensa"). */
export function allChosen(shown: readonly StarterItem[], selected: readonly string[], limit: number): boolean {
  const open = shown.filter((item) => item.copyId === null);
  if (open.length === 0 || selected.length === 0) return false;
  return selected.length >= limit || open.every((item) => selected.includes(item.itemId));
}

/** "Inget valt", "1 valt", "6 valda", and at the cap "8 av 8 valda". */
export function chosenText(count: number, limit: number, capped: boolean): string {
  if (count === 0) return "Inget valt";
  const words = `${count === 1 ? "valt" : "valda"}`;
  return capped ? `${count} av ${limit} ${words}` : `${count} ${words}`;
}

/** "Välj alla 20", or "Välj alla 5 visade" while a filter is on. */
export function selectAllText(count: number, filtered: boolean): string {
  return filtered ? `Välj alla ${count} visade` : `Välj alla ${count}`;
}

/** The green button: "Lägg till 6 recept", or "Välj minst ett recept" while nothing is chosen. */
export function addButtonText(count: number): string {
  return count === 0 ? "Välj minst ett recept" : `Lägg till ${count} recept`;
}

/** "20 vardagsrätter. Välj de du vill ha.", "3 finns redan i er lista.", "Glutenfritt. 5 av 20 visas." */
export function pickerSubText(total: number, alreadyAdded: number, filterLabel: string | null, shown: number): string {
  if (filterLabel) return `${filterLabel}. ${shown} av ${total} visas.`;
  if (alreadyAdded > 0) return `${alreadyAdded} finns redan i er lista.`;
  return `${total} ${total === 1 ? "vardagsrätt" : "vardagsrätter"}. Välj de du vill ha.`;
}

/** The sand notice when not all fit: "Receptlistan rymmer 400 recept. Ni har 392, så 8 får plats." */
export function roomNoticeText(room: StarterRoom): string {
  const left = roomLeft(room);
  return `Receptlistan rymmer ${room.cap} recept. Ni har ${room.count}, så ${left} får plats.`;
}

/** "Ni har 400 av 400 recept. Ta bort några för att kunna lägga till fler." */
export function fullText(room: StarterRoom): string {
  return `Ni har ${room.count} av ${room.cap} recept. Ta bort några för att kunna lägga till fler.`;
}

/** "Alla 20 ligger i er receptlista. Där går de att ändra eller ta bort." */
export function allAddedText(total: number): string {
  return `${total === 1 ? "Det" : `Alla ${total}`} ligger i er receptlista. Där går ${total === 1 ? "det" : "de"} att ändra eller ta bort.`;
}

/** "14 recept tillagda", "1 recept tillagt". */
export function addedTitle(count: number): string {
  return `${count} recept ${count === 1 ? "tillagt" : "tillagda"}`;
}

/** "9 av 14 recept hann läggas till. De ligger kvar i er lista." */
export function brokenText(done: number, total: number): string {
  if (done === 0) return "Inget recept hann läggas till. Försök igen när du har internet.";
  return `${done} av ${total} recept hann läggas till. De ligger kvar i er lista.`;
}

/** "Fortsätt med de 5 sista", "Fortsätt med det sista". */
export function continueText(left: number): string {
  return left === 1 ? "Fortsätt med det sista" : `Fortsätt med de ${left} sista`;
}

/** "Behåll de 9", "Behåll det". */
export function keepText(done: number): string {
  return done === 1 ? "Behåll det" : `Behåll de ${done}`;
}

/** "Köttbullar med gräddsås är borttaget." */
export function removedText(title: string): string {
  return `${title} är borttaget.`;
}

/** "Ta bort 3 orörda startrecept", for the button that removes the household's untouched copies. */
export function removeCopiesText(count: number): string {
  return `Ta bort ${count} orörda startrecept`;
}

/** The note an owner types: trimmed, null when empty; `undefined` when it is too long. */
export function cleanNote(value: string): string | null | undefined {
  const note = value.trim();
  if (note === "") return null;
  return note.length > starterNoteMaxChars ? undefined : note;
}
