import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Household, Me } from "../domain/member";
import { othersOf, type Others } from "../domain/who";
import { HouseholdDataError, HouseholdRefusal, type InvitePreview, loadHouseholdIn, loadMeIn, loadMembersIn, previewInviteIn } from "./household";

/** The caller's household with its members and open invitations. Throws HouseholdDataError. Memoised per request. */
export const getHousehold = cache(async (): Promise<Household> => loadHouseholdIn(await createClient()));

/**
 * The signed-in person as a member (name, colour, whether they have said their
 * name), or null without a session or when it cannot be read (logged by
 * reason only). Memoised per request.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  try {
    return await loadMeIn(await createClient());
  } catch (error) {
    if (!(error instanceof HouseholdDataError)) throw error;
    console.error("household_unavailable", { reason: error.detail });
    return null;
  }
});

/**
 * The other members of the caller's household by user id, with name and shade,
 * for marking what someone else did (Story 21.3). Empty when they cannot be
 * read (logged by reason only): nothing is marked then. Memoised per request.
 */
export const getOthers = cache(async (): Promise<Others> => {
  try {
    return othersOf(await loadMembersIn(await createClient()));
  } catch (error) {
    if (!(error instanceof HouseholdDataError) && !(error instanceof HouseholdRefusal)) throw error;
    console.error("household_unavailable", { reason: error instanceof HouseholdDataError ? error.detail : error.code });
    return new Map();
  }
});

/** What /ga-med shows of the invitation `code`. Throws HouseholdDataError. */
export async function previewInvite(code: string): Promise<InvitePreview> {
  return previewInviteIn(await createClient(), code);
}
