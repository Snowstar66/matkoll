import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimSetIn, failSetIn, finishSetIn, loadSetIn } from "@/features/suggestions/data/offer-idea-set";
import { staleSetMs, toOfferIdeasView } from "@/features/suggestions/domain/offer-idea-set";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// The saved "Nya idéer med extrapris": one row per household and offer week, claimed by one run at a time,
// replaced by "Andra idéer", and never visible or writable to another household or anon.
// household-isolation.test.ts tries the table against B and anon with the other tables; this file tries
// the claim and the saved set.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
const week = "2026-11-02";

const ideaId = "00000000-0000-4000-8000-000000000001";
const idea = {
  draft: { title: "Falukorv med potatismos", servings: 4, totalMinutes: 30, imageUrl: null, sourceKind: "ai", sourceUrl: null, steps: [], lines: [] },
  ingredientNames: {},
  why: "Falukorven är billig.",
  onOffer: ["Falukorv"],
  atHome: null,
  toBuy: [],
  oldUsed: [],
  recipeId: ideaId,
};

beforeAll(async () => {
  a = await createTestUser("ideas-a");
  a2 = await createTestUser("ideas-a2");
  b = await createTestUser("ideas-b");
  householdA = await householdOf(a.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

describe("offer_idea_set", () => {
  it("is claimed by one run: a second claim of a pending set gets nothing, also from another member", async () => {
    const token = await claimSetIn(a.db, week, false, new Date());
    expect(token).not.toBeNull();
    expect(await claimSetIn(a.db, week, false, new Date())).toBeNull();
    expect(await claimSetIn(a2.db, week, false, new Date())).toBeNull();
    expect(await claimSetIn(a2.db, week, true, new Date()), "replace does not take a pending set either").toBeNull();
    expect(await loadSetIn(a2.db, week)).toMatchObject({ status: "pending", ideas: [] });
    expect(toOfferIdeasView(await loadSetIn(a.db, week), [], new Date()).state).toBe("pending");
    await failSetIn(a.db, week, token!, "ai_unavailable");
  });

  it("takes a failed set over, and a pending set whose run is gone", async () => {
    expect(toOfferIdeasView(await loadSetIn(a.db, week), [], new Date())).toMatchObject({ state: "failed", errorCode: "ai_unavailable" });
    const second = await claimSetIn(a2.db, week, false, new Date());
    expect(second).not.toBeNull();
    expect(await claimSetIn(a.db, week, false, new Date(Date.now() + 1000))).toBeNull();
    const later = new Date(Date.now() + staleSetMs + 1000);
    expect(toOfferIdeasView(await loadSetIn(a.db, week), [], later).state, "no run holds it any more").toBe("none");
    const taken = await claimSetIn(a.db, week, false, later);
    expect(taken).not.toBeNull();
    // The run that was taken over can no longer write its answer.
    await finishSetIn(a2.db, week, second!, { intro: "gammal", ideas: [] });
    expect(await loadSetIn(a.db, week)).toMatchObject({ status: "pending", intro: "" });
    await finishSetIn(a.db, week, taken!, { intro: "Billigt i veckan.", ideas: [idea] as never });
  });

  it("keeps the ready set for the household, and drops an idea that is a recipe already", async () => {
    const row = await loadSetIn(a2.db, week);
    expect(row).toMatchObject({ status: "ready", intro: "Billigt i veckan." });
    const view = toOfferIdeasView(row, [], new Date());
    expect(view).toMatchObject({ state: "ready", intro: "Billigt i veckan.", ideas: [{ recipeId: ideaId, why: "Falukorven är billig." }] });
    expect(toOfferIdeasView(row, ["falukorv med potatismos"], new Date()).ideas).toEqual([]);
    expect(await claimSetIn(a.db, week, false, new Date()), "a ready set is not claimed without replace").toBeNull();
  });

  it("replaces the ready set on Andra idéer, still one row for the week", async () => {
    const token = await claimSetIn(a.db, week, true, new Date());
    expect(token).not.toBeNull();
    await finishSetIn(a.db, week, token!, { intro: "Nytt.", ideas: [{ ...idea, recipeId: "00000000-0000-4000-8000-000000000002" }] as never });
    const rows = await adminClient().from("offer_idea_set").select("intro").eq("household_id", householdA).eq("week_start", week);
    expect(rows.data).toEqual([{ intro: "Nytt." }]);
  });

  it("keeps a set per offer week", async () => {
    expect(await claimSetIn(a.db, "2026-11-09", false, new Date())).not.toBeNull();
    const rows = await adminClient().from("offer_idea_set").select("week_start").eq("household_id", householdA).order("week_start");
    expect(rows.data).toEqual([{ week_start: week }, { week_start: "2026-11-09" }]);
  });

  it("is invisible and untouchable for another household and for anon", async () => {
    expect(await loadSetIn(b.db, week)).toBeNull();
    expect((await b.db.from("offer_idea_set").select("id")).data).toEqual([]);
    // B has its own set for the same week, and it does not touch A's.
    const own = await claimSetIn(b.db, week, false, new Date());
    expect(own).not.toBeNull();
    await finishSetIn(b.db, week, own!, { intro: "B:s", ideas: [] });
    expect(await loadSetIn(a.db, week)).toMatchObject({ intro: "Nytt." });
    // B cannot write into A's household, nor change a row's household.
    const stolen = await b.db.from("offer_idea_set").insert({ week_start: "2026-11-16", household_id: householdA });
    expect(stolen.error?.code).toBe("42501");
    const moved = await b.db.from("offer_idea_set").update({ intro: "hackad" }).eq("household_id", householdA).select("id");
    expect(moved.data).toEqual([]);
    expect((await b.db.from("offer_idea_set").delete().eq("household_id", householdA).select("id")).data).toEqual([]);
    expect(await loadSetIn(a.db, week)).toMatchObject({ intro: "Nytt." });
    expect((await anonClient().from("offer_idea_set").select("id")).error?.code).toBe("42501");
  });

  it("refuses a status or an idea list the app never writes", async () => {
    const status = await a.db.from("offer_idea_set").insert({ week_start: "2026-11-23", status: "done" });
    expect(status.error?.code).toBe("23514");
    const ideas = await adminClient().from("offer_idea_set").insert({ household_id: householdA, week_start: "2026-11-30", ideas: { not: "a list" } });
    expect(ideas.error?.code).toBe("23514");
  });
});
