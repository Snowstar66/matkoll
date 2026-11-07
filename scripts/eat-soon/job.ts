// The daily "Ät snart" job: for every household where someone has a device with notifications on, the app is asked
// (POST /api/eat-soon/notify, as a member of the household, under RLS) to tell the household about the food that is
// due today or overdue. Pure but for its dependencies, so tests/scripts/eat-soon-job.test.ts covers it. This file
// chooses the households and keeps the counts; what is due and who is told is the app's. The log holds counts and
// codes only, never a name, an address or a food.

import { signerOf, type HouseholdMemberRow } from "../fetch-offers/plan.ts";
import type { Db } from "../fetch-offers/job.ts";

/** A household to ask, and the member to act as (signerOf: the owner, else the longest-standing member). */
export type EatSoonTarget = { householdId: string; userId: string };

/** A member's session for one request, and how to end it again (throws when it could not). */
export type EatSoonSession = { accessToken: string; refreshToken: string; signOut: () => Promise<void> };

/** What the app answers for a household: the outcome and counts. */
export type EatSoonAnswer = { outcome: string; due: number; sent: number };

export type EatSoonDeps = {
  listTargets: () => Promise<EatSoonTarget[]>;
  /** Signs in as the member; `null` for a banned member (skipped). Throws when it cannot. */
  signIn: (userId: string) => Promise<EatSoonSession | null>;
  /** Asks the app to notify the member's household. Throws when the app did not answer. */
  notify: (session: EatSoonSession) => Promise<EatSoonAnswer>;
  log: (event: string, fields: Record<string, string | number>) => void;
};

export type EatSoonSummary = {
  households: number;
  /** A notification went out (to at least one device). */
  sent: number;
  /** Notifications that went to devices, summed. */
  notifications: number;
  /** Nothing was due. */
  none: number;
  /** The app could not do it (no keys, a read failed); the next day tries again. */
  unavailable: number;
  banned: number;
  errors: number;
};

/** Runs the households one after the other. */
export async function runEatSoonJob(deps: EatSoonDeps): Promise<EatSoonSummary> {
  const targets = await deps.listTargets();
  const summary: EatSoonSummary = { households: targets.length, sent: 0, notifications: 0, none: 0, unavailable: 0, banned: 0, errors: 0 };
  for (const target of targets) {
    let session: EatSoonSession | null = null;
    try {
      session = await deps.signIn(target.userId);
      if (!session) {
        summary.banned += 1;
        continue;
      }
      const answer = await deps.notify(session);
      if (answer.outcome === "sent") {
        summary.sent += 1;
        summary.notifications += answer.sent;
      } else if (answer.outcome === "none") summary.none += 1;
      else {
        summary.unavailable += 1;
        deps.log("eat_soon_unavailable", { outcome: answer.outcome });
      }
    } catch (error) {
      summary.errors += 1;
      deps.log("eat_soon_error", { code: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
    } finally {
      if (session) {
        try {
          await session.signOut();
        } catch {
          deps.log("eat_soon_sign_out_failed", {});
        }
      }
    }
  }
  return summary;
}

const pageSize = 1000;

/**
 * The households with at least one device (a push subscription), each with the member to act as. Read with the
 * service role. A household without a member is left out.
 */
export async function loadEatSoonTargets(admin: Db): Promise<EatSoonTarget[]> {
  const subscribed = new Set<string>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from("push_subscription").select("user_id").order("id").range(from, from + pageSize - 1);
    if (error) throw new Error(`eat_soon_devices_failed ${error.code || "no_answer"}`);
    for (const row of data) subscribed.add(row.user_id);
    if (data.length < pageSize) break;
  }
  const users = [...subscribed].sort();
  const households = new Set<string>();
  for (let from = 0; from < users.length; from += 100) {
    const found = await admin.from("household_member").select("household_id").in("user_id", users.slice(from, from + 100));
    if (found.error) throw new Error(`eat_soon_members_failed ${found.error.code || "no_answer"}`);
    for (const row of found.data) households.add(row.household_id);
  }
  const ids = [...households].sort();
  const members: HouseholdMemberRow[] = [];
  for (let from = 0; from < ids.length; from += 100) {
    const found = await admin.from("household_member").select("household_id, user_id, role, joined_at").in("household_id", ids.slice(from, from + 100));
    if (found.error) throw new Error(`eat_soon_members_failed ${found.error.code || "no_answer"}`);
    members.push(...found.data);
  }
  const targets: EatSoonTarget[] = [];
  for (const householdId of ids) {
    const userId = signerOf(householdId, null, members);
    if (userId) targets.push({ householdId, userId });
  }
  return targets;
}
