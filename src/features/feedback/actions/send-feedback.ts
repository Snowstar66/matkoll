"use server";

import { version } from "../../../../package.json";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { FeedbackDataError } from "../data/client";
import { insertFeedbackIn } from "../data/feedback";
import { type FeedbackInput, feedbackInputSchema } from "../domain/feedback";

/**
 * Skicka in a Tyck till sheet (Story 20.3): an idea, a problem or a rating, as the
 * signed-in user. The app version is the server's own; the page is the one the
 * sheet was opened from. Never asked for by the app itself (Beslut 3). Fails with
 * `unauthorized`, `validation`, `feedback_rate_limited` (more than 10 an hour or 30
 * a day, kept by the database) or `feedback_send_failed`.
 */
export async function sendFeedback(input: FeedbackInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  try {
    const outcome = await insertFeedbackIn(await createClient(), parsed.data, version);
    if (outcome === "limited") return fail("feedback_rate_limited");
    revalidateFor("feedback");
    return ok();
  } catch (error) {
    if (!(error instanceof FeedbackDataError)) throw error;
    console.error("feedback_send_failed", { reason: error.detail });
    return fail("feedback_send_failed");
  }
}
