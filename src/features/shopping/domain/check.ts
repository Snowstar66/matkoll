import { z } from "zod";
import { lineKeySchema } from "./line-key";

// A check on the shopping list (Story 3.4, FR-16): a line of the current
// meal plan's list, by its key, checked off or not.

/** What setChecked takes: the plan the list was counted for, the line's key and the new state. */
export const checkChangeSchema = z.object({ planId: z.uuid(), key: lineKeySchema, checked: z.boolean() });
export type CheckChange = z.infer<typeof checkChangeSchema>;
