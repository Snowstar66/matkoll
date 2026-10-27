import {
  CATEGORIES,
  type Category,
  displayCategory,
  formatQuantity,
  nameInText,
  SECTIONS,
  type NameInText,
  type Section,
  type Unit,
} from "@/features/catalog";
import { dishCountText } from "@/features/mealplan";
import type { Store } from "@/features/settings";
import type { ShoppingLine } from "./compute-list";

// What Inköpslista says (EXPERIENCE.md, UX-DR9). Pure, so it is tested
// without React.

/** The empty list without a meal plan, or with a plan without dishes. */
export const emptyPlanText = "Lägg rätter på matsedeln så räknas listan fram.";

/**
 * The empty list with dishes on the plan: everything is in the pantry it is
 * counted against. "Allt finns i lagret för Stugan." with the place's name
 * (pantry.shownSiteName, with more than one place), also for Hemma, so the
 * text works with any name without inflection; "Allt finns hemma." without
 * one, as in 1.0 (UX-DR17, Story 8.5).
 */
export function allInStockText(siteName: string | null): string {
  return siteName === null ? "Allt finns hemma." : `Allt finns i lagret för ${siteName}.`;
}

/** Above the list when the pantry could not be read, so nothing is taken off. */
export const pantryUnreadText = "Det gick inte att läsa lagret, så inget är avdraget från listan.";

/** Above the list when the checks could not be read: none is shown, and checking is off. */
export const checksUnreadText = "Det gick inte att läsa bockarna, så det går inte att bocka av just nu.";

/** Dishes whose recipe is deleted (or could not be read), which the list leaves out. */
export function skippedDishesText(count: number): string {
  return count === 1
    ? "1 rätt med borttaget recept räknas inte."
    : `${count} rätter med borttagna recept räknas inte.`;
}

/** "1 vara kvar", "12 varor kvar": the lines not checked off. */
export function itemsLeftText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"} kvar`;
}

/** The number of lines not checked off. */
export function itemsLeft(lines: readonly Pick<ShoppingLine, "checked">[]): number {
  return lines.filter((line) => !line.checked).length;
}

/**
 * The line under the title: "Vecka 44 · 3 rätter"; without dishes (only own
 * items) just "Vecka 44". How many items are left stands in the progress row
 * below it (Story 11.4).
 */
export function listSummaryText(planName: string, dishCount: number): string {
  return dishCount > 0 ? `${planName} · ${dishCountText(dishCount)}` : planName;
}

/**
 * The progress row at the top of the list (Story 11.4, FR-43): "8 varor
 * kvar" and "6 av 14 i korgen", counted over the lines not hidden; when
 * every line is checked off, "Allt ligger i korgen" alone (`basket` is
 * `null`).
 */
export function progressText(left: number, checked: number, total: number): { left: string; basket: string | null } {
  if (total > 0 && left === 0) return { left: "Allt ligger i korgen", basket: null };
  return { left: itemsLeftText(left), basket: `${checked} av ${total} i korgen` };
}

/** The basket row under the list: "1 vara i korgen", "6 varor i korgen". */
export function basketText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"} i korgen`;
}

/**
 * The basket row's button for screen readers, starting with its visible
 * text ("Visa", "Dölj"): "Visa I korgen (6 varor)", "Dölj I korgen".
 */
export function basketToggleText(open: boolean, count: number): string {
  return open ? "Dölj I korgen" : `Visa I korgen (${count} ${count === 1 ? "vara" : "varor"})`;
}

/** The heading of the checked lines when "Visa" opens them. */
export const basketTitle = "I korgen";

/** Announced when a line is checked off and moves to I korgen: "Citron i korgen.". */
export function inBasketAnnouncement(label: NameInText): string {
  return `${nameInText(label, "start")} i korgen.`;
}

/** Announced when a check in I korgen is taken off: "Citron tillbaka på listan.". */
export function backOnListAnnouncement(label: NameInText): string {
  return `${nameInText(label, "start")} tillbaka på listan.`;
}

/**
 * When "Ångra" could not put own items back: "Det gick inte att ångra
 * diskmedel.", "… diskmedel och kaffe.", "… 3 varor."; without names the
 * plain "Det gick inte att ångra." (shopping_restore_failed). The names are
 * inside the sentence: a catalog name starts in lower case, and the user's
 * own text stays as written (lineName, Story 10.4).
 */
