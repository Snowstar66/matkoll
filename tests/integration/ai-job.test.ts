import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelAiJobIn,
  claimAiJobIn,
  dismissAiJobIn,
  enqueueAiJobIn,
  finishAiJobIn,
  loadAiJobActivityIn,
  loadAiJobIn,
  loadAiJobStatusIn,
  loadShownAiJobsIn,
  markAiJobSeenIn,
  setAiJobResultIn,
  type EnqueueOutcome,
} from "@/features/ai-jobs/data/jobs";
import { toAiJobs } from "@/features/ai-jobs/domain/ai-job";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation, type TestUser } from "./support";

// The AI job queue against local Supabase (Story 12.4, AD-4, AD-5, AD-28,
// NFR-13): RLS on ai_job and the functions refused to anyone but the signed-in
// owner, enqueue_ai_job (the same key gives the same job, one AI-förslag at a
// time, a new photo replaces an older one, at most three active, lost jobs,
// the 24 hours), claim_ai_job (one running job per user, the oldest first,
// two instances at once), the end of a job (finish, cancel, seen, dismiss),
// the checks on the size of context and result, and that only the place is
// kept as context.

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const inFuture = (seconds: number) => new Date(Date.now() + seconds * 1000);

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

/** Queues a job for `user`; the deadline is 175 s on, as a route gives it. */
async function enqueue(
  user: TestUser,
  options: { kind?: "suggest" | "analyze" | "import"; clientKey?: string; context?: Record<string, string> } = {},
): Promise<Extract<EnqueueOutcome, { kind: "queued" }>> {
  const outcome = await enqueueAiJobIn(user.db, {
    kind: options.kind ?? "suggest",
    clientKey: options.clientKey ?? randomUUID(),
    context: options.context ?? { siteId },
    queueDeadline: inFuture(175),
  });
  if (outcome.kind !== "queued") throw new Error("the queue was full");
  return outcome;
}

/** Another kind of job that does not replace or give back anything. */
const enqueueImport = (user: TestUser) => enqueue(user, { kind: "import", context: { source: "text" } });

