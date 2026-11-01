import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, deleteTestUsers, type TestUser } from "./support";

// Tyck till och inkorg (Story 20.3, AD-4): everyone signed in can add their own
// feedback; only the app's owner (is_app_owner(), the table app_owner) can read
// it and mark it read. Nobody, the sender included, reads anyone else's, and no
// client can read or change who the owner is. The owner here is a test user
// added to app_owner for this run and removed after it, so the real owner's row
// is never touched.

let owner: TestUser;
let sender: TestUser;
let other: TestUser;
const created: string[] = [];

const idea = { kind: "idea", body: "Dela inköpslistan", area: "inkopslista", page: "/lista", app_version: "0.1.0" };

async function adminFeedback(userId: string) {
  const { data, error } = await adminClient().from("feedback").select("*").eq("user_id", userId).order("created_at");
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  owner = await createTestUser("feedback-owner");
  sender = await createTestUser("feedback-sender");
  other = await createTestUser("feedback-other");
  const added = await adminClient().from("app_owner").insert({ email: owner.email });
  expect(added.error).toBeNull();
  created.push(owner.email);
});

afterAll(async () => {
  if (created.length > 0) await adminClient().from("app_owner").delete().in("email", created);
  await deleteTestUsers();
});

describe("feedback", () => {
  it("lets a user add their own, with the sender, time and unread set by the database", async () => {
    const sent = await sender.db.from("feedback").insert(idea);
    expect(sent.error).toBeNull();
    const rows = await adminFeedback(sender.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...idea, user_id: sender.id, sender_email: sender.email, read_at: null, stars: null });
  });

  it("refuses a row in another's name, and the columns the database sets", async () => {
    for (const extra of [{ user_id: other.id }, { sender_email: owner.email }, { read_at: new Date().toISOString() }, { created_at: "2000-01-01T00:00:00Z" }]) {
      const attempt = await sender.db.from("feedback").insert({ ...idea, ...extra } as never);
      expect(attempt.error?.code, JSON.stringify(Object.keys(extra))).toBe("42501");
    }
    expect(await adminFeedback(other.id)).toHaveLength(0);
  });

  it("does not let the sender, another user or anon read, change or delete any of it", async () => {
    const [row] = await adminFeedback(sender.id);
    const before = await adminFeedback(sender.id);
    for (const [who, db] of [
      ["the sender", sender.db],
      ["another user", other.db],
    ] as const) {
      expect((await db.from("feedback").select("*")).data, `${who} reads`).toEqual([]);
      expect((await db.from("feedback").select("id", { count: "exact", head: true })).count, `${who} counts`).toBe(0);
      const marks = await db.from("feedback").update({ read_at: new Date().toISOString() }).eq("id", row!.id).select("id");
      expect(marks.error ? [] : marks.data, `${who} marks read`).toEqual([]);
      expect((await db.from("feedback").update({ body: "ändrat" }).eq("id", row!.id)).error?.code, `${who} edits`).toBe("42501");
      expect((await db.from("feedback").delete().eq("id", row!.id)).error?.code, `${who} deletes`).toBe("42501");
      expect((await db.rpc("is_app_owner")).data, `${who} is not the owner`).toBe(false);
    }
    const anon = anonClient();
    expect((await anon.from("feedback").select("id")).error?.code, "anon reads").toBe("42501");
    expect((await anon.from("feedback").insert(idea)).error?.code, "anon inserts").toBe("42501");
    expect((await anon.from("feedback").update({ read_at: new Date().toISOString() }).eq("id", row!.id)).error?.code, "anon marks").toBe("42501");
    expect((await anon.from("feedback").delete().eq("id", row!.id)).error?.code, "anon deletes").toBe("42501");
    expect((await anon.rpc("is_app_owner")).error?.code, "anon asks who owns").toBe("42501");
    expect(await adminFeedback(sender.id), "nothing changed").toEqual(before);
  });

  it("lets the owner read everyone's and mark it read, but neither edit nor delete it", async () => {
    expect((await owner.db.rpc("is_app_owner")).data).toBe(true);
    await other.db.from("feedback").insert({ kind: "rating", stars: 2, body: "", page: "/hjalp", app_version: "0.1.0" });
    const all = await owner.db.from("feedback").select("id, user_id, sender_email, kind, stars, read_at").in("user_id", [sender.id, other.id]);
    expect(all.error).toBeNull();
    expect(all.data?.map((row) => [row.sender_email, row.kind, row.stars]).sort()).toEqual(
      [
        [sender.email, "idea", null],
        [other.email, "rating", 2],
      ].sort(),
    );
    const unread = await owner.db.from("feedback").select("id", { count: "exact", head: true }).is("read_at", null).in("user_id", [sender.id, other.id]);
    expect(unread.count).toBe(2);

    const target = all.data!.find((row) => row.user_id === sender.id)!;
    const marked = await owner.db.from("feedback").update({ read_at: new Date().toISOString() }).eq("id", target.id).select("id, read_at");
    expect(marked.error).toBeNull();
    expect(marked.data?.[0]?.read_at).not.toBeNull();

    expect((await owner.db.from("feedback").update({ body: "ändrat" }).eq("id", target.id)).error?.code, "owner edits").toBe("42501");
    expect((await owner.db.from("feedback").delete().eq("id", target.id)).error?.code, "owner deletes").toBe("42501");
    expect((await adminFeedback(sender.id))[0]?.body).toBe(idea.body);
  });

  it("keeps who the owner is out of every client's reach, the owner's included", async () => {
    for (const [who, db] of [
      ["the owner", owner.db],
      ["another user", other.db],
      ["anon", anonClient()],
    ] as const) {
      expect((await db.from("app_owner").select("email")).error?.code, `${who} reads app_owner`).toBe("42501");
      expect((await db.from("app_owner").insert({ email: "x@example.se" })).error?.code, `${who} adds an owner`).toBe("42501");
      expect((await db.from("app_owner").delete().eq("email", owner.email)).error?.code, `${who} removes the owner`).toBe("42501");
    }
  });

  it("checks the content: a rating has 1 to 5 stars, an idea and a problem a text, at most 2000 characters, a known area and a path", async () => {
    const bad = [
      { kind: "rating", stars: 0, body: "" },
      { kind: "rating", stars: 6, body: "" },
      { kind: "rating", body: "inga stjärnor" },
      { kind: "idea", stars: 3, body: "med stjärnor" },
      { kind: "idea", body: "   " },
      { kind: "problem", body: "x".repeat(2001) },
      { kind: "idea", body: "x", area: "kyl" },
      { kind: "idea", body: "x", page: "https://example.se" },
      { kind: "praise", body: "x" },
    ];
    for (const row of bad) {
      expect((await other.db.from("feedback").insert(row as never)).error?.code, JSON.stringify(row).slice(0, 60)).toBe("23514");
    }
  });

  it("stops a sender after 10 messages in an hour", async () => {
    const spammer = await createTestUser("feedback-spammer");
    for (let index = 0; index < 10; index++) {
      expect((await spammer.db.from("feedback").insert({ kind: "idea", body: `Förslag ${index}` })).error, `message ${index + 1}`).toBeNull();
    }
    expect((await spammer.db.from("feedback").insert({ kind: "idea", body: "En för mycket" })).error?.code).toBe("MK429");
    expect(await adminFeedback(spammer.id)).toHaveLength(10);
  });

  it("goes with the user when the user is deleted", async () => {
    const leaver = await createTestUser("feedback-leaver");
    await leaver.db.from("feedback").insert({ kind: "problem", body: "Något hände" });
    expect(await adminFeedback(leaver.id)).toHaveLength(1);
    expect((await adminClient().auth.admin.deleteUser(leaver.id)).error).toBeNull();
    expect(await adminFeedback(leaver.id)).toHaveLength(0);
  });
});
