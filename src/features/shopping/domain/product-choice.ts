import { z } from "zod";
import { nameInSentence } from "@/features/catalog";
import type { Store } from "@/features/settings";
import { charLength, normalizeHttpsUrl, oneLine } from "@/lib/one-line";
import type { ShoppingLine } from "./compute-list";
import { parseLineKey } from "./line-key";

// Produktval (FR-27, Story 7.2): which product Pontus buys for a catalog
// ingredient in one store, e.g. "Arla Matlagningsgrädde 15 %" in "5 dl".
// A choice belongs to the ingredient, not to a list line: two lines of the
// same ingredient in different units show the same choice. It is kept beside
// the list, never in ShoppingLine, a list key or the overlay (AD-8), so the
// list is never counted again when a choice changes, and the export (7.3)
// gets the store and its choices as arguments. One schema for the sheet and
// saveProductChoice (AD-12). Pure, so it is tested without a database. The
// table's checks (supabase/migrations/*_shopping_product_choice.sql) follow
// the same rules.

/** A product choice as the list's detail and the export (7.3) read it. */
export type ProductChoice = {
  id: string;
  /** The catalog ingredient the choice is for. */
  ingredientId: string;
  /** The store the choice is for. */
  storeId: string;
  productName: string;
  /** Free text such as "5 dl" or "2-pack"; never read as an amount (AD-7). `null` when not given. */
  packageSize: string | null;
  /** Text Pontus typed, https only; shown as a link and never fetched. `null` when not given. */
  url: string | null;
  /** When the choice was last saved, as Postgres gives it; the sheet sends it back so a stale save is refused. */
  updatedAt: string;
};

/**
 * The choice the sheet opened with, which a save expects to find stored:
 * its id and updated_at, or `null` for none. Another stored choice means
 * another tab saved, changed or removed one meanwhile, and nothing is written.
 */
export type ExpectedProductChoice = { id: string; updatedAt: string } | null;

/**
 * What getShoppingList gives beside the list (Story 7.2): the selected store
 * and its product choices by catalog ingredient id. `storeUnavailable` when
 * the store could not be read, `productChoicesUnavailable` when its choices
 * could not; the list works all the same. `unreadableChoices` are the catalog
 * ingredients whose stored choice the domain cannot read: their section says
 * so, and nothing is saved over it from the list.
 */
export type ProductChoiceContext = {
  store: Store | null;
  storeUnavailable: boolean;
  productChoices: Readonly<Record<string, ProductChoice>>;
  productChoicesUnavailable: boolean;
  unreadableChoices: readonly string[];
};

/** Longest values, in characters (code points), as the table's checks count them (char_length). */
export const maxProductNameLength = 200;
export const maxPackageSizeLength = 40;
export const maxProductUrlLength = 2048;

export const productNameRequiredMessage = "Ange produktens namn.";
export const productUrlMessage = "Ange en adress som börjar med https://.";
export function tooLongMessage(max: number): string {
  return `Texten får vara högst ${max} tecken.`;
}

/** The section's heading in Listpostdetalj, and the sheet's name. */
export const productChoiceHeading = "Produktval";
/** The detail when the store has no choice for the ingredient: "Inget produktval i Maxi ICA Stormarknad Östersund." */
export function noProductChoiceText(storeName: string): string {
  return `Inget produktval i ${storeName}.`;
}
/** An own item without a catalog ingredient: a choice needs one (AD-6). */
export const unlinkedCustomItemText = "Koppla varan till en ingrediens för att spara ett produktval.";
/** No store is selected: nothing to save a choice for. */
export const noStoreText = "Välj en butik i inställningarna för att spara produktval.";
/** The link under noStoreText. */
export const openSettingsText = "Öppna inställningar";
/** The link to the product's page; opens in a new tab. */
export const openProductText = "Öppna produkten";
/** Read out after the product's name in the link, which opens in a new tab. */
export const newTabText = " (öppnas i en ny flik)";
/** The section when the stored choice for the ingredient cannot be read; nothing is saved over it. */
export const unreadableProductChoiceText = "Det gick inte att läsa produktvalet.";
/** Under the button in an own item's detail while its form has unsaved changes. */
export const saveItemFirstText = "Spara varan först.";
/** After "Ta bort produktval" when the choice was gone already (removed elsewhere). */
export const productChoiceGoneText = "Produktvalet fanns inte längre.";
export const addProductChoiceText = "Ange produktval";
export const changeProductChoiceText = "Ändra produktval";
export const removeProductChoiceText = "Ta bort produktval";
/** The short confirmation after "Spara" in the sheet. */
export const productChoiceSavedText = "Produktvalet är sparat.";
/** The short confirmation after "Ta bort produktval", with "Ångra". */
export const productChoiceRemovedText = "Tog bort produktvalet.";
/** The placeholder under Förpackning. */
export const packageSizePlaceholder = "t.ex. 5 dl";