async function statusOf(id: string) {
  const { data, error } = await adminClient().from("ai_job").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

/** Makes a job's time pass, as a function that died would leave it. */
async function expire(id: string) {
  const { error } = await adminClient().from("ai_job").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
  if (error) throw error;
}

describe("RLS and grants", () => {
  it("isolates ai_job: another user and anon can neither read nor change a row", async () => {
    await expectRlsIsolation("ai_job", async () => ({
      kind: "suggest",
      client_key: randomUUID(),
      expires_at: inFuture(175).toISOString(),
    }));
  });

  it("refuses every function to anon, which has no grant", async () => {
    const anon = anonClient();
    const id = randomUUID();
    const answers = await Promise.all([
      anon.rpc("enqueue_ai_job", { job_kind: "suggest", job_client_key: id, job_context: {}, queue_deadline: inFuture(60).toISOString() }),
      anon.rpc("claim_ai_job", { job_id: id, run_deadline: inFuture(60).toISOString() }),
      anon.rpc("set_ai_job_result", { job_id: id, job_result: {} }),
      anon.rpc("finish_ai_job", { job_id: id, job_status: "failed", job_error_code: "ai_unavailable" }),
      anon.rpc("cancel_ai_job", { job_id: id }),
      anon.rpc("mark_ai_job_seen", { job_id: id }),
      anon.rpc("dismiss_ai_job", { job_id: id }),
      anon.rpc("ai_job_lock"),
      anon.rpc("ai_job_expire"),
    ]);
    for (const answer of answers) expect(answer.error?.code).toBe("42501");
  });

  it("keeps a user's jobs and keys apart: the same key is a job of each", async () => {
    const one = await createTestUser("ai-keys-one");
    const two = await createTestUser("ai-keys-two");
    const clientKey = randomUUID();
    const first = await enqueue(one, { clientKey });
    const second = await enqueue(two, { clientKey });
    expect(first.job.id).not.toBe(second.job.id);
    expect(first.created && second.created).toBe(true);
  });

  it("lets another user neither read, cancel, mark, dismiss, take over, finish nor give a result to a job", async () => {
    const owner = await createTestUser("ai-owner");
    const other = await createTestUser("ai-other");
    const { job } = await enqueue(owner);

    expect(await loadAiJobIn(other.db, job.id)).toBeNull();
    expect(await loadAiJobStatusIn(other.db, job.id)).toBeNull();
    expect(await loadShownAiJobsIn(other.db)).toEqual([]);
    expect(await cancelAiJobIn(other.db, job.id)).toBe("gone");
    expect(await markAiJobSeenIn(other.db, job.id)).toBe("gone");
    expect(await dismissAiJobIn(other.db, job.id)).toBe("gone");
    expect(await claimAiJobIn(other.db, job.id, inFuture(130))).toEqual({ outcome: "gone", position: 0 });
    expect(await finishAiJobIn(other.db, job.id, { status: "failed", errorCode: "ai_unavailable" })).toBe(false);

    // The owner's job is as it was, and still theirs to run.
    expect(await statusOf(job.id)).toMatchObject({ status: "queued", user_id: owner.id, seen_at: null, error_code: null });
    expect(await claimAiJobIn(owner.db, job.id, inFuture(130))).toEqual({ outcome: "claimed", position: 0 });
    expect(await setAiJobResultIn(other.db, job.id, { stolen: true })).toBe(false);
    expect((await statusOf(job.id)).result).toBeNull();
  });

  it("removes a user's jobs with the user", async () => {
    const gone = await createTestUser("ai-cascade");
    const { job } = await enqueue(gone);
    await adminClient().auth.admin.deleteUser(gone.id);
    const { data } = await adminClient().from("ai_job").select("id").eq("id", job.id);
    expect(data).toEqual([]);
  });
});

describe("what a row may hold", () => {
  it("refuses a context that is not an object or is larger than 2 KB, and keeps only the place", async () => {
    const user = await createTestUser("ai-context");
    const base = { kind: "suggest", expires_at: inFuture(60).toISOString() };
    const insert = (context: unknown) => user.db.from("ai_job").insert({ ...base, client_key: randomUUID(), context: context as never });
    expect((await insert([])).error?.code).toBe("23514");
    expect((await insert("text")).error?.code).toBe("23514");
    expect((await insert({ text: "x".repeat(2100) })).error?.code).toBe("23514");
    expect((await insert({ siteId })).error).toBeNull();
    const { job } = await enqueue(user);
    expect(job.context).toEqual({ siteId });
  });

  it("refuses a result larger than 256 KB, and a result for a job that is not done", async () => {
    const user = await createTestUser("ai-result");
    const { job } = await enqueue(user);
    await claimAiJobIn(user.db, job.id, inFuture(130));
    const big = { text: "x".repeat(262_200) };
    await expect(setAiJobResultIn(user.db, job.id, big)).rejects.toMatchObject({ detail: "set_result_failed 23514" });
    await expect(finishAiJobIn(user.db, job.id, { status: "done", result: big })).rejects.toMatchObject({ detail: "finish_failed 23514" });
    // Nothing was written, and the job is still running.
    expect(await statusOf(job.id)).toMatchObject({ status: "running", result: null });
    expect(await finishAiJobIn(user.db, job.id, { status: "done", result: { suggestions: [] } })).toBe(true);
  });

  it("refuses a kind, a state and an error code that are not known", async () => {
    const user = await createTestUser("ai-values");
    const insert = (row: Record<string, unknown>) =>
      user.db.from("ai_job").insert({ kind: "suggest", client_key: randomUUID(), expires_at: inFuture(60).toISOString(), ...row } as never);
    expect((await insert({ kind: "video" })).error?.code).toBe("23514");
    expect((await insert({ status: "waiting" })).error?.code).toBe("23514");
    expect((await insert({ status: "failed", finished_at: new Date().toISOString(), error_code: "Not A Code" })).error?.code).toBe("23514");
    // A failed job has a code, a done one a result, and a job is finished exactly when it has a time.
    expect((await insert({ status: "failed", finished_at: new Date().toISOString() })).error?.code).toBe("23514");
    expect((await insert({ status: "done", finished_at: new Date().toISOString() })).error?.code).toBe("23514");
    expect((await insert({ status: "done", result: {} })).error?.code).toBe("23514");
  });

  it("is not given to anon: no grant on the table", async () => {
    const { error } = await anonClient().from("ai_job").select("id").limit(1);
    expect(error?.code).toBe("42501");
  });
});

describe("enqueue_ai_job", () => {
  it("makes a queued job with the time to start by, and the same key gives the same job", async () => {
    const user = await createTestUser("ai-enqueue");
    const clientKey = randomUUID();
    const first = await enqueue(user, { clientKey });
    expect(first.created).toBe(true);
    expect(first.job).toMatchObject({ kind: "suggest", status: "queued", client_key: clientKey, seen_at: null, started_at: null, finished_at: null });
    expect(Date.parse(first.job.expires_at)).toBeGreaterThan(Date.now() + 170_000);

    const again = await enqueue(user, { clientKey });
    expect(again.created).toBe(false);
    expect(again.job.id).toBe(first.job.id);
    expect((await adminClient().from("ai_job").select("id").eq("user_id", user.id)).data).toHaveLength(1);
  });

  it("gives the same job for a key, whatever its state, also a finished one", async () => {
    const user = await createTestUser("ai-enqueue-done");
    const clientKey = randomUUID();
    const { job } = await enqueue(user, { clientKey });
    await claimAiJobIn(user.db, job.id, inFuture(130));
    await finishAiJobIn(user.db, job.id, { status: "done", result: { suggestions: [] } });
    const again = await enqueue(user, { clientKey });
    expect(again).toMatchObject({ created: false, job: { id: job.id, status: "done" } });
  });

  it("gives the active AI-förslag job instead of a second one, whatever the key", async () => {
    const user = await createTestUser("ai-enqueue-suggest");
    const first = await enqueue(user);
    const second = await enqueue(user);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    // Also while it runs. When it is done, a new one is made.
    await claimAiJobIn(user.db, first.job.id, inFuture(130));
    expect((await enqueue(user)).job.id).toBe(first.job.id);
    await finishAiJobIn(user.db, first.job.id, { status: "done", result: { suggestions: [] } });
    const next = await enqueue(user);
    expect(next.created).toBe(true);
    expect(next.job.id).not.toBe(first.job.id);
  });

  it("lets two AI-förslag at once make one job", async () => {
    const user = await createTestUser("ai-enqueue-race");
    const answers = await Promise.all(Array.from({ length: 6 }, () => enqueue(user)));
    expect(new Set(answers.map((answer) => answer.job.id)).size).toBe(1);
    expect(answers.filter((answer) => answer.created)).toHaveLength(1);
  });

  it("replaces an older photo of the same place with a newer one, also one that is done, and leaves other places and spots alone", async () => {
    const user = await createTestUser("ai-supersede");
    const photo = (location: string, site = siteId) => enqueue(user, { kind: "analyze", context: { siteId: site, location } });
    const kyl = await photo("Kyl");
    const frys = await photo("Frys");
    const other = await photo("Kyl", "55555555-5555-4555-8555-555555555555");

    const newer = await photo("Kyl");
    expect(newer.created).toBe(true);
    expect((await statusOf(kyl.job.id)).status).toBe("superseded");
    expect((await statusOf(frys.job.id)).status).toBe("queued");
    expect((await statusOf(other.job.id)).status).toBe("queued");
    // A replaced job is finished, has no result and is never shown.
    expect(await statusOf(kyl.job.id)).toMatchObject({ result: null });
    expect((await statusOf(kyl.job.id)).finished_at).not.toBeNull();
    const shown = toAiJobs(await loadShownAiJobsIn(user.db), Date.now());
    expect(shown.map((job) => job.id)).not.toContain(kyl.job.id);
  });

  it("makes room for a new photo of a place by replacing the old one, also when three are active", async () => {
    const user = await createTestUser("ai-supersede-full");
    const photo = (location: string) => enqueue(user, { kind: "analyze", context: { siteId, location } });
    await photo("Kyl");
    await photo("Frys");
    await photo("Skafferi");
    // A fourth job would be refused, but a new photo of the fridge takes the place of the first.
    const again = await photo("Kyl");
    expect(again.created).toBe(true);
    const active = (await adminClient().from("ai_job").select("id").eq("user_id", user.id).in("status", ["queued", "running"])).data;
    expect(active).toHaveLength(3);
  });

  it("replaces a job that is running too, so it stops (its status says so)", async () => {
    const user = await createTestUser("ai-supersede-running");
    const first = await enqueue(user, { kind: "analyze", context: { siteId, location: "Kyl" } });
    await claimAiJobIn(user.db, first.job.id, inFuture(120));
    await enqueue(user, { kind: "analyze", context: { siteId, location: "Kyl" } });
    expect(await loadAiJobStatusIn(user.db, first.job.id)).toBe("superseded");
    // Its end is thrown away.
    expect(await finishAiJobIn(user.db, first.job.id, { status: "done", result: { items: [] } })).toBe(false);
  });

  it("refuses a fourth active job with the code for a full queue, and takes jobs again when one has ended", async () => {
    const user = await createTestUser("ai-full");
    const one = await enqueueImport(user);
    await enqueueImport(user);
    await enqueueImport(user);
    const full = await enqueueAiJobIn(user.db, { kind: "import", clientKey: randomUUID(), context: { source: "text" }, queueDeadline: inFuture(175) });
    expect(full).toEqual({ kind: "full" });
    // Nothing was added.
    expect((await adminClient().from("ai_job").select("id").eq("user_id", user.id)).data).toHaveLength(3);

    await cancelAiJobIn(user.db, one.job.id);
    expect((await enqueueImport(user)).created).toBe(true);
  });

  it("counts a running job and not a finished one among the three", async () => {
    const user = await createTestUser("ai-full-count");
    const first = await enqueueImport(user);
    await claimAiJobIn(user.db, first.job.id, inFuture(130));
    await enqueueImport(user);
    await enqueueImport(user);
    expect((await enqueueAiJobIn(user.db, { kind: "import", clientKey: randomUUID(), context: {}, queueDeadline: inFuture(175) })).kind).toBe("full");
    await finishAiJobIn(user.db, first.job.id, { status: "done", result: { recipe: {} } });
    expect((await enqueueImport(user)).created).toBe(true);
  });

  it("marks jobs whose time has passed as failed with ai_job_lost, so they never hang the queue", async () => {
    const user = await createTestUser("ai-lost");
    const running = await enqueueImport(user);
    await claimAiJobIn(user.db, running.job.id, inFuture(130));
    const waiting = await enqueueImport(user);
    await expire(running.job.id);
    await expire(waiting.job.id);

    const next = await enqueueImport(user);
    for (const lost of [running, waiting]) {
      expect(await statusOf(lost.job.id)).toMatchObject({ status: "failed", error_code: "ai_job_lost", result: null });
      expect((await statusOf(lost.job.id)).finished_at).not.toBeNull();
    }
    // The queue is free: the new job is the next in turn.
    expect(await claimAiJobIn(user.db, next.job.id, inFuture(130))).toEqual({ outcome: "claimed", position: 0 });
  });

  it("never lets a partial result outlive a job that was lost", async () => {
    const user = await createTestUser("ai-lost-partial");
    const running = await enqueueImport(user);
    await claimAiJobIn(user.db, running.job.id, inFuture(130));
    expect(await setAiJobResultIn(user.db, running.job.id, { partial: 1 })).toBe(true);
    await expire(running.job.id);
    await enqueueImport(user);
    expect(await statusOf(running.job.id)).toMatchObject({ status: "failed", error_code: "ai_job_lost", result: null });
  });

  it("gives a queued job a margin of about 10 seconds past its start deadline, so the route's own timeout comes first", async () => {
    const user = await createTestUser("ai-margin");
    const deadline = inFuture(60);
    const outcome = await enqueueAiJobIn(user.db, { kind: "import", clientKey: randomUUID(), context: { source: "text" }, queueDeadline: deadline });
    if (outcome.kind !== "queued") throw new Error("the queue was full");
    const margin = Date.parse(outcome.job.expires_at) - deadline.getTime();
    expect(margin).toBeGreaterThanOrEqual(9_000);
    expect(margin).toBeLessThanOrEqual(11_000);
  });

  it("removes finished jobs older than 24 hours, whether they were closed or not, and keeps younger ones and active ones", async () => {
    const user = await createTestUser("ai-old");
    const old = await enqueueImport(user);
    const young = await enqueueImport(user);
    const active = await enqueueImport(user);
    for (const { job } of [old, young]) {
      await claimAiJobIn(user.db, job.id, inFuture(130));
      await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } });
    }
    await adminClient().from("ai_job").update({ finished_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }).eq("id", old.job.id);
    await adminClient().from("ai_job").update({ finished_at: new Date(Date.now() - 23 * 3600 * 1000).toISOString() }).eq("id", young.job.id);

    await enqueueImport(user);
    const left = (await adminClient().from("ai_job").select("id").eq("user_id", user.id)).data?.map((row) => row.id) ?? [];
    expect(left).not.toContain(old.job.id);
    expect(left).toEqual(expect.arrayContaining([young.job.id, active.job.id]));
    // A result that is gone is not found.
    expect(await loadAiJobIn(user.db, old.job.id)).toBeNull();
  });
});

