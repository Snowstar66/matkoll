import { normalizeUnit, parseQuantity, type Unit } from "@/features/catalog";
import { labelKey } from "@/lib/label-key";
import { capitalizeFirst } from "./quick-add";
import { collapseLabel, exactAmountText, maxCustomAmount, maxCustomLabelLength, type CustomItemFormInput } from "./custom-item";

// "Fota en lista" and "Klistra in en lista" in Lägg till vara: a list read from a photo or pasted becomes rows to
// review, then own items. Pure, so it is tested without a database. The pasted text is read here, without AI.

/** The most items one list import keeps (the AI port's maxListItems is the same). */
export const maxImportItems = 60;
/** The longest pasted text, in characters; more is cut off before it is read. */
export const maxImportTextChars = 6000;

/** The sheet's two small choices under the field. */
export const photoChoiceText = "Fota en lista";
export const pasteChoiceText = "Klistra in en lista";
export const pasteTitle = "Klistra in en lista";
export const reviewTitle = "Lägg till från lista";
export const pasteHelpText = "En vara per rad. Punkter, kryssrutor och mängder som ”2 dl mjölk” går bra.";
export const pasteFieldLabel = "Listan";
export const pasteReadText = "Läs listan";
export const readingText = "Läser listan …";
export const alreadyOnListText = "Finns redan";
export const noItemsOnPhotoText = "Hittade inga varor på bilden. Prova en skarpare bild, eller klistra in listan.";
export const noItemsInTextText = "Hittade inga varor i texten. Skriv en vara per rad.";
export const cancelText = "Avbryt";
export const photoChoiceHint = "Ta en bild eller välj en från albumet";

/** One line of a list as it goes to the review: a name, and an amount with its unit, both or neither. */
export type ListImportItem = { name: string; amount: number | null; unit: Unit | null };

/** A leading bullet, checkbox or number that only decorates the line: "- ", "• ", "☐ ", "[ ] ", "1. ", "2) ". */
const decoration = /^\s*(?:[-*•·▪◦‣–—]|\[[ xX✓✔]?\]|\([ xX✓✔]?\)|[☐☑☒✓✔□■▢]|\d{1,3}[.)])(?=\s)\s*/u;

const number = String.raw`\d+\s*[/⁄]\s*\d+|\d+\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s+\d+\s*[/⁄]\s*\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:[.,]\d+)?`;
const quantity = String.raw`(?:${number})(?:\s*[-–]\s*(?:${number}))?`;
// "2 dl mjölk", "2dl mjölk", "3 bananer", "½ liter grädde": the amount first, then an optional unit word, then the name.
const leading = new RegExp(String.raw`^(?<amount>${quantity})\s*(?<unit>[\p{L}]+\.?)?\s+(?<rest>.+)$`, "u");
// "Mjölk 2 dl", "Ägg 12", "Smör (500 g)", "Mjölk x2", "Mjölk 2x".
const trailing = new RegExp(String.raw`^(?<rest>.+?)\s+\(?(?:[x×]\s*)?(?<amount>${quantity})\s*(?<unit>[\p{L}]+\.?)?\s*(?:[x×])?\)?$`, "u");

type Read = { name: string; amount: number | null; unit: Unit | null };

/** A written amount as a usable one: positive and below the database's limit. */
function usableAmount(text: string): number | null {
  const amount = parseQuantity(text.replace(/\s+/g, " "));
  return amount !== null && amount < maxCustomAmount ? amount : null;
}

/** The amount, unit and name of a line without its decoration; a line with no amount is only a name. */
function readLine(line: string): Read {
  const lead = leading.exec(line)?.groups;
  if (lead) {
    const amount = usableAmount(lead.amount);
    if (amount !== null) {
      const unit = normalizeUnit(lead.unit).unit;
      // "2 dl mjölk": a known unit. "3 bananer" and "2 mjölk": no unit, so a count; the word stays in the name.
      if (unit !== null) return { name: lead.rest, amount, unit };
      return { name: lead.unit ? `${lead.unit} ${lead.rest}` : lead.rest, amount, unit: "st" };
    }
  }
  const trail = trailing.exec(line)?.groups;
  if (trail) {
    const amount = usableAmount(trail.amount);
    if (amount !== null) {
      // "Ägg 12": a count. "Mjölk 2 l": a known unit. "Mjölk 3 gånger": not an amount.
      if (trail.unit === undefined) return { name: trail.rest, amount, unit: "st" };
      const unit = normalizeUnit(trail.unit).unit;
      if (unit !== null) return { name: trail.rest, amount, unit };
    }
  }
  return { name: line, amount: null, unit: null };
}


