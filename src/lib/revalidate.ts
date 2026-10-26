import "server-only";
import { revalidatePath } from "next/cache";
import type { Database } from "./supabase/database.types";

// After a write, an action calls revalidateFor(table) and never revalidatePath
// directly (AD-18). The map lists every route that shows the table, or
// something derived from it; later epics add their tables and routes.

type TableName = keyof Database["public"]["Tables"];
type Route = { path: string; type: "page" | "layout" };

const routesByTable = {
  // Layout level: the library and every recipe view below it (/recept/[id]).
  // The meal plan shows the recipes' titles, images and status (Story 3.1).
  recipe: [
    { path: "/recept", type: "layout" },
    { path: "/matsedel", type: "layout" },
  ],
  // The list of approved recipe sites in Inställningar. Import reads the sites
  // on every request, so it needs nothing here.
  recipe_site: [{ path: "/installningar", type: "page" }],
  // Hemma, and the cooking status in the library, every recipe view (Story
  // 2.4) and the meal plan's dishes (Story 3.1). /lista joins when it shows
  // the pantry (Story 3.3).
  pantry_item: [
    { path: "/hemma", type: "page" },
    { path: "/recept", type: "layout" },
    { path: "/matsedel", type: "layout" },
  ],
  // The meal plan, the shopping list counted from it, and the recipes, which
  // may show what is on the plan (AD-18). Both tables, so either can be named.
  meal_plan: [
    { path: "/matsedel", type: "layout" },
    { path: "/lista", type: "page" },
    { path: "/recept", type: "layout" },
  ],
  meal_plan_recipe: [
    { path: "/matsedel", type: "layout" },
    { path: "/lista", type: "page" },
    { path: "/recept", type: "layout" },
  ],
} satisfies Partial<Record<TableName, readonly Route[]>>;

export type RevalidatedTable = keyof typeof routesByTable;

/** Revalidates every route that shows `table`. Only in Server Actions and Route Handlers. */
export function revalidateFor(table: RevalidatedTable): void {
  for (const { path, type } of routesByTable[table]) revalidatePath(path, type);
}