describe("claim_ai_job", () => {
  it("claims the oldest queued job when none runs, and makes the others wait with their place", async () => {
    const user = await createTestUser("ai-claim");
    const first = await enqueueImport(user);
    const second = await enqueueImport(user);
    const third = await enqueueImport(user);
    const deadline = inFuture(130);

    // The turn is the oldest's, whoever asks first.
    expect(await claimAiJobIn(user.db, third.job.id, deadline)).toEqual({ outcome: "waiting", position: 2 });
    expect(await claimAiJobIn(user.db, second.job.id, deadline)).toEqual({ outcome: "waiting", position: 1 });
    expect(await claimAiJobIn(user.db, first.job.id, deadline)).toEqual({ outcome: "claimed", position: 0 });
    expect(await statusOf(first.job.id)).toMatchObject({ status: "running", started_at: expect.any(String) });
    expect(Date.parse((await statusOf(first.job.id)).expires_at)).toBe(deadline.getTime());

    // While one runs, none else is claimed, even the next in line.
    expect(await claimAiJobIn(user.db, second.job.id, deadline)).toEqual({ outcome: "waiting", position: 1 });
    await finishAiJobIn(user.db, first.job.id, { status: "done", result: { recipe: {} } });
    expect(await claimAiJobIn(user.db, third.job.id, deadline)).toEqual({ outcome: "waiting", position: 1 });
    expect(await claimAiJobIn(user.db, second.job.id, deadline)).toEqual({ outcome: "claimed", position: 0 });
  });

  it("is gone for a job that was cancelled, replaced, lost, finished or never there, and a claimed job is not claimed twice", async () => {
    const user = await createTestUser("ai-claim-gone");
    const cancelled = await enqueueImport(user);
    await cancelAiJobIn(user.db, cancelled.job.id);
    expect(await claimAiJobIn(user.db, cancelled.job.id, inFuture(130))).toEqual({ outcome: "gone", position: 0 });

    const lost = await enqueueImport(user);
    await expire(lost.job.id);
    expect(await claimAiJobIn(user.db, lost.job.id, inFuture(130))).toEqual({ outcome: "gone", position: 0 });
    expect(await statusOf(lost.job.id)).toMatchObject({ status: "failed", error_code: "ai_job_lost" });

    expect(await claimAiJobIn(user.db, randomUUID(), inFuture(130))).toEqual({ outcome: "gone", position: 0 });

    const running = await enqueueImport(user);
    expect(await claimAiJobIn(user.db, running.job.id, inFuture(130))).toEqual({ outcome: "claimed", position: 0 });
    expect(await claimAiJobIn(user.db, running.job.id, inFuture(130))).toEqual({ outcome: "gone", position: 0 });
  });

  it("frees the turn of a running job that was lost, so the next is claimed", async () => {
    const user = await createTestUser("ai-claim-lost");
    const dead = await enqueueImport(user);
    const next = await enqueueImport(user);
    await claimAiJobIn(user.db, dead.job.id, inFuture(130));
    expect(await claimAiJobIn(user.db, next.job.id, inFuture(130))).toEqual({ outcome: "waiting", position: 1 });
    await expire(dead.job.id);
    expect(await claimAiJobIn(user.db, next.job.id, inFuture(130))).toEqual({ outcome: "claimed", position: 0 });
    expect(await statusOf(dead.job.id)).toMatchObject({ status: "failed", error_code: "ai_job_lost" });
  });

  it("never lets two instances claim for the same user at once: of two jobs asked for together, exactly one is claimed", async () => {
    const user = await createTestUser("ai-claim-race");
    // The same user from two clients, as two server instances act: two sessions, one user.
    const instanceB = anonClient();
    const link = await adminClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (link.error) throw link.error;
    const verified = await instanceB.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
    if (verified.error) throw verified.error;

    for (let round = 0; round < 8; round += 1) {
      const one = await enqueueImport(user);
      const two = await enqueueImport(user);
      const answers = await Promise.all([claimAiJobIn(user.db, one.job.id, inFuture(130)), claimAiJobIn(instanceB, two.job.id, inFuture(130))]);
      expect(answers.filter((answer) => answer.outcome === "claimed")).toHaveLength(1);
      // The oldest is the one that runs.
      expect(answers[0].outcome).toBe("claimed");
      const running = (await adminClient().from("ai_job").select("id").eq("user_id", user.id).eq("status", "running")).data;
      expect(running).toEqual([{ id: one.job.id }]);
      await finishAiJobIn(user.db, one.job.id, { status: "done", result: { recipe: {} } });
      await cancelAiJobIn(user.db, two.job.id);
      await dismissAiJobIn(user.db, one.job.id);
    }
  });

  it("is backed by the index: a second running job for a user is refused by the table itself", async () => {
    const user = await createTestUser("ai-claim-index");
    const insert = () =>
      adminClient().from("ai_job").insert({
        user_id: user.id,
        kind: "import",
        status: "running",
        client_key: randomUUID(),
        expires_at: inFuture(130).toISOString(),
      });
    expect((await insert()).error).toBeNull();
    expect((await insert()).error?.code).toBe("23505");
  });

  it("lets two users run one job each at the same time", async () => {
    const one = await createTestUser("ai-claim-users-one");
    const two = await createTestUser("ai-claim-users-two");
    const a = await enqueueImport(one);
    const b = await enqueueImport(two);
    const answers = await Promise.all([claimAiJobIn(one.db, a.job.id, inFuture(130)), claimAiJobIn(two.db, b.job.id, inFuture(130))]);
    expect(answers.map((answer) => answer.outcome)).toEqual(["claimed", "claimed"]);
  });
});