/** The line without its decoration, a name and an amount cleaned; `null` when nothing is left. */
function toItem(line: string): ListImportItem | null {
  let text = collapseLabel(line);
  for (let strips = 0; strips < 3; strips++) {
    const next = text.replace(decoration, "");
    if (next === text) break;
    text = collapseLabel(next);
  }
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  const { name, amount, unit } = readLine(text);
  const cleaned = capitalizeFirst([...collapseLabel(name).replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/gu, "")].slice(0, maxCustomLabelLength).join("").trim());
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;
  return { name: cleaned, amount, unit: amount === null ? null : unit };
}

/** Each name once (the same text in any case, labelKey), the first wins, at most maxImportItems. */
function distinct(items: readonly ListImportItem[]): ListImportItem[] {
  const seen = new Set<string>();
  const kept: ListImportItem[] = [];
  for (const item of items) {
    const key = labelKey(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
    if (kept.length === maxImportItems) break;
  }
  return kept;
}

/**
 * A pasted list as items, without AI: a line each, bullets, checkboxes and numbers taken off, empty lines
 * skipped, a leading or trailing amount with its unit read ("2 dl mjölk", "Ägg 12", "3 bananer"; a bare count is
 * "st"), each name capitalised and kept once.
 */
export function parseListText(text: string): ListImportItem[] {
  const items: ListImportItem[] = [];
  for (const line of text.slice(0, maxImportTextChars).split(/\r\n|[\n\r]/)) {
    const item = toItem(line);
    if (item) items.push(item);
  }
  return distinct(items);
}

/** What the AI port read from a photo (name, amount and unit as written), as items: an unknown unit drops the amount too. */
export function itemsFromAi(items: readonly { name: string; amount?: number | null; unit?: string | null }[]): ListImportItem[] {
  const result: ListImportItem[] = [];
  for (const entry of items) {
    const name = capitalizeFirst([...collapseLabel(entry.name)].slice(0, maxCustomLabelLength).join("").trim());
    if (!name) continue;
    const unit = normalizeUnit(entry.unit).unit;
    const amount = entry.amount ?? null;
    const usable = amount !== null && Number.isFinite(amount) && amount > 0 && amount < maxCustomAmount && unit !== null;
    result.push({ name, amount: usable ? amount : null, unit: usable ? unit : null });
  }
  return distinct(result);
}

/** A catalog ingredient a row is linked to. */
export type RowIngredient = { id: string; name: string };

/** A row of the review: the item, its catalog link, whether it is on the list already, and whether it is ticked. */
export type ReviewRow = ListImportItem & {
  id: string;
  ingredient: RowIngredient | null;
  /** On the shopping list already (the same name, or the same catalog ingredient): not ticked from the start. */
  exists: boolean;
  checked: boolean;
};

/** What the list has already: its lines' names (labelKey) and catalog ingredients. */
export type ExistingLines = { labelKeys: ReadonlySet<string>; ingredientIds: ReadonlySet<string> };

/** The names and catalog ingredients of the lines the list shows, for "Finns redan". */
export function existingLinesOf(lines: readonly { label: string; ingredientId?: string }[]): ExistingLines {
  return {
    labelKeys: new Set(lines.map((line) => labelKey(line.label))),
    ingredientIds: new Set(lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : []))),
  };
}

/**
 * The review's rows: `ingredients` is the catalog link of each item in order (`null` for none; short or missing
 * means none). A row whose name, or whose catalog ingredient's name, is a line of the list already, or whose
 * ingredient is, says "Finns redan" and starts unticked; every other row starts ticked.
 */
export function reviewRows(items: readonly ListImportItem[], ingredients: readonly (RowIngredient | null | undefined)[], existing: ExistingLines): ReviewRow[] {
  return items.map((item, index) => {
    const ingredient = ingredients[index] ?? null;
    const exists =
      existing.labelKeys.has(labelKey(item.name)) ||
      (ingredient !== null && (existing.ingredientIds.has(ingredient.id) || existing.labelKeys.has(labelKey(ingredient.name))));
    return { ...item, id: String(index), ingredient, exists, checked: !exists };
  });
}

/** The button: "Lägg till 3 varor", "Lägg till 1 vara". */
export function addRowsText(count: number): string {
  return `Lägg till ${count} ${count === 1 ? "vara" : "varor"}`;
}

/** The confirmation after the save: "Lade till 3 varor på inköpslistan." */
export function addedRowsText(count: number): string {
  return `Lade till ${count} ${count === 1 ? "vara" : "varor"} på inköpslistan.`;
}

/** What a row says under its name: its catalog name when that is another word ("Kaffe" for "kaffe"), else nothing. */
export function rowAmountText(row: Pick<ReviewRow, "amount" | "unit">): string {
  if (row.amount === null || row.unit === null) return "";
  return `${exactAmountText(row.amount)} ${row.unit}`;
}

/** What addCustomItem takes for a row, with the id the client made for it. */
export function rowToFormInput(row: ReviewRow, id: string): CustomItemFormInput {
  return {
    id,
    label: row.name,
    ingredientId: row.ingredient?.id ?? null,
    amount: row.amount === null ? "" : exactAmountText(row.amount),
    unit: row.unit ?? "",
  };
}
