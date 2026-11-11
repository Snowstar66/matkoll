import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finishDraftIn, finishDraftUsedIn, readDraftAnyStatusIn, readDraftIn, reopenUsedDraftIn, readSettingsIn, saveDraftIn, saveSettingsIn, updateDraftIn } from "@/features/week-agent/data/week-agent";
import { defaultWeekAgentSettings } from "@/features/week-agent/domain/settings";
import type { WeekProposal } from "@/features/week-agent/domain/types";
import { adminClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// Veckoagenten: settings and drafts are the household's, read and written by its members only; the checks refuse what
// the app would not write; and a dish on Matsedel can remember who put it there. household-isolation.test.ts tries
// both tables against B and anon with the other tables; this file tries what is particular to them.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;

const week = "2026-11-16";
const emptyDay = (dayIndex: number) => ({ dayIndex, slot: "skip" as const, recipeId: null, title: null, source: "proposed" as const, locked: false, reasons: [], offerTags: [], useSoonTags: [], allergyWarning: null });
const proposal = (weekStart = week): WeekProposal => ({ weekStart, days: [1, 2, 3, 4, 5, 6, 7].map(emptyDay) });

beforeAll(async () => {
  a = await createTestUser("wa-a");
  a2 = await createTestUser("wa-a2");
  b = await createTestUser("wa-b");
  householdA = await householdOf(a.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

describe("household_week_agent_settings", () => {
  it("is the defaults until saved, then one row per household that every member reads and changes", async () => {
    expect(await readSettingsIn(a.db)).toEqual(defaultWeekAgentSettings);
    await saveSettingsIn(a.db, { ...defaultWeekAgentSettings, dinners: 4, budget: "low", skipDays: [6] });
    expect(await readSettingsIn(a2.db)).toMatchObject({ dinners: 4, budget: "low", skipDays: [6] });
    await saveSettingsIn(a2.db, { ...defaultWeekAgentSettings, dinners: 6 });
    expect(await readSettingsIn(a.db)).toMatchObject({ dinners: 6, budget: "normal" });
    const rows = await adminClient().from("household_week_agent_settings").select("household_id, user_id").eq("household_id", householdA);
    expect(rows.data).toEqual([{ household_id: householdA, user_id: a.id }]);
  });

  it("never shows another household's settings", async () => {
    await saveSettingsIn(b.db, { ...defaultWeekAgentSettings, dinners: 3 });
    expect((await readSettingsIn(a.db)).dinners).toBe(6);
    expect((await readSettingsIn(b.db)).dinners).toBe(3);
  });

  it("refuses what the app would not write", async () => {
    const insert = (settings: unknown) => a.db.from("household_week_agent_settings").update({ settings: settings as never }).eq("household_id", householdA);
    for (const bad of [{ dinners: 9 }, { dinners: "5" }, { budget: "cheap" }, { skipDays: [0] }, { skipDays: "mån" }, { unknown: 1 }, [], { offerStoreIds: ["x"] }, { quickWeekdays: 1 }]) {
      expect((await insert(bad)).error, JSON.stringify(bad)).not.toBeNull();
    }
    expect((await insert({ dinners: 5, offerStoreIds: ["11111111-1111-4111-8111-111111111111"] })).error).toBeNull();
  });

  it("does not let a member move the row to another household or delete it", async () => {
    const moved = await a.db.from("household_week_agent_settings").update({ household_id: (await householdOf(b.id)) as never }).eq("household_id", householdA);
    expect(moved.error).not.toBeNull();
    const removed = await a.db.from("household_week_agent_settings").delete().eq("household_id", householdA);
    expect(removed.error).not.toBeNull();
  });
});

describe("week_agent_proposals", () => {
  it("keeps one draft per week: a new one replaces the old, and both phones see it", async () => {
    const first = await saveDraftIn(a.db, week, proposal(), "haiku");
    const second = await saveDraftIn(a2.db, week, proposal(), "sonnet");
    expect(second).not.toBe(first);
    const draft = await readDraftIn(a.db, week);
    expect(draft).toMatchObject({ id: second, status: "draft", model: "sonnet", weekStart: week });
    const all = await adminClient().from("week_agent_proposals").select("id, status").eq("household_id", householdA).eq("week_start", week);
    expect(all.data?.find((row) => row.id === first)?.status).toBe("discarded");
  });

  it("changes a draft and finishes it once", async () => {
    const draft = (await readDraftIn(a.db, week))!;
    expect(await updateDraftIn(a2.db, draft.id, proposal(), "haiku")).toBe(true);
    expect(await finishDraftIn(a.db, draft.id, "used")).toBe(true);
    expect(await finishDraftIn(a.db, draft.id, "used")).toBe(false);
    expect(await updateDraftIn(a.db, draft.id, proposal(), "haiku")).toBe(false);
    expect(await readDraftIn(a.db, week)).toBeNull();
  });

  it("keeps what 'Använd veckan' did on the used draft for Ångra, and reopens it once (as a draft, or discarded when the week has a newer draft)", async () => {
    const wk = "2026-12-07";
    const applied = { writtenDays: [1, 3], replaced: [{ id: "30000000-0000-4000-8000-000000000001", recipeId: "30000000-0000-4000-8000-000000000002", recipeTitle: "Pannkaka", servings: 4, weekday: 3, source: null }] };
    const id = await saveDraftIn(a.db, wk, proposal(wk), "haiku");
    expect(await finishDraftUsedIn(a.db, id, proposal(wk), applied)).toBe(true);
    expect(await finishDraftUsedIn(a.db, id, proposal(wk), applied)).toBe(false);
    expect(await readDraftAnyStatusIn(b.db, id)).toBeNull();
    expect(await readDraftAnyStatusIn(a2.db, id)).toMatchObject({ id, status: "used", weekStart: wk, applied });
    expect(await readDraftIn(a.db, wk)).toBeNull();

    expect(await reopenUsedDraftIn(b.db, id, proposal(wk))).toBeNull();
    expect(await reopenUsedDraftIn(a2.db, id, proposal(wk))).toBe("draft");
    expect(await reopenUsedDraftIn(a2.db, id, proposal(wk))).toBeNull();
    expect(await readDraftAnyStatusIn(a.db, id)).toMatchObject({ status: "draft", applied: null });

    // Used again, then a newer draft is made for the week: the reopen ends as discarded instead of breaking the one-draft rule.
    expect(await finishDraftUsedIn(a.db, id, proposal(wk), applied)).toBe(true);
    const newer = await saveDraftIn(a.db, wk, proposal(wk), "sonnet");
    expect(await reopenUsedDraftIn(a.db, id, proposal(wk))).toBe("discarded");
    expect((await readDraftIn(a.db, wk))?.id).toBe(newer);
  });

  it("is invisible and untouchable from another household", async () => {
    const id = await saveDraftIn(a.db, "2026-11-23", proposal("2026-11-23"), "rules");
    expect(await readDraftIn(b.db, "2026-11-23")).toBeNull();
    expect(await finishDraftIn(b.db, id, "discarded")).toBe(false);
    expect((await readDraftIn(a.db, "2026-11-23"))?.id).toBe(id);
  });

  it("refuses what the app would not write", async () => {
    const insert = (values: Record<string, unknown>) => a.db.from("week_agent_proposals").insert({ week_start: "2026-11-30", proposal: proposal("2026-11-30"), ...values } as never);
    expect((await insert({ week_start: "2026-12-01" })).error, "a Tuesday").not.toBeNull();
    expect((await insert({ status: "kept" })).error).not.toBeNull();
    expect((await insert({ proposal: { days: "x" } })).error).not.toBeNull();
    expect((await insert({ proposal: { weekStart: week, days: Array.from({ length: 8 }, (_, i) => emptyDay(i)) } })).error).not.toBeNull();
    expect((await insert({ model: "" })).error).not.toBeNull();
    expect((await insert({ household_id: await householdOf(b.id) })).error, "into another household").not.toBeNull();
    expect((await insert({})).error).toBeNull();
  });
});

describe("meal_plan_recipe.source", () => {
  it("is empty for a row written the old way, and accepts only user or week_agent", async () => {
    const plan = await a.db.from("meal_plan").insert({ name: "Veckoagenttest" } as never).select("id").single();
    expect(plan.error).toBeNull();
    const planId = (plan.data as unknown as { id: string }).id;
    const row = (values: Record<string, unknown>) => a.db.from("meal_plan_recipe").insert({ meal_plan_id: planId, recipe_title: "Pannkaka", servings: 4, position: 1, ...values } as never).select("id, source").single();
    expect((await row({})).data).toMatchObject({ source: null });
    expect((await row({ source: "week_agent", position: 2 })).data).toMatchObject({ source: "week_agent" });
    expect((await row({ source: "user", position: 3 })).data).toMatchObject({ source: "user" });
    expect((await row({ source: "robot", position: 4 })).error).not.toBeNull();
  });
});
