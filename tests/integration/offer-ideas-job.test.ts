import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { weekStartOf } from "@/features/offers/domain/week";
import { claimSetIn, finishSetIn, loadSetIn } from "@/features/suggestions/data/offer-idea-set";
import { loadIdeaTargets } from "../../scripts/offer-ideas/job.ts";
import { adminClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// The ideas step of the scheduled offers job against local Supabase, with the mock AI: it picks the households
// that have offers and no ready set (and the member to act as), the route prepares the set as that member under
// RLS for their household only, and the claim keeps a rerun from making a second set.

let POST: (request: Request) => Promise<Response>;
let a: TestUser;
let a2: TestUser;
let b: TestUser;
let c: TestUser;
let householdA: string;
let householdB: string;
let householdC: string;
const now = new Date();
const week = weekStartOf(now);

async function addOffer(user: TestUser, label: string): Promise<void> {
  const store = await user.db.from("store").insert({ name: "Jobbutik", chain: "ICA" }).select("id").single();
  if (store.error) throw store.error;
  const offer = await user.db
    .from("store_offer")
    .insert({ store_id: store.data.id, week_start: week, label, name: label.toLowerCase(), section: "Chark", source: "link" });
  if (offer.error) throw offer.error;
}

async function prepareAs(user: TestUser): Promise<{ status: number; body: unknown }> {
  const held = await user.db.auth.getSession();
  const session = held.data.session;
  if (!session) throw new Error("no session");
  const response = await POST(
    new Request("http://localhost/api/offer-ideas/prepare", {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}`, "x-refresh-token": session.refresh_token },
    }),
  );
  return { status: response.status, body: await response.json() };
}

async function setsOf(householdId: string) {
  const { data, error } = await adminClient().from("offer_idea_set").select("status, week_start, ideas").eq("household_id", householdId);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  a = await createTestUser("job-a");
  a2 = await createTestUser("job-a2");
  b = await createTestUser("job-b");
  c = await createTestUser("job-c");
  // The app lets in the addresses of ALLOWED_EMAILS, read when the route's modules load: so the route loads after this.
  process.env.ALLOWED_EMAILS = [a, a2, b, c].map((user) => user.email).join(",");
  ({ POST } = await import("@/app/api/offer-ideas/prepare/route"));
  householdA = await householdOf(a.id);
  await moveToHousehold(a2, householdA);
  householdB = await householdOf(b.id);
  householdC = await householdOf(c.id);
  await addOffer(a, "Falukorv");
  await addOffer(b, "Falukorv");
});

afterAll(async () => {
  for (const id of [householdA, householdB, householdC]) await adminClient().from("household").delete().eq("id", id);
  await deleteTestUsers();
});

describe("loadIdeaTargets", () => {
  it("lists households with offers and no ready set, each with its owner, and not one without offers", async () => {
    const targets = (await loadIdeaTargets(adminClient(), now)).filter((target) => [householdA, householdB, householdC].includes(target.householdId));
    expect(targets).toEqual(expect.arrayContaining([{ householdId: householdA, userId: a.id }, { householdId: householdB, userId: b.id }]));
    expect(targets.map((target) => target.householdId)).not.toContain(householdC);
  });

  it("leaves out a household whose set is ready or whose run holds it, but not one that failed", async () => {
    const token = await claimSetIn(b.db, week, false, new Date());
    expect(token).not.toBeNull();
    const ids = async () => (await loadIdeaTargets(adminClient(), now)).map((target) => target.householdId);
    expect(await ids(), "a fresh claim").not.toContain(householdB);
    const idea = { draft: { title: "T" }, ingredientNames: {}, why: "w", onOffer: [], atHome: null, toBuy: [], oldUsed: [], recipeId: "00000000-0000-4000-8000-000000000001" };
    await finishSetIn(b.db, week, token!, { intro: "i", ideas: [idea] as never });
    expect(await ids(), "a ready set").not.toContain(householdB);
    expect(await ids(), "A still waits").toContain(householdA);
    await adminClient().from("offer_idea_set").update({ status: "failed" }).eq("household_id", householdB);
    expect(await ids(), "a failed set is tried again").toContain(householdB);
    await adminClient().from("offer_idea_set").delete().eq("household_id", householdB);
  });
});

describe("POST /api/offer-ideas/prepare", () => {
  it("refuses a request without a session", async () => {
    const response = await POST(new Request("http://localhost/api/offer-ideas/prepare", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await setsOf(householdA)).toEqual([]);
  });

  it("prepares the set for the member's household only, and a rerun by another member makes no second set", async () => {
    const first = await prepareAs(a);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, data: { outcome: "prepared" } });
    const sets = await setsOf(householdA);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ status: "ready", week_start: week });
    expect((sets[0].ideas as unknown[]).length).toBeGreaterThan(0);
    expect(await setsOf(householdB), "B is not touched").toEqual([]);
    expect(await setsOf(householdC), "C is not touched").toEqual([]);

    const again = await prepareAs(a2);
    expect(again.body).toEqual({ ok: true, data: { outcome: "skipped" } });
    expect(await setsOf(householdA)).toHaveLength(1);
    expect(await loadSetIn(a.db, week)).toMatchObject({ status: "ready" });
  });

  it("answers none for a household without offers", async () => {
    expect((await prepareAs(c)).body).toEqual({ ok: true, data: { outcome: "none" } });
    expect(await setsOf(householdC)).toEqual([]);
  });
});
