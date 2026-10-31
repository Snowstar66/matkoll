"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { addCardThingsIn } from "../data/written";
import { addThingsFullText, emptyAddedText, maxWrittenTextChars, parseWrittenThings, type WrittenThing } from "../domain/thing-written";
import { categorizeNames } from "./categorize-names";

// "Lägg till pryl" on a card (Story 18.15): what the AI missed, typed like
// "Skriv vad som finns" (Story 18.13), becomes things tied to THIS card, each
// with a category from one cheap text call (Övrigt when the AI does not answer).
// They show like the others and go with the card (a retaken card replaces them).
// Only counts and codes are logged, never a name.

const inputSchema = z.object({ cardId: z.uuid(), text: z.string().max(maxWrittenTextChars * 2) });

/** What was added: how many things, and whether the AI sorted them. */
export type AddedCardThings = { count: number; categorized: boolean };

/**
 * Adds the things of `text` to the finished card `cardId`. Fails with
 * `unauthorized`, `validation` (the text in `fields.text`), `things_card_gone`
 * or `things_item_failed`.
 */
export async function addCardThings(input: { cardId: string; text: string }): Promise<Result<AddedCardThings>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const names = parseWrittenThings(parsed.data.text);
  if ("error" in names) return fail("validation", { text: names.error });
  if (names.names.length === 0) return fail("validation", { text: emptyAddedText });

  // The AI call comes after the checks that cost nothing; the database checks the card (RLS and the function).
  const { categories, categorized } = await categorizeNames(names.names);
  const things: WrittenThing[] = names.names.map((name, index) => ({ name, category: categories[index] ?? "Övrigt" }));
  try {
    const added = await addCardThingsIn(await createClient(), parsed.data.cardId, things);
    if (added.kind === "gone") return fail("things_card_gone");
    if (added.kind === "full") return fail("validation", { text: addThingsFullText });
    revalidateFor("thing_item");
    console.info("things_added", { things: added.count, categorized });
    return ok({ count: added.count, categorized });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_item_failed", { reason: error.detail });
    return fail("things_item_failed");
  }
}