describe("the end of a job", () => {
  it("writes a partial result while the job runs, and finishes done with the result", async () => {
    const user = await createTestUser("ai-finish");
    const { job } = await enqueueImport(user);
    // Not running yet: nothing is written.
    expect(await setAiJobResultIn(user.db, job.id, { early: true })).toBe(false);
    await claimAiJobIn(user.db, job.id, inFuture(130));
    expect(await setAiJobResultIn(user.db, job.id, { partial: 1 })).toBe(true);
    expect((await statusOf(job.id)).result).toEqual({ partial: 1 });

    expect(await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: { title: "Pannkakor" } } })).toBe(true);
    expect(await statusOf(job.id)).toMatchObject({ status: "done", error_code: null, result: { recipe: { title: "Pannkakor" } } });
    expect((await statusOf(job.id)).finished_at).not.toBeNull();
    // Finished is finished: a second end, or a late partial result, changes nothing.
    expect(await finishAiJobIn(user.db, job.id, { status: "failed", errorCode: "ai_invalid" })).toBe(false);
    expect(await setAiJobResultIn(user.db, job.id, { late: true })).toBe(false);
    expect(await statusOf(job.id)).toMatchObject({ status: "done", result: { recipe: { title: "Pannkakor" } } });
  });

  it("finishes failed with the code and no result, also a queued job that did not get to start", async () => {
    const user = await createTestUser("ai-finish-failed");
    const running = await enqueueImport(user);
    const queued = await enqueueImport(user);
    await claimAiJobIn(user.db, running.job.id, inFuture(130));
    await setAiJobResultIn(user.db, running.job.id, { partial: 1 });
    expect(await finishAiJobIn(user.db, running.job.id, { status: "failed", errorCode: "ai_invalid" })).toBe(true);
    expect(await statusOf(running.job.id)).toMatchObject({ status: "failed", error_code: "ai_invalid", result: null });

    expect(await finishAiJobIn(user.db, queued.job.id, { status: "failed", errorCode: "ai_queue_timeout" })).toBe(true);
    expect(await statusOf(queued.job.id)).toMatchObject({ status: "failed", error_code: "ai_queue_timeout" });
  });

  it("never lets a queued job be finished as done: it has not run", async () => {
    const user = await createTestUser("ai-finish-queued");
    const { job } = await enqueueImport(user);
    expect(await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } })).toBe(false);
    expect((await statusOf(job.id)).status).toBe("queued");
  });

  it("throws away the end of a job that was cancelled meanwhile, and its partial result", async () => {
    const user = await createTestUser("ai-finish-cancelled");
    const { job } = await enqueueImport(user);
    await claimAiJobIn(user.db, job.id, inFuture(130));
    expect(await cancelAiJobIn(user.db, job.id)).toBe("ok");
    expect(await loadAiJobStatusIn(user.db, job.id)).toBe("cancelled");
    expect(await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } })).toBe(false);
    expect(await setAiJobResultIn(user.db, job.id, { partial: 1 })).toBe(false);
    expect(await statusOf(job.id)).toMatchObject({ status: "cancelled", result: null, error_code: null });
  });

  it("throws away the end of a job that was lost meanwhile", async () => {
    const user = await createTestUser("ai-finish-lost");
    const { job } = await enqueueImport(user);
    await claimAiJobIn(user.db, job.id, inFuture(130));
    await expire(job.id);
    // The next use of the queue marks it lost; before that, the end of the function is still its own.
    await enqueueImport(user);
    expect(await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } })).toBe(false);
    expect(await statusOf(job.id)).toMatchObject({ status: "failed", error_code: "ai_job_lost" });
  });

  it("refuses an end that is neither done nor failed", async () => {
    const user = await createTestUser("ai-finish-status");
    const { job } = await enqueueImport(user);
    const answer = await user.db.rpc("finish_ai_job", { job_id: job.id, job_status: "cancelled" });
    expect(answer.error?.code).toBe("22023");
  });
});

