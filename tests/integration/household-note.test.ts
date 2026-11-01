import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertNoteIn, listOpenNotesIn, setNoteDoneIn } from "@/features/notes/data/notes";
import { noteDailyLimit } from "@/features/notes";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// Lappen på kylskåpet (Story 24.1): a note is the household's, written as the
// caller and nobody else, changed only by Klar (stamped by the database), not
// shown after 7 days or once done, cleared on the next note, and limited to 20
// a day per member. household-isolation.test.ts tries the table against B and
// anon with the other tables; this file tries what is particular to notes.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;

const others = (user: TestUser, name: string) => new Map([[user.id, { name, tone: "sky" as const }]]);
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();

async function write(user: TestUser, text: string, extra: Record<string, unknown> = {}) {
  return user.db.from("household_note").insert({ text, ...extra }).select("id, user_id, household_id").single();
}

beforeAll(async () => {
  a = await createTestUser("note-a");
  a2 = await createTestUser("note-a2");
  b = await createTestUser("note-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

describe("household_note", () => {
  it("is written as the caller into the caller's household and read by the household only", async () => {
    const sent = await insertNoteIn(a.db, { text: "Sugen på fisksoppa idag, kan du handla?", mood: "love", actions: [{ kind: "list" }], replyTo: null });
    expect(sent).toBe("sent");
    const forA2 = await listOpenNotesIn(a2.db, a2.id, others(a, "Pontus"));
    const note = forA2.find((candidate) => candidate.text.startsWith("Sugen på fisksoppa"));
    expect(note).toMatchObject({ mine: false, mood: "love", actions: [{ kind: "list" }], author: { name: "Pontus", initial: "P", tone: "sky" } });
    expect((await listOpenNotesIn(a.db, a.id, new Map())).find((candidate) => candidate.id === note!.id)?.mine).toBe(true);
    expect(await listOpenNotesIn(b.db, b.id, new Map()), "B sees none of A's notes").toEqual([]);
    expect((await anonClient().from("household_note").select("id")).error?.code).toBe("42501");
  });

  it("never lets the caller name another author or household, or change a note's text", async () => {
    expect((await write(a, "Som a2", { user_id: a2.id })).error?.code, "user_id").toBe("42501");
    expect((await write(b, "In i A", { household_id: householdA })).error?.code, "household_id").toBe("42501");
    expect((await write(a, "Redan klar", { done_at: new Date().toISOString() })).error?.code, "done_at on insert").toBe("42501");
    const own = await write(a, "Min lapp");
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject({ user_id: a.id, household_id: householdA });
    const id = own.data!.id;
    expect((await a2.db.from("household_note").update({ text: "Ändrad" }).eq("id", id)).error?.code, "text").toBe("42501");
    expect((await a2.db.from("household_note").update({ done_by: a.id }).eq("id", id)).error?.code, "done_by").toBe("42501");
    expect((await a2.db.from("household_note").delete().eq("id", id)).error?.code, "delete").toBe("42501");
    // B cannot answer A's note: the reply must be in the same household.
    expect((await write(b, "Svar", { reply_to: id })).error, "B replies to A's note").not.toBeNull();
  });

  it("marks Klar as the one who pressed it, now, whatever the client sends; Ångra opens it again", async () => {
    const own = await write(a, "Kan någon ta soporna?");
    const id = own.data!.id;
    const answer = await a.db.from("household_note").insert({ text: "Ja, jag fixar det", reply_to: id }).select("reply_to").single();
    expect(answer.data?.reply_to, "a2 or a answers within the household").toBe(id);
    const sent = await a2.db.from("household_note").update({ done_at: "2000-01-01T00:00:00Z" }).eq("id", id).select("done_at, done_by").single();
    expect(sent.error).toBeNull();
    expect(sent.data!.done_by).toBe(a2.id);
    expect(Math.abs(new Date(sent.data!.done_at!).getTime() - Date.now())).toBeLessThan(60_000);
    expect((await listOpenNotesIn(a.db, a.id, new Map())).some((note) => note.id === id), "a done note is not shown").toBe(false);
    expect(await setNoteDoneIn(a.db, id, true), "already done").toBe(false);
    expect(await setNoteDoneIn(b.db, id, false), "B cannot open A's note").toBe(false);
    expect(await setNoteDoneIn(a.db, id, false)).toBe(true);
    const { data } = await adminClient().from("household_note").select("done_at, done_by").eq("id", id).single();
    expect(data).toEqual({ done_at: null, done_by: null });
  });

  it("hides notes older than 7 days and clears the household's old notes on the next note", async () => {
    const admin = adminClient().from("household_note");
    const old = await admin.insert({ text: "Gammal", user_id: a.id, created_at: daysAgo(8) }).select("id").single();
    const week = await admin.insert({ text: "Sex dagar", user_id: a.id, created_at: daysAgo(6) }).select("id").single();
    const doneLong = await admin.insert({ text: "Klar länge", user_id: a.id, created_at: daysAgo(3), done_at: daysAgo(2) }).select("id").single();
    const bOld = await admin.insert({ text: "B:s gamla", user_id: b.id, created_at: daysAgo(8) }).select("id").single();
    const shown = (await listOpenNotesIn(a2.db, a2.id, new Map())).map((note) => note.text);
    expect(shown).toContain("Sex dagar");
    expect(shown).not.toContain("Gammal");
    expect(shown).not.toContain("Klar länge");

    expect((await write(a2, "Ny lapp")).error).toBeNull();
    const left = (await adminClient().from("household_note").select("id").in("id", [old.data!.id, week.data!.id, doneLong.data!.id, bOld.data!.id])).data!.map(
      (row) => row.id,
    );
    expect(left.sort(), "the old and long-done notes of A are gone; B's household is not touched").toEqual([week.data!.id, bOld.data!.id].sort());
  });

  it(`limits a member to ${noteDailyLimit} notes a day, the others in the household not`, async () => {
    const limited = await createTestUser("note-limited");
    await moveToHousehold(limited, householdB);
    const rows = Array.from({ length: noteDailyLimit - 1 }, (_, index) => ({ text: `Lapp ${index}`, user_id: limited.id }));
    expect((await adminClient().from("household_note").insert(rows)).error).toBeNull();
    expect(await insertNoteIn(limited.db, { text: "Den tjugonde", mood: null, actions: [], replyTo: null })).toBe("sent");
    expect(await insertNoteIn(limited.db, { text: "En för mycket", mood: null, actions: [], replyTo: null })).toBe("limited");
    expect(await insertNoteIn(b.db, { text: "B i samma hushåll", mood: null, actions: [], replyTo: null })).toBe("sent");
    // Notes from yesterday do not count.
    await adminClient().from("household_note").update({ created_at: daysAgo(1.1) }).eq("user_id", limited.id);
    expect(await insertNoteIn(limited.db, { text: "Nästa dag", mood: null, actions: [], replyTo: null })).toBe("sent");
  });
});
