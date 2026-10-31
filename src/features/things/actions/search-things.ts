"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { searchThingsIn } from "../data/search";
import { maxHits, searchTerms, type ThingHit } from "../domain/thing-search";

// The search field of Förråd (Story 18.4, since Story 18.14 in the database):
// the things whose name holds a word of the text or is close to it, best
// first. No AI. The text is limited to 80 characters, as the field is.

export type SearchAnswer = { hits: ThingHit[] };

/** The things matching `query`. Fails with `unauthorized` or `things_unavailable`. An empty text finds nothing. */
export async function searchThingsAction(query: string): Promise<Result<SearchAnswer>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (typeof query !== "string") return fail("validation");
  const terms = searchTerms(query.slice(0, 80));
  try {
    return ok({ hits: await searchThingsIn(await createClient(), terms, maxHits) });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }
}