export function restoreFailedText(labels: readonly NameInText[]): string {
  const [first = "", second = ""] = labels.map((label) => nameInText(label, "inside"));
  if (labels.length === 0) return "Det gick inte att ångra.";
  if (labels.length === 1) return `Det gick inte att ångra ${first}.`;
  if (labels.length === 2) return `Det gick inte att ångra ${first} och ${second}.`;
  return `Det gick inte att ångra ${labels.length} varor.`;
}

/**
 * A line's name for a text (Story 10.4): the catalog name of a recipe line
 * with a catalog ingredient, otherwise the user's own item or the recipe
 * line's text, which is shown as written.
 */
export function lineName(line: Pick<ShoppingLine, "label" | "ingredientId" | "isCustom">): NameInText {
  return line.ingredientId !== undefined && !line.isCustom ? line.label : { text: line.label, own: true };
}

/** Announced when the list is counted again while it is open: "Inköpslistan är omräknad. 12 varor kvar." */
export function recountedText(left: number): string {
  return `Inköpslistan är omräknad. ${itemsLeftText(left)}.`;
}

/**
 * Announced when the list is counted against another place while it is
 * open, and the switch was not made from its own sheet (another device,
 * Hemma, or a place that was gone): "Listan räknas nu mot Hemma. 3 varor
 * kvar." (Story 8.5).
 */
export function siteRecountedText(siteName: string, left: number): string {
  return `Listan räknas nu mot ${siteName}. ${itemsLeftText(left)}.`;
}

/** The titles of the dishes a line comes from, each once (a recipe can be on the plan twice), in plan order. */
function dishTitlesOf(origins: readonly string[], dishTitles: Readonly<Record<string, string>>): string[] {
  return [...new Set(origins.flatMap((id) => (dishTitles[id] ? [dishTitles[id]] : [])))];
}

/**
 * "från Krämig kycklinggryta, Linssoppa": the dishes a line comes from, each
 * title once, in plan order; the basis of detailOriginsText. `null` when no
 * title is known.
 */
export function originsText(origins: readonly string[], dishTitles: Readonly<Record<string, string>>): string | null {
  const titles = dishTitlesOf(origins, dishTitles);
  return titles.length > 0 ? `från ${titles.join(", ")}` : null;
}

/** Under an own item in the list. */
export const customItemMetaText = "Egen vara";

/**
 * The line under a list line's name (Story 11.4, FR-43): "Egen vara" for an
 * own item; the dishes it comes from with " · " between them ("Korv
 * stroganoff · Kycklinggryta"), without "från"; for a vague line whose
 * ingredient is not in the pantry, "Saknas i lagret" first, or "Saknas i
 * Stugan" with the place's name (pantry.shownSiteName, with more than one
 * place). Only when the pantry was read (`pantryRead`): when it could not
 * be, nothing is known to be missing, and only the dishes are said. `null`
 * when there is nothing to say.
 */
