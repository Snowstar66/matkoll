import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadTourSeenIn, saveTourSeenIn } from "@/features/welcome/data/welcome-tour";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation } from "./support";

// The welcome tour's "seen" row against local Supabase (Story 20.1, AD-4):
// one row per user, read and added only by its user, never changed or removed
// by them, and a second "seen" keeps the first time.

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("welcome_tour", () => {
  it("isolates the row per user", async () => {
    await expectRlsIsolation("welcome_tour", async () => ({ tour_seen_at: new Date().toISOString() }));
  });

  it("is unseen for a new user, seen once saved, and keeps the first time", async () => {
    const user = await createTestUser("welcome-new");
    expect(await loadTourSeenIn(user.db)).toBe(false);
    await saveTourSeenIn(user.db);
    expect(await loadTourSeenIn(user.db)).toBe(true);
    const first = (await adminClient().from("welcome_tour").select("tour_seen_at").eq("user_id", user.id).single()).data!.tour_seen_at;
    await saveTourSeenIn(user.db);
    const rows = (await adminClient().from("welcome_tour").select("tour_seen_at").eq("user_id", user.id)).data!;
    expect(rows).toEqual([{ tour_seen_at: first }]);
  });

  it("does not let a user change, remove or double their own row, or set another user", async () => {
    const user = await createTestUser("welcome-own");
    const other = await createTestUser("welcome-other");
    await saveTourSeenIn(user.db);
    const before = (await adminClient().from("welcome_tour").select("*").eq("user_id", user.id)).data;
    expect((await user.db.from("welcome_tour").update({ tour_seen_at: "2000-01-01T00:00:00Z" }).eq("user_id", user.id)).error?.code).toBe("42501");
    expect((await user.db.from("welcome_tour").delete().eq("user_id", user.id)).error?.code).toBe("42501");
    expect((await user.db.from("welcome_tour").insert({ tour_seen_at: new Date().toISOString() })).error?.code).toBe("23505");
    expect((await user.db.from("welcome_tour").insert({ user_id: other.id })).error?.code).toBe("42501");
    expect((await adminClient().from("welcome_tour").select("*").eq("user_id", user.id)).data).toEqual(before);
    expect(await loadTourSeenIn(other.db), "the other user has not seen it").toBe(false);
  });

  it("refuses anon outright", async () => {
    const anon = anonClient();
    expect((await anon.from("welcome_tour").select("id")).error?.code).toBe("42501");
    expect((await anon.from("welcome_tour").insert({ tour_seen_at: new Date().toISOString() })).error?.code).toBe("42501");
  });
});
