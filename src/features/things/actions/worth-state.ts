"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { setCardTitleIn } from "../data/card-text";
import { setWorthByUserIn } from "../data/worth";
import { cardTitleSchema, tooLongCardTitleText, emptyCardTitleText } from "../domain/thing-card-title";
import type { WorthState } from "../domain/thing-worth";

// The user's own choices, which go before the AI's (Värdetips): the star of a föremål (on or off, also an AI tip's) and the
// name of a card. Both are rows of the household (RLS), written with the user's session; a föremål or card that is gone
// answers `things_item_gone` / `things_card_gone`. Only reasons are logged.

const starSchema = z.object({ id: z.uuid(), starred: z.boolean() });

/** "Kan ha värde" switched in the sheet: the star of föremål `id` on or off. Fails with `validation`, `things_item_gone` or `things_item_failed`. */
export async function setThingWorth(input: { id: string; starred: boolean }): Promise<Result<{ state: WorthState }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = starSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    const state = await setWorthByUserIn(await createClient(), parsed.data.id, parsed.data.starred);
    revalidateFor("thing_item");
    return state ? ok({ state }) : fail("things_item_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_item_failed", { reason: error.detail });
    return fail("things_item_failed");
  }
}

/** "Byt namn" on a card: the user's own name for it. Fails with `validation` (the text in `fields.name`), `things_card_gone` or `things_rename_failed`. */
export async function renameThingCard(input: { id: string; name: string }): Promise<Result<{ name: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!z.uuid().safeParse(input.id).success) return fail("validation");
  const name = cardTitleSchema.safeParse(input.name);
  if (!name.success) return fail("validation", { name: name.error.issues[0]?.message === "too long" ? tooLongCardTitleText : emptyCardTitleText });
  try {
    const renamed = await setCardTitleIn(await createClient(), input.id, name.data);
    revalidateFor("thing_photo");
    return renamed ? ok({ name: name.data }) : fail("things_card_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_rename_failed", { reason: error.detail });
    return fail("things_rename_failed");
  }
}
