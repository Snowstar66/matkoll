import { describe, expect, it } from "vitest";
import { runIdeasJob, type IdeaSession, type IdeasDeps } from "../../scripts/offer-ideas/job.ts";

// The ideas step of the scheduled offers job: households one at a time, the time budget, the counts, and that the
// log holds codes and counts only. Choosing the households (idempotency) is tests/integration/offer-ideas-job.test.ts.

const targets = ["h1", "h2", "h3", "h4"].map((householdId) => ({ householdId, userId: `u-${householdId}` }));

function setup(overrides: Partial<IdeasDeps> & { outcomes?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const signedOut: string[] = [];
  const logs: { event: string; fields: Record<string, string | number> }[] = [];
  let clock = 0;
  const deps: IdeasDeps = {
    listTargets: async () => targets,
    signIn: async (userId): Promise<IdeaSession | null> => ({
      accessToken: `access-${userId}`,
      refreshToken: `refresh-${userId}`,
      signOut: async () => void signedOut.push(userId),
    }),
    prepare: async (session) => {
      const userId = session.accessToken.replace("access-", "");
      calls.push(userId);
      clock += 60_000;
      return overrides.outcomes?.[userId] ?? "prepared";
    },
    now: () => clock,
    budgetMs: 10 * 60_000,
    log: (event, fields) => void logs.push({ event, fields }),
    ...overrides,
  };
  return { deps, calls, signedOut, logs };
}

describe("runIdeasJob", () => {
  it("prepares every household one after the other and signs each session out", async () => {
    const { deps, calls, signedOut } = setup();
    const summary = await runIdeasJob(deps);
    expect(calls).toEqual(["u-h1", "u-h2", "u-h3", "u-h4"]);
    expect(signedOut).toEqual(calls);
    expect(summary).toEqual({ households: 4, prepared: 4, failed: 0, skipped: 0, none: 0, banned: 0, errors: 0, notReached: 0 });
  });

  it("counts what the app answered: a set already there is skipped, never made twice", async () => {
    const { deps } = setup({ outcomes: { "u-h1": "skipped", "u-h2": "failed", "u-h3": "none", "u-h4": "unavailable" } });
    expect(await runIdeasJob(deps)).toEqual({ households: 4, prepared: 0, failed: 1, skipped: 1, none: 1, banned: 0, errors: 1, notReached: 0 });
  });

  it("stops starting households when the budget is used and counts the rest", async () => {
    const { deps, calls, logs } = setup({ budgetMs: 120_000 });
    const summary = await runIdeasJob(deps);
    expect(calls).toEqual(["u-h1", "u-h2"]);
    expect(summary).toMatchObject({ households: 4, prepared: 2, notReached: 2 });
    expect(logs).toContainEqual({ event: "offer_ideas_budget_used", fields: { notReached: 2 } });
  });

  it("leaves a banned member alone and goes on after a failed sign-in or request", async () => {
    const { deps, calls, signedOut, logs } = setup({
      signIn: async (userId) => {
        if (userId === "u-h1") return null;
        if (userId === "u-h2") throw new Error("offer_ideas_sign_in_failed");
        return { accessToken: `access-${userId}`, refreshToken: "r", signOut: async () => void signedOut.push(userId) };
      },
      prepare: async (session) => {
        if (session.accessToken === "access-u-h3") throw new Error("offer_ideas_http_503");
        calls.push(session.accessToken);
        return "prepared";
      },
    });
    const summary = await runIdeasJob(deps);
    expect(summary).toEqual({ households: 4, prepared: 1, failed: 0, skipped: 0, none: 0, banned: 1, errors: 2, notReached: 0 });
    expect(signedOut, "a session is signed out also when the request failed").toEqual(["u-h3", "u-h4"]);
    expect(logs.map((entry) => entry.fields.code)).toEqual(["offer_ideas_sign_in_failed", "offer_ideas_http_503"]);
  });

  it("does nothing without households", async () => {
    const { deps, calls } = setup({ listTargets: async () => [] });
    expect(await runIdeasJob(deps)).toEqual({ households: 0, prepared: 0, failed: 0, skipped: 0, none: 0, banned: 0, errors: 0, notReached: 0 });
    expect(calls).toEqual([]);
  });

  it("logs no token, name or id", async () => {
    const { deps, logs } = setup({ outcomes: { "u-h1": "unavailable" } });
    await runIdeasJob(deps);
    expect(JSON.stringify(logs)).not.toMatch(/access-|refresh-|u-h|h\d/);
  });
});
