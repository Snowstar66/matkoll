"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { loadThingDetailIn } from "../data/thing-detail";
import type { ThingDetail } from "../domain/thing-detail";

const idSchema = z.uuid();

/**
 * The card photo, the box on it and the place of one föremål, read when its
 * sheet opens. Only the user's own (RLS); a föremål that is gone fails with
 * `things_item_gone`. Logs only the reason.
 */
export async function loadThingDetail(id: string): Promise<Result<ThingDetail>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    const detail = await loadThingDetailIn(await createClient(), parsed.data);
    return detail ? ok(detail) : fail("things_item_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }
}