describe("cancel, seen and dismiss", () => {
  it("cancels a queued or a running job, counts it as seen, and says nothing is wrong for a finished one", async () => {
    const user = await createTestUser("ai-cancel");
    const running = await enqueueImport(user);
    const queued = await enqueueImport(user);
    await claimAiJobIn(user.db, running.job.id, inFuture(130));
    expect(await cancelAiJobIn(user.db, queued.job.id)).toBe("ok");
    expect(await cancelAiJobIn(user.db, running.job.id)).toBe("ok");
    for (const { job } of [running, queued]) {
      expect(await statusOf(job.id)).toMatchObject({ status: "cancelled", result: null });
      expect((await statusOf(job.id)).finished_at).not.toBeNull();
      expect((await statusOf(job.id)).seen_at).not.toBeNull();
    }
    // Cancelled twice is cancelled; a job that has ended stays as it ended.
    expect(await cancelAiJobIn(user.db, queued.job.id)).toBe("ok");
    const done = await enqueueImport(user);
    await claimAiJobIn(user.db, done.job.id, inFuture(130));
    await finishAiJobIn(user.db, done.job.id, { status: "done", result: { recipe: {} } });
    expect(await cancelAiJobIn(user.db, done.job.id)).toBe("ok");
    expect((await statusOf(done.job.id)).status).toBe("done");
    // Cancelled jobs are never shown: they are seen.
    const shown = toAiJobs(await loadShownAiJobsIn(user.db), Date.now());
    expect(shown.map((job) => job.id)).toEqual([done.job.id]);
  });

  it("frees the turn when the running job is cancelled", async () => {
    const user = await createTestUser("ai-cancel-turn");
    const running = await enqueueImport(user);
    const next = await enqueueImport(user);
    await claimAiJobIn(user.db, running.job.id, inFuture(130));
    await cancelAiJobIn(user.db, running.job.id);
    expect(await claimAiJobIn(user.db, next.job.id, inFuture(130))).toEqual({ outcome: "claimed", position: 0 });
  });

  it("marks a result as seen once, and a seen job is no longer shown", async () => {
    const user = await createTestUser("ai-seen");
    const { job } = await enqueueImport(user);
    await claimAiJobIn(user.db, job.id, inFuture(130));
    await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } });
    expect((await loadShownAiJobsIn(user.db)).map((row) => row.id)).toEqual([job.id]);

    expect(await markAiJobSeenIn(user.db, job.id)).toBe("ok");
    const first = (await statusOf(job.id)).seen_at;
    expect(first).not.toBeNull();
    expect(await markAiJobSeenIn(user.db, job.id)).toBe("ok");
    expect((await statusOf(job.id)).seen_at).toBe(first);
    expect(await loadShownAiJobsIn(user.db)).toEqual([]);
    // It is there until it is closed, for its result.
    expect((await loadAiJobIn(user.db, job.id))?.status).toBe("done");
  });

  it("removes a result that is closed, and says gone for one that is not there", async () => {
    const user = await createTestUser("ai-dismiss");
    const { job } = await enqueueImport(user);
    await claimAiJobIn(user.db, job.id, inFuture(130));
    await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } });
    expect(await dismissAiJobIn(user.db, job.id)).toBe("ok");
    expect(await loadAiJobIn(user.db, job.id)).toBeNull();
    expect(await dismissAiJobIn(user.db, job.id)).toBe("gone");
    expect(await markAiJobSeenIn(user.db, job.id)).toBe("gone");
    expect(await cancelAiJobIn(user.db, job.id)).toBe("gone");
  });

  it("cancels and removes a job that is still running when it is closed, so the queue goes on", async () => {
    const user = await createTestUser("ai-dismiss-running");
    const running = await enqueueImport(user);
    const next = await enqueueImport(user);
    await claimAiJobIn(user.db, running.job.id, inFuture(130));
    expect(await dismissAiJobIn(user.db, running.job.id)).toBe("ok");
    // The function that runs it sees it gone, and its end is thrown away.
    expect(await loadAiJobStatusIn(user.db, running.job.id)).toBeNull();
    expect(await finishAiJobIn(user.db, running.job.id, { status: "done", result: { recipe: {} } })).toBe(false);
    expect(await claimAiJobIn(user.db, next.job.id, inFuture(130))).toEqual({ outcome: "claimed", position: 0 });
  });
});

