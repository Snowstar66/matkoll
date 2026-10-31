"use server";

import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { replaceBoxThingsIn } from "../data/written";
import type { ThingCategory } from "../domain/thing";
import { parseWrittenThings, writtenInputSchema, writtenToText, type WrittenThing } from "../domain/thing-written";

// "Skriv vad som finns" (Story 18.13, FR-24, AD-9): the text of a box becomes
// its written things. One cheap text call (no image) gives each a category,
// answered in the request itself (a Server Action): a few hundred characters
// in, a word per thing out, and Pontus is waiting for it. The AI choice of
// Inställningar applies and the call is counted like any other (Story 17.6).
// When the AI does not answer the things are still saved, under "Övrigt".
// Only counts and codes are logged, never a name.

/** The time the model gets: well within the page's maxDuration of 60 s. */
const categorizeDeadlineMs = 25_000;

/** What was saved: how many things, whether the AI sorted them, and the text as it is stored (one thing a line, to show in the field). */
export type SavedBoxThings = { count: number; categorized: boolean; text: string };

/**
 * Saves `text` as the written things of the box `placeId`, replacing the ones
 * written before (the box's cards are not touched). An empty text empties the
 * written things. Fails with `unauthorized`, `validation` (the text in
 * `fields.text`), `things_place_gone` or `things_place_failed`.
 */
export async function saveBoxThings(input: { placeId: string; text: string }): Promise<Result<SavedBoxThings>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = writtenInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const names = parseWrittenThings(parsed.data.text);
  if ("error" in names) return fail("validation", { text: names.error });

  let categories: ThingCategory[] = names.names.map(() => "Övrigt");
  let categorized = true;
  if (names.names.length > 0) {
    const answered = await (await getAiServiceForUser()).categorizeThings({ names: names.names }, AbortSignal.timeout(categorizeDeadlineMs + 5_000), {
      deadline: Date.now() + categorizeDeadlineMs,
    });
    if (answered.ok) categories = answered.data.categories;
    else {
      // The things are saved anyway; the code only, never a name.
      categorized = false;
      console.error("things_categorize_failed", { code: answered.error.code });
    }
  }
  const things: WrittenThing[] = names.names.map((name, index) => ({ name, category: categories[index] ?? "Övrigt" }));

  try {
    const saved = await replaceBoxThingsIn(await createClient(), parsed.data.placeId, things);
    if (saved.kind === "gone") return fail("things_place_gone");
    revalidateFor("thing_item");
    console.info("things_written", { things: saved.count, categorized });
    return ok({ count: saved.count, categorized, text: writtenToText(names.names) });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_place_failed", { reason: error.detail });
    return fail("things_place_failed");
  }
}