export function lineMetaText(
  line: Pick<ShoppingLine, "isCustom" | "isVague" | "origins">,
  dishTitles: Readonly<Record<string, string>>,
  siteName: string | null,
  pantryRead = true,
): string | null {
  if (line.isCustom) return customItemMetaText;
  const missing = line.isVague ? missingText(siteName, pantryRead) : null;
  const parts = [...(missing ? [missing] : []), ...dishTitlesOf(line.origins, dishTitles)];
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * What a vague line says about the pantry: "Saknas i lagret", or "Saknas i
 * Stugan" with the place's name; `null` when the pantry could not be read.
 */
export function missingText(siteName: string | null, pantryRead = true): string | null {
  return pantryRead ? `Saknas i ${siteName ?? "lagret"}` : null;
}

/**
 * In Listpostdetalj: "Från Krämig kycklinggryta, Linssoppa", the dishes a line
 * comes from as in originsText. `null` when no title is known.
 */
export function detailOriginsText(origins: readonly string[], dishTitles: Readonly<Record<string, string>>): string | null {
  const text = originsText(origins, dishTitles);
  return text === null ? null : `F${text.slice(1)}`;
}

/** In Listpostdetalj beside a corrected amount: "Beräknat: 3 dl", the amount the list counted. */
export function computedAmountText(amount: number, unit: Unit | null): string {
  return `Beräknat: ${formatQuantity(amount, unit)}`;
}

/** The text button that takes a corrected amount off. */
export const backToComputedText = "Använd beräknad mängd";

/**
 * The amount a line shows after its name: "3 dl", "2 dl (hemma: 1 kg)", "2
 * dl (beräknat 4 dl)" for a correction whose counted amount has changed
 * since. A vague line shows none: the line under it says "Saknas i lagret"
 * (lineMetaText, Story 11.4). A line without a catalog ingredient, whose
 * text says how much, shows its multiplier when it is not 1 ("×2", "×1,5"),
 * else nothing.
 */
export function lineAmountText(
  line: Pick<ShoppingLine, "amount" | "unit" | "isVague" | "pantryNote" | "multiplier" | "computedAmount" | "computedChanged">,
): string {
  if (line.isVague) return "";
  if (line.multiplier !== undefined && line.multiplier !== 1) return `×${formatQuantity(line.multiplier, null)}`;
  const amount = formatQuantity(line.amount, line.unit);
  if (!amount) return amount;
  // A correction whose counted amount has changed since it was saved says so (Story 3.6).
  const notes = [
    ...(line.computedChanged && line.computedAmount !== undefined
      ? [`beräknat ${formatQuantity(line.computedAmount, line.unit)}`]
      : []),
    ...(line.pantryNote ? [line.pantryNote] : []),
  ];
  return notes.length > 0 ? `${amount} (${notes.join(", ")})` : amount;
}

/**
 * The check's name for screen readers, which read its state (avbockad or
 * not) beside it: the line's name and its amount, "Paprika, röd, 1 st",
 * "Mjöl, 2 dl (hemma: 1 kg)"; a vague line's name alone, "Salt".
 */
export function checkLabel(
  line: Pick<
    ShoppingLine,
    "label" | "amount" | "unit" | "isVague" | "pantryNote" | "multiplier" | "computedAmount" | "computedChanged"
  >,
): string {
  const amount = lineAmountText(line);
  return amount ? `${line.label}, ${amount}` : line.label;
}

/**
 * The lines per section, in the order of SECTIONS; sections without lines are
 * left out. Keeps the lines' order. A line in a section outside SECTIONS is
 * shown under Övrigt, so no line is ever dropped.
 */
export function groupBySection(lines: readonly ShoppingLine[]): { section: Section; lines: ShoppingLine[] }[] {
  const known: ReadonlySet<string> = new Set(SECTIONS);
  const bySection = new Map<Section, ShoppingLine[]>();
  for (const line of lines) {
    const section: Section = known.has(line.section) ? line.section : "Övrigt";
    const group = bySection.get(section);
    if (group) group.push(line);
    else bySection.set(section, [line]);
  }
  return SECTIONS.flatMap((section) => {
    const group = bySection.get(section);
    return group ? [{ section, lines: group }] : [];
  });
}

/**
 * The lines per display category (Story 11.4, FR-40), in the order of
 * CATEGORIES; categories without lines are left out. The category is
 * catalog.displayCategory of the line's section and name, so the list reads
 * like Lagersaldo. Keeps the lines' order within a category. The export
 * still groups by section (groupBySection, AD-16).
 */
export function groupByCategory<T extends Pick<ShoppingLine, "section" | "label">>(
  lines: readonly T[],
): { category: Category; lines: T[] }[] {
  const byCategory = new Map<Category, T[]>();
  for (const line of lines) {
    const category = displayCategory(line.section, line.label);
    const group = byCategory.get(category);
    if (group) group.push(line);
    else byCategory.set(category, [line]);
  }
  return CATEGORIES.flatMap((category) => {
    const group = byCategory.get(category);
    return group ? [{ category, lines: group }] : [];
  });
}

/** Under the list when lines are hidden: "Dolda varor (2)". */
export function hiddenLinesButtonText(count: number): string {
  return `Dolda varor (${count})`;
}

/** The sheet with the hidden lines, and its button that shows one again. */
export const hiddenLinesTitle = "Dolda varor";
export const showAgainText = "Visa igen";

/** The primary button above the tab bar while a line is checked off (Story 3.7). */
export const putInPantryButtonText = "Lägg i lagret";

/**
 * The short confirmation after "Lägg i lagret": "Lagt 8 varor i lagret.",
 * "Lagt 1 vara i lagret."; when only own items without a catalog ingredient
 * were checked, "Tog bort 1 vara från listan.", "Tog bort 2 varor från
 * listan."; `null` when nothing was put in the pantry or taken off the list
 * (only lines without a catalog ingredient were checked, and their checks
 * are cleared). With `siteName`, the place the items went to when the user
 * has more than one (putCheckedInPantry): "Lagt 8 varor i lagret för
 * Stugan." (EXPERIENCE.md, Voice and Tone).
 */
export function putInPantryText(added: number, removed: number, siteName: string | null = null): string | null {
  const items = (count: number) => `${count} ${count === 1 ? "vara" : "varor"}`;
  if (added > 0) return `Lagt ${items(added)} i lagret${siteName ? ` för ${siteName}` : ""}.`;
  if (removed > 0) return `Tog bort ${items(removed)} från listan.`;
  return null;
}

/**
 * After "Lägg i lagret" when the list's place was removed elsewhere
 * (`pantry_site_gone`): nothing was added, the checks stay, and the list is
 * read again against the place selected now, named when the user has more
 * than one (putCheckedInPantry's `fields.site`).
 */
export function siteGoneText(selectedName: string | null): string {
  const recounted = selectedName ? `Listan har räknats om mot ${selectedName}.` : "Listan har räknats om.";
  return `Stället finns inte längre. ${recounted} Tryck Lägg i lagret igen.`;
}

/** After "Lägg i lagret" when some checked lines could not go to the pantry; they keep their checks. */
export const partlyPutInPantryText = "Det gick inte att lägga allt i lagret.";

/** After "Lägg i lagret" when no answer came: trying again adds nothing twice. */
export const serverUnreachableText = "Det gick inte att nå servern. Försök igen.";

/**
 * The button that copies the basket export (Story 7.3), named after the
 * selected store's chain: "Skicka till ICA", "Skicka till Willys"; "Skicka
 * till butiken" for Annan, or without a store. The export is the same for
 * every chain (decision 2026-10-26).
 */
export function sendButtonText(store: Pick<Store, "chain"> | null): string {
  return !store || store.chain === "Annan" ? "Skicka till butiken" : `Skicka till ${store.chain}`;
}

/** What the confirmation after a copy must say beside "kopierad". */
export type CopiedNotes = {
  /** The product choices could not be read: the export has none. */
  withoutChoices?: boolean;
  /** Some exported items' choices could not be read: the export lacks those. */
  partialChoices?: boolean;
  /** The checks could not be read: items already in the basket may be in the export. */
  checksUnread?: boolean;
};

/**
 * The short confirmation after the export is copied: "Inköpslistan är
 * kopierad. Klistra in den i Claude i Chrome på ICA Handla."; for another
 * chain "… på butikens webbplats."; "kopierad utan produktval" when the
 * choices could not be read, "utan alla produktval" when some could not;
 * and when the checks could not be read, "…, men bockarna gick inte att
 * läsa. Kontrollera varukorgen." instead of where to paste.
 */
export function copiedText(
  store: Pick<Store, "chain"> | null,
  { withoutChoices = false, partialChoices = false, checksUnread = false }: CopiedNotes = {},
): string {
  const choices = withoutChoices ? " utan produktval" : partialChoices ? " utan alla produktval" : "";
  if (checksUnread) return `Inköpslistan är kopierad${choices}, men bockarna gick inte att läsa. Kontrollera varukorgen.`;
  const where = store?.chain === "ICA" ? "ICA Handla" : "butikens webbplats";
  return `Inköpslistan är kopierad${choices}. Klistra in den i Claude i Chrome på ${where}.`;
}

/** The sheet with the export when the browser refuses the clipboard. */
export const exportSheetTitle = "Inköpslistan";
/** The read-only field in that sheet, for screen readers. */
export const exportTextLabel = "Exporttext";
/** The sheet's primary button, which tries the clipboard again. */
export const copyText = "Kopiera";
/** Under the field when "Kopiera" is refused again; the text is selected again. */
export const copyFailedText = "Det gick inte att kopiera. Markera texten och kopiera den själv.";
