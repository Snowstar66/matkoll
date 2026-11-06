// The ideas step of the scheduled offers job: after the offers are fetched, every household that has offers this
// week and no ready (or running) set gets its "Nya idéer med extrapris" prepared now, so nobody waits for them on
// the first view. Pure but for its dependencies, so tests/scripts/offer-ideas-job.test.ts and
// tests/integration/offer-ideas-job.test.ts cover it. The work for a household is the app's (POST
// /api/offer-ideas/prepare, as a member of the household, under RLS); this file chooses the households, keeps the
// time and counts. The log holds counts and codes only, never a name, an address or a food.

import { swedishToday, weekStartOf } from "@/features/offers/domain/week";
import { staleSetMs } from "@/features/suggestions/domain/offer-idea-set";
import { signerOf, type HouseholdMemberRow } from "../fetch-offers/plan.ts";
import type { Db } from "../fetch-offers/job.ts";

/** A household to prepare, and the member to act as (signerOf: the owner, else the longest-standing member). */
export type IdeaTarget = { householdId: string; userId: string };

/** A member's session for one request, and how to end it again (throws when it could not). */
export type IdeaSession = { accessToken: string; refreshToken: string; signOut: () => Promise<void> };

export type IdeasDeps = {
  /** The households that need a set (loadIdeaTargets with the service role). */
  listTargets: () => Promise<IdeaTarget[]>;
  /** Signs in as the member; `null` for a banned member (skipped). Throws when it cannot. */
  signIn: (userId: string) => Promise<IdeaSession | null>;
  /** Asks the app to prepare the member's household's set; gives the app's outcome. Throws when the app did not answer. */
  prepare: (session: IdeaSession) => Promise<string>;
  /** Milliseconds, as Date.now(). */
  now: () => number;
  /** No new household is started after this long. */
  budgetMs: number;
  log: (event: string, fields: Record<string, string | number>) => void;
};

/** What happened to the households, counted. */
export type IdeasSummary = {
  households: number;
  /** A set was made. */
  prepared: number;
  /** The run ended without ideas (the set says why; the next view tries again). */
  failed: number;
  /** A set was ready or another run held it by then. */
  skipped: number;
  /** No offers by then. */
  none: number;
  /** Banned members: left alone. */
  banned: number;
  /** Sign-in, the app or the network failed. */
  errors: number;
  /** Left for the next run: the time was up. */
  notReached: number;
};

/** Runs the households one after the other, so the AI is asked one household at a time. */
export async function runIdeasJob(deps: IdeasDeps): Promise<IdeasSummary> {
  const targets = await deps.listTargets();
  const summary: IdeasSummary = { households: targets.length, prepared: 0, failed: 0, skipped: 0, none: 0, banned: 0, errors: 0, notReached: 0 };
  const started = deps.now();
  for (const [index, target] of targets.entries()) {
    if (deps.now() - started >= deps.budgetMs) {
      summary.notReached = targets.length - index;
      deps.log("offer_ideas_budget_used", { notReached: summary.notReached });
      break;
    }
    let session: IdeaSession | null = null;
    try {
      session = await deps.signIn(target.userId);
      if (!session) {
        summary.banned += 1;
        continue;
      }
      const outcome = await deps.prepare(session);
      if (outcome === "prepared") summary.prepared += 1;
      else if (outcome === "failed") summary.failed += 1;
      else if (outcome === "skipped") summary.skipped += 1;
      else if (outcome === "none") summary.none += 1;
      else {
        summary.errors += 1;
        deps.log("offer_ideas_unavailable", { outcome });
      }
    } catch (error) {
      summary.errors += 1;
      deps.log("offer_ideas_error", { code: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
    } finally {
      if (session) {
        try {
          await session.signOut();
        } catch {
          deps.log("offer_ideas_sign_out_failed", {});
        }
      }
    }
  }
  return summary;
}

const pageSize = 1000;

/**
 * The households with offers still on this week (the newest week from this week on, not past its `valid_to`, as the
 * app reads them) that have no ready set for that week and none that a run holds now. A failed set is tried again.
 * Read with the service role; each household comes with the member to act as. A household without a member is left out.
 */
export async function loadIdeaTargets(admin: Db, now: Date): Promise<IdeaTarget[]> {
  const thisWeek = weekStartOf(now);
  const today = swedishToday(now);
  const newest = new Map<string, string>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("store_offer")
      .select("household_id, week_start, valid_to")
      .gte("week_start", thisWeek)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`offer_ideas_offers_failed ${error.code || "no_answer"}`);
    for (const row of data) {
      if (row.valid_to && row.valid_to < today) continue;
      const known = newest.get(row.household_id);
      if (!known || row.week_start > known) newest.set(row.household_id, row.week_start);
    }
    if (data.length < pageSize) break;
  }
  const households = [...newest.keys()].sort();
  const staleBefore = now.getTime() - staleSetMs;
  const covered = new Set<string>();
  const members: HouseholdMemberRow[] = [];
  for (let from = 0; from < households.length; from += 100) {
    const chunk = households.slice(from, from + 100);
    const sets = await admin.from("offer_idea_set").select("household_id, week_start, status, claimed_at").in("household_id", chunk);
    if (sets.error) throw new Error(`offer_ideas_sets_failed ${sets.error.code || "no_answer"}`);
    for (const row of sets.data) {
      if (row.week_start !== newest.get(row.household_id)) continue;
      if (row.status === "ready" || (row.status === "pending" && new Date(row.claimed_at).getTime() >= staleBefore)) covered.add(row.household_id);
    }
    const found = await admin.from("household_member").select("household_id, user_id, role, joined_at").in("household_id", chunk);
    if (found.error) throw new Error(`offer_ideas_members_failed ${found.error.code || "no_answer"}`);
    members.push(...found.data);
  }
  const targets: IdeaTarget[] = [];
  for (const householdId of households) {
    if (covered.has(householdId)) continue;
    const userId = signerOf(householdId, null, members);
    if (userId) targets.push({ householdId, userId });
  }
  return targets;
}
