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
  // The meal plan shows the recipes' titles, images and status (Story 3.1);
  // the shopping list is counted from their lines (Story 3.3).
  recipe: [
    { path: "/recept", type: "layout" },
    { path: "/matsedel", type: "layout" },
    { path: "/lista", type: "page" },
  ],
  // The list of approved recipe sites in Inställningar (Story 14.7: layout level, since the start page's values and the pages beneath it show them). Import reads the sites
  // on every request, so it needs nothing here.
  recipe_site: [{ path: "/installningar", type: "layout" }],
  // The choice of AI in Inställningar (Story 17.5). Jobs read it on every run.
  ai_setting: [{ path: "/installningar", type: "layout" }],
  // The personal keys under "Siri och genvägar" in Inställningar (Story 17.9).
  api_key: [{ path: "/installningar", type: "layout" }],
  // The stores in Inställningar, and the shopping list, which shows the
  // selected store's product choices and exports to it (Stories 7.2, 7.3).
  // The weekly offers follow the selected store (Story 9.1, AD-25): the list
  // and the meal plan show them.
  store: [
    { path: "/installningar", type: "layout" },
    { path: "/lista", type: "page" },
    { path: "/matsedel", type: "layout" },
  ],
  // The selected store's weekly offers (Story 9.1, AD-25): the sheet in the
  // shopping list, and from 9.2–9.6 the labels in the list, the recipes and
  // the meal plan.
  store_offer: [
    { path: "/recept", type: "layout" },
    { path: "/lista", type: "page" },
    { path: "/matsedel", type: "layout" },
  ],
  // Hemma, and the cooking status in the library, every recipe view (Story
  // 2.4) and the meal plan's dishes (Story 3.1), and the shopping list, which
  // takes what is at home off (Story 3.3).
  pantry_item: [
    { path: "/hemma", type: "page" },
    { path: "/recept", type: "layout" },
    { path: "/matsedel", type: "layout" },
    { path: "/lista", type: "page" },
  ],
  // The places in the pantry (Story 8.2, AD-24): selecting another place
  // changes everything counted against the pantry, so the routes are those
  // of pantry_item: Hemma, the cooking status in the library and every recipe
  // view, the meal plan's dishes, and the shopping list, each with the line
  // "Lager" (Story 8.3).
  pantry_site: [
    { path: "/hemma", type: "page" },
    { path: "/recept", type: "layout" },
    { path: "/matsedel", type: "layout" },
    { path: "/lista", type: "page" },
    // Story 14.7: Boenden under Inställningar, and the start page's value for them.
    { path: "/installningar", type: "layout" },
  ],
  // The latest photo of each place (Epic 10, AD-26); only Hemma shows it.
  pantry_photo: [{ path: "/hemma", type: "page" }],
  // Prylar (Epic 18): the tab's list of places and every place page below it.
  // Things never reach the pantry, the lists or the recipes.
  thing_place: [{ path: "/prylar", type: "layout" }],
  thing_photo: [{ path: "/prylar", type: "layout" }],
  thing_item: [{ path: "/prylar", type: "layout" }],
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
  // The checks on the shopping list (Story 3.4); only the list shows them.
  shopping_check: [{ path: "/lista", type: "page" }],
  // Pontus's own items on the shopping list (Story 3.5); only the list shows them.
  shopping_custom_item: [{ path: "/lista", type: "page" }],
  // Corrected amounts and hidden lines on the shopping list (Story 3.6); only the list shows them.
  shopping_line_override: [{ path: "/lista", type: "page" }],
  // Product choices per catalog ingredient and store (Story 7.2); the list's
  // detail shows them, and the export (Story 7.3) reads them from the list.
  product_choice: [{ path: "/lista", type: "page" }],
} satisfies Partial<Record<TableName, readonly Route[]>>;

export type RevalidatedTable = keyof typeof routesByTable;

/** Revalidates every route that shows `table`. Only in Server Actions and Route Handlers. */
export function revalidateFor(table: RevalidatedTable): void {
  for (const { path, type } of routesByTable[table]) revalidatePath(path, type);
}
