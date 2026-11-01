"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { loadCardsWhereIn } from "../data/rooms";
import { maxLocatedCards, type CardWhere } from "../domain/thing-news";

// Where the cards of unseen readings are now (the Förråd overview's "1 nytt
// kort", and the jobs whose card is gone). Read with the session client, so
// RLS limits it to the user's own cards. No AI.

const idsSchema = z.array(z.uuid()).max(maxLocatedCards);

/** The cards of `ids` that are still there, with their boende and room. Fails with `unauthorized`, `validation` or `things_unavailable`. */
export async function locateThingCards(ids: string[]): Promise<Result<CardWhere[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return fail("validation");
  try {
    return ok(await loadCardsWhereIn(await createClient(), parsed.data));
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }
}
