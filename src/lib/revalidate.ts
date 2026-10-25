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
  recipe: [{ path: "/recept", type: "layout" }],
  // The list of approved recipe sites in Inställningar. Import reads the sites
  // on every request, so it needs nothing here.
  recipe_site: [{ path: "/installningar", type: "page" }],
} satisfies Partial<Record<TableName, readonly Route[]>>;

export type RevalidatedTable = keyof typeof routesByTable;

/** Revalidates every route that shows `table`. Only in Server Actions and Route Handlers. */
export function revalidateFor(table: RevalidatedTable): void {
  for (const { path, type } of routesByTable[table]) revalidatePath(path, type);
}
