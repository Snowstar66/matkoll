import { z } from "zod";
import { locationSchema, unitSchema } from "@/features/catalog";
import { maxPantryAmount } from "./pantry-item-form";

// addToPantry (AD-19, FR-19): what "Lägg i förrådet" adds to the pantry. An
// item increases the row with the same ingredient, location and unit, or
// creates it; without amount it makes the ingredient unlimited. Units are
// never converted (AD-12). Pure, so it is tested without a database.

/** The longest idempotency key (pantry_addition_key_check). */
export const maxAdditionKeyChars = 200;

/**
 * One item for addToPantry:
 * - `key`: the caller's idempotency key; an item whose key was added before
 *   is skipped (pantry_addition). The shopping list sends its check's id.
 * - `amount` and `unit`: what was bought, both set or both null (no amount:
 *   the ingredient becomes unlimited).
 * - `location`: where it goes; missing is the catalog ingredient's location.
 */
export const addToPantryItemSchema = z
  .object({
    key: z
      .string()
      .max(maxAdditionKeyChars)
      .refine((key) => key.trim() !== ""),
    ingredientId: z.uuid(),
    amount: z.number().positive().lt(maxPantryAmount).nullable(),
    unit: unitSchema.nullable(),
    location: locationSchema.optional(),
  })
  .refine((item) => (item.amount === null) === (item.unit === null), { path: ["unit"] });
export type AddToPantryItem = z.infer<typeof addToPantryItemSchema>;

/** What addToPantry takes: at least one item. */
export const addToPantryItemsSchema = z.array(addToPantryItemSchema).min(1);
