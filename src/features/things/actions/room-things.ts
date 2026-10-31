"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { loadRoomThingsIn } from "../data/rooms";
import { thingCategories, type Thing } from "../domain/thing";

const inputSchema = z.object({ siteId: z.uuid(), roomKey: z.string().min(1).max(200), category: z.enum(thingCategories) });

/**
 * The things of one category of a room (Story 18.12), read when the category
 * is opened, so the room page never loads every thing. Only the user's own
 * (RLS). Logs only the reason.
 */
export async function loadRoomCategoryThings(input: z.input<typeof inputSchema>): Promise<Result<Thing[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    return ok(await loadRoomThingsIn(await createClient(), parsed.data.siteId, parsed.data.roomKey, parsed.data.category));
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }
}
