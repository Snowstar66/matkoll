import { describe, expect, it } from "vitest";
import { runEatSoonJob, type EatSoonAnswer, type EatSoonDeps, type EatSoonSession } from "../../scripts/eat-soon/job.ts";

// The daily "Ät snart" job: households one at a time, each as a member, the counts, and that the log holds codes
// and counts only. What is due and who is told is the app's (route.test.ts, tests/integration/eat-soon.test.ts).

const targets = ["h1", "h2", "h3", "h4"].map((householdId) => ({ householdId, userId: `u-${householdId}` }));

function setup(answers: Record<string, EatSoonAnswer | Error> = {}, overrides: Partial<EatSoonDeps> = {}) {
  const calls: string[] = [];
  const signedOut: string[] = [];
  const logs: { event: string; fields: Record<string, string | number> }[] = [];
  const deps: EatSoonDeps = {
    listTargets: async () => targets,
    signIn: async (userId): Promise<EatSoonSession | null> => ({
      accessToken: `access-${userId}`,
      refreshToken: `refresh-${userId}`,
      signOut: async () => void signedOut.push(userId),
    }),
    notify: async (session) => {
      const userId = session.accessToken.replace("access-", "");
      calls.push(userId);
      const answer = answers[userId] ?? { outcome: "sent", due: 2, sent: 3 };
      if (answer instanceof Error) throw answer;
      return answer;
    },
    log: (event, fields) => void logs.push({ event, fields }),
    ...overrides,
  };
  return { deps, calls, signedOut, logs };
}

describe("runEatSoonJob", () => {
  it("asks every household one after the other and signs each session out", async () => {
    const { deps, calls, signedOut } = setup();
    const summary = await runEatSoonJob(deps);
    expect(calls).toEqual(["u-h1", "u-h2", "u-h3", "u-h4"]);
    expect(signedOut).toEqual(calls);
    expect(summary).toEqual({ households: 4, sent: 4, notifications: 12, none: 0, unavailable: 0, banned: 0, errors: 0 });
  });

  it("counts nothing due, an app that could not, a banned member and an error apart", async () => {
    const { deps, signedOut, logs } = setup(
      { "u-h1": { outcome: "none", due: 0, sent: 0 }, "u-h2": { outcome: "unavailable", due: 0, sent: 0 }, "u-h4": new Error("eat_soon_http_500") },
      { signIn: async (userId) => (userId === "u-h3" ? null : { accessToken: `access-${userId}`, refreshToken: "r", signOut: async () => void signedOut.push(userId) }) },
    );
    expect(await runEatSoonJob(deps)).toEqual({ households: 4, sent: 0, notifications: 0, none: 1, unavailable: 1, banned: 1, errors: 1 });
    // The banned member never had a session; the others are signed out also after an error.
    expect(signedOut).toEqual(["u-h1", "u-h2", "u-h4"]);
    expect(logs).toEqual([
      { event: "eat_soon_unavailable", fields: { outcome: "unavailable" } },
      { event: "eat_soon_error", fields: { code: "eat_soon_http_500" } },
    ]);
  });

  it("keeps going when signing out fails, and logs no name", async () => {
    const { deps, logs } = setup({}, {
      signIn: async (userId) => ({
        accessToken: `access-${userId}`,
        refreshToken: "r",
        signOut: async () => {
          throw new Error("secret@example.com");
        },
      }),
    });
    const summary = await runEatSoonJob(deps);
    expect(summary.sent).toBe(4);
    expect(logs.every((entry) => entry.event === "eat_soon_sign_out_failed")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("secret");
  });

  it("does nothing without households", async () => {
    const { deps, calls } = setup({}, { listTargets: async () => [] });
    expect(await runEatSoonJob(deps)).toEqual({ households: 0, sent: 0, notifications: 0, none: 0, unavailable: 0, banned: 0, errors: 0 });
    expect(calls).toEqual([]);
  });
});