/**
 * "Produktval för grädde": the sheet's title, with the line's catalog name
 * as it runs in a sentence (catalog.nameInSentence): its first letter in
 * lower case, but not for a word of its own like "ICA-kaffe", "OLW-chips"
 * or "D-vitamin".
 */
export function productChoiceTitle(label: string): string {
  return `Produktval för ${nameInSentence(label)}`;
}

/** "Arla Matlagningsgrädde 15 % · 5 dl", or the name alone without a package size. */
export function productChoiceText(choice: Pick<ProductChoice, "productName" | "packageSize">): string {
  return choice.packageSize ? `${choice.productName} · ${choice.packageSize}` : choice.productName;
}

/**
 * Whether a line can have a product choice: a recipe line with a catalog
 * ingredient (`r:<id>:<unit>`, and a vague `r:<id>:-`), or an own item saved
 * with a link to one (`c:` with `ingredientId`). A recipe line without an
 * ingredient (`t:`) cannot, and neither can an own item without a link.
 */
export function canHaveProductChoice(line: Pick<ShoppingLine, "key" | "ingredientId">): boolean {
  const parsed = parseLineKey(line.key);
  if (!parsed || parsed.kind === "text") return false;
  return typeof line.ingredientId === "string" && line.ingredientId !== "";
}

type Field = "productName" | "packageSize" | "url";
type Issue = (field: Field, message: string) => void;

/** The fields as stored: one-line texts, empty optional fields as `null`; reports what is refused. */
function checkFields(
  form: { productName: string; packageSize: string; url: string },
  issue: Issue,
): { productName: string; packageSize: string | null; url: string | null } {
  const productName = oneLine(form.productName);
  if (!productName) issue("productName", productNameRequiredMessage);
  else if (charLength(productName) > maxProductNameLength) issue("productName", tooLongMessage(maxProductNameLength));
  const packageSize = oneLine(form.packageSize);
  if (charLength(packageSize) > maxPackageSizeLength) issue("packageSize", tooLongMessage(maxPackageSizeLength));
  const typedUrl = form.url.trim();
  const url = typedUrl ? normalizeHttpsUrl(typedUrl) : null;
  if (typedUrl && url === null) issue("url", productUrlMessage);
  else if (url !== null && charLength(url) > maxProductUrlLength) issue("url", tooLongMessage(maxProductUrlLength));
  return { productName, packageSize: packageSize || null, url };
}

/** What the sheet sends and saveProductChoice takes: the ids, the fields as typed and the expected choice. */
export type ProductChoiceFormInput = {
  ingredientId: string;
  /** The store whose name the sheet showed, as the list was read. */
  storeId: string;
  productName: string;
  packageSize: string;
  url: string;
  /** The choice the sheet opened with, or `null` for none. */
  expected: ExpectedProductChoice;
};

/**
 * A product choice as Pontus fills it in. The product is trimmed to one line
 * with single spaces, 1–200 characters; the package size at most 40; the
 * link must start with https:// and have a host. Empty optional fields
 * become `null`. No id: a choice is one per ingredient and store, and the
 * save writes it only when the stored choice is the expected one.
 */
export const productChoiceFormSchema = z
  .object({
    ingredientId: z.guid(),
    storeId: z.guid(),
    productName: z.string(),
    packageSize: z.string(),
    url: z.string(),
    expected: z.object({ id: z.guid(), updatedAt: z.string().min(1).max(64) }).nullable(),
  })
  .transform((form, context) => {
    let valid = true;
    const fields = checkFields(form, (field, message) => {
      valid = false;
      context.addIssue({ code: "custom", path: [field], message });
    });
    if (!valid) return z.NEVER;
    return { ingredientId: form.ingredientId, storeId: form.storeId, ...fields, expected: form.expected };
  });
export type ProductChoiceForm = z.output<typeof productChoiceFormSchema>;

/**
 * A product choice as stored: what removeProductChoice returns and
 * restoreProductChoice puts back with the same id (AD-20), checked with the
 * form's rules.
 */
export const productChoiceSchema = z
  .object({
    id: z.guid(),
    ingredientId: z.guid(),
    storeId: z.guid(),
    productName: z.string(),
    packageSize: z.string().nullable(),
    url: z.string().nullable(),
    updatedAt: z.string().min(1).max(64),
  })
  .transform((row, context): ProductChoice => {
    let valid = true;
    const fields = checkFields({ ...row, packageSize: row.packageSize ?? "", url: row.url ?? "" }, (field, message) => {
      valid = false;
      context.addIssue({ code: "custom", path: [field], message });
    });
    if (!valid) return z.NEVER;
    return { id: row.id, ingredientId: row.ingredientId, storeId: row.storeId, ...fields, updatedAt: row.updatedAt };
  });

/**
 * The form's own messages by field name (`productName`, `packageSize`,
 * `url`), the first per field, for `fail("validation", fields)` and the
 * sheet. Zod's built-in messages are English and never shown, so only custom
 * issues count: an id that is not one gives none.
 */
export function productChoiceFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (issue.code === "custom" && field && !(field in fields)) fields[field] = issue.message;
  }
  return fields;
}
