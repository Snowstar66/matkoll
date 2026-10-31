import { z } from "zod";
import { lineKeySchema } from "./line-key";

// A check on the shopping list (Story 3.4, FR-16): a line of the current
// meal plan's list, by its key, checked off or not.

/**
 * What setChecked takes: the plan the list was counted for, the line's key and
 * the new state. An own item's key (`c:`) needs no plan, since its check
 * belongs to the user (Story 17.10): `planId` is null in a week without one;
 * any other key needs it.
 */
export const checkChangeSchema = z
  .object({ planId: z.uuid().nullable(), key: lineKeySchema, checked: z.boolean() })
  .refine((change) => change.planId !== null || change.key.startsWith("c:"), { path: ["planId"] });
export type CheckChange = z.infer<typeof checkChangeSchema>;
