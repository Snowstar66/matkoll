import "server-only";
import { z } from "zod";
import { type ProductChoice, type ProductChoiceForm, productChoiceSchema } from "../domain/product-choice";
import { ShoppingDataError, type ShoppingDb } from "./client";

// Pontus's product choices (Story 7.2, FR-27): rows of product_choice, which
// only this module reads and writes (AD-1). One per catalog ingredient and
// store. The functions take the user's session client, so RLS limits them to
// the user's own rows. Saving goes through save_product_choice, which writes
// under a per-user lock and only when the stored choice is the one the sheet
// opened with. Never logs a product's name or link.

const idSchema = z.guid();

type DbRow = {
  id: string;
  ingredient_id: string;
  store_id: string;
  product_name: string;
  package_size: string | null;
  url: string | null;
  updated_at: string;
};

const columns = "id, ingredient_id, store_id, product_name, package_size, url, updated_at";

/** save_product_choice's code for a stored choice that is not the expected one. */
const changedCode = "MK409";

/** A row as the domain's ProductChoice, or `null` when the domain cannot read it. */
function toChoice(row: DbRow): ProductChoice | null {
  const parsed = productChoiceSchema.safeParse({
    id: row.id,
    ingredientId: row.ingredient_id,
    storeId: row.store_id,
    productName: row.product_name,
    packageSize: row.package_size,
    url: row.url,
    updatedAt: row.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * A store's product choices: `choices` by catalog ingredient id, and
 * `unreadable`, the ingredients whose row the domain cannot read (logged).
 * Those are never hidden as "no choice": the detail says the choice cannot be
 * read, and nothing is saved over it from the list.
 */
export type StoreProductChoices = { choices: Record<string, ProductChoice>; unreadable: string[] };

/** The store's product choices, for the list's detail and the export. Throws ShoppingDataError. */
export async function listProductChoicesIn(db: ShoppingDb, storeId: string): Promise<StoreProductChoices> {
  if (!idSchema.safeParse(storeId).success) throw new ShoppingDataError("invalid_id");
  const { data, error } = await db.from("product_choice").select(columns).eq("store_id", storeId);
  if (error) throw new ShoppingDataError(`list_product_choices_failed ${error.code}`, error.code);
  const choices: Record<string, ProductChoice> = {};
  const unreadable: string[] = [];
  for (const row of data) {
    const choice = toChoice(row);
    if (choice) {
      choices[choice.ingredientId] = choice;
    } else {
      console.error("shopping_product_choice_unreadable", { reason: "invalid_row" });
      unreadable.push(row.ingredient_id);
    }
  }
  return { choices, unreadable };
}

/**
 * What saving a choice did: `saved` it (`choice` is `null` when the written
 * row cannot be read back, which is logged: it is saved all the same), found
 * another choice stored than the expected one (`changed`; nothing written),
 * or found the ingredient or the store gone or not the user's
 * (`target_gone`, 23503; nothing written).
 */
export type SaveProductChoiceOutcome = { kind: "saved"; choice: ProductChoice | null } | { kind: "changed" } | { kind: "target_gone" };

/**
 * saveProductChoice: adds the choice for the form's ingredient and store, or
 * changes the stored one keeping its id, when the stored choice is
 * `form.expected` (save_product_choice). The same fields again return the
 * stored choice without writing, so a double tap or a retry after a lost
 * answer gives one row. Throws ShoppingDataError otherwise.
 */
export async function upsertProductChoiceIn(db: ShoppingDb, form: ProductChoiceForm): Promise<SaveProductChoiceOutcome> {
  const { data, error } = await db.rpc("save_product_choice", {
    choice: {
      ingredient_id: form.ingredientId,
      store_id: form.storeId,
      product_name: form.productName,
      package_size: form.packageSize,
      url: form.url,
    },
    // Both null for no expected choice; the generated types know no nulls for arguments.
    expected_id: (form.expected?.id ?? null) as string,
    expected_updated_at: (form.expected?.updatedAt ?? null) as string,
  });
  if (error) {
    if (error.code === "23503") return { kind: "target_gone" };
    // 23505: an "Ångra" put a choice back meanwhile.
    if (error.code === changedCode || error.code === "23505") return { kind: "changed" };
    throw new ShoppingDataError(`save_product_choice_failed ${error.code}`, error.code);
  }
  const choice = toChoice(data);
  if (!choice) console.error("shopping_product_choice_unreadable", { reason: "saved_row" });
  return { kind: "saved", choice };
}

/**
 * removeProductChoice: deletes the choice for good and returns it as it was,
 * for "Ångra" (`row` is `null` when the deleted row cannot be read back,
 * which is logged: it is removed all the same, but cannot be put back). Null
 * when the user has no choice with the id (removed already, or another
 * user's). Throws ShoppingDataError: `invalid_id` before anything is
 * deleted, `remove_product_choice_failed <code>` when Postgres refuses.
 */
export async function removeProductChoiceIn(db: ShoppingDb, id: string): Promise<{ row: ProductChoice | null } | null> {
  if (!idSchema.safeParse(id).success) throw new ShoppingDataError("invalid_id");
  const { data, error } = await db.from("product_choice").delete().eq("id", id).select(columns);
  if (error) throw new ShoppingDataError(`remove_product_choice_failed ${error.code}`, error.code);
  const [row] = data;
  if (!row) return null;
  const choice = toChoice(row);
  if (!choice) console.error("shopping_product_choice_unreadable", { reason: "removed_row" });
  return { row: choice };
}

/**
 * restoreProductChoice, "Ångra" after "Ta bort produktval" (AD-20): puts the
 * row back with the same id and the same fields. When the user has the row
 * already ("Ångra" twice), it is returned and nothing is written.
 * `conflict`, with nothing written, when another choice for the ingredient
 * and store has been saved meanwhile (it stays), or the id is another
 * user's; `invalid_reference` when the ingredient or the store is gone or not
 * the user's (23503). The row's user_id is the session's (its default,
 * auth.uid()). Throws ShoppingDataError otherwise.
 */
export async function restoreProductChoiceIn(
  db: ShoppingDb,
  row: ProductChoice,
): Promise<ProductChoice | "conflict" | "invalid_reference"> {
  const { data, error } = await db
    .from("product_choice")
    .insert({
      id: row.id,
      ingredient_id: row.ingredientId,
      store_id: row.storeId,
      product_name: row.productName,
      package_size: row.packageSize,
      url: row.url,
    })
    .select(columns)
    .single();
  if (!error) return toChoice(data) ?? row;
  if (error.code === "23503") return "invalid_reference";
  if (error.code !== "23505") throw new ShoppingDataError(`restore_product_choice_failed ${error.code}`, error.code);
  // The row itself when "Ångra" ran twice; else another choice for the
  // ingredient and store, saved meanwhile, which stays, or another user's id.
  return (await sameRow(db, row)) ?? "conflict";
}

/** The user's row with `row.id`, when it is the same choice (ingredient, store and fields). */
async function sameRow(db: ShoppingDb, row: ProductChoice): Promise<ProductChoice | null> {
  const { data, error } = await db.from("product_choice").select(columns).eq("id", row.id).maybeSingle();
  if (error) throw new ShoppingDataError(`restore_product_choice_failed ${error.code}`, error.code);
  const stored = data ? toChoice(data) : null;
  if (!stored) return null;
  const same =
    stored.ingredientId === row.ingredientId &&
    stored.storeId === row.storeId &&
    stored.productName === row.productName &&
    stored.packageSize === row.packageSize &&
    stored.url === row.url;
  return same ? stored : null;
}