describe("what the app reads", () => {
  it("shows the active jobs and the finished ones not seen, with the place in the queue and never a replaced job", async () => {
    const user = await createTestUser("ai-shown");
    const running = await enqueueImport(user);
    const queued = await enqueueImport(user);
    const done = await enqueue(user, { kind: "analyze", context: { siteId, location: "Kyl" } });
    await claimAiJobIn(user.db, running.job.id, inFuture(130));

    const shown = toAiJobs(await loadShownAiJobsIn(user.db), Date.now());
    expect(shown.map((job) => [job.id, job.status, job.ahead])).toEqual([
      [done.job.id, "queued", 2],
      [queued.job.id, "queued", 1],
      [running.job.id, "running", 0],
    ]);
  });

  it("reads one job's result, and whether the user has a job that is active or began or ended lately", async () => {
    const user = await createTestUser("ai-activity");
    const since = new Date(Date.now() - 180_000);
    expect(await loadAiJobActivityIn(user.db, since)).toEqual({ active: false, recent: false });

    const { job } = await enqueueImport(user);
    expect(await loadAiJobActivityIn(user.db, since)).toEqual({ active: true, recent: false });
    await claimAiJobIn(user.db, job.id, inFuture(130));
    expect(await loadAiJobActivityIn(user.db, since)).toEqual({ active: true, recent: true });
    await finishAiJobIn(user.db, job.id, { status: "done", result: { recipe: {} } });
    expect(await loadAiJobActivityIn(user.db, since)).toEqual({ active: false, recent: true });
    expect(await loadAiJobActivityIn(user.db, new Date(Date.now() + 60_000))).toEqual({ active: false, recent: false });

    const row = await loadAiJobIn(user.db, job.id);
    expect(row?.result).toEqual({ recipe: {} });
  });
});
