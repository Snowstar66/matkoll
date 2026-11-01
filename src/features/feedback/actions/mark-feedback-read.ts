"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { FeedbackDataError } from "../data/client";
import { markFeedbackReadIn } from "../data/feedback";

const idSchema = z.uuid();

/**
 * The owner opened a message in Inkorg (Story 20.3): it is marked read. RLS lets
 * only the owner change a row, and only its read_at, so for anyone else this
 * changes nothing. Fails with `unauthorized`, `validation` or `feedback_mark_failed`.
 */
export async function markFeedbackRead(id: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");

  try {
    await markFeedbackReadIn(await createClient(), parsed.data);
    revalidateFor("feedback");
    return ok();
  } catch (error) {
    if (!(error instanceof FeedbackDataError)) throw error;
    console.error("feedback_mark_failed", { reason: error.detail });
    return fail("feedback_mark_failed");
  }
}
