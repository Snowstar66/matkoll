import { z } from "zod";
import { maxCustomLabelLength } from "./custom-item";

// Own items that another part of the app adds from something it owns, such
// as a weekly offer (Story 9.12). The caller names each item with a `key`
// (the offer's id); the item's id is derived from the key, so adding the same
// thing twice is one item (AD-20). Pure.

/** At most this many items in one call. */
export const maxKeyedItems = 100;

export const keyedItemsSchema = z.object({
  // Not used any more (own items have no week, Story 17.10); callers that still send it are accepted.
  planId: z.uuid().nullish(),
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        label: z.string().refine((label) => label.trim() !== "" && [...label].length <= maxCustomLabelLength),
        ingredientId: z.uuid().nullable(),
      }),
    )
    .min(1)
    .max(maxKeyedItems),
});
export type KeyedItemsInput = z.input<typeof keyedItemsSchema>;
