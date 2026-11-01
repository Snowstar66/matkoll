import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Others } from "@/features/household";
import { initialOf } from "@/features/household";
import type { Database } from "@/lib/supabase/database.types";
import { type NoteAuthor, type NoteView, noteMaxDays, parseNoteActions, type ValidNoteInput } from "../domain/note";

// The table household_note (Story 24.1, supabase/migrations/…_household_note.sql).
// Every call runs with the signed-in member's session: RLS gives the household's
// notes, the insert names the caller as author (the database fills user_id and
// household_id, which the client may not choose) and only done_at may change.
// Errors carry a fixed reason and the database's code, never a note's text.

export type NotesDb = SupabaseClient<Database>;

export class NoteDataError extends Error {
  constructor(readonly detail: string) {
    super(`note_data: ${detail}`);
    this.name = "NoteDataError";
  }
}

/** The most notes the app reads at once (a household writes a handful a week). */
const readLimit = 50;

/** Someone who wrote a note and is no longer in the household (or whose account is gone). */
const someone: NoteAuthor = { name: "Någon", initial: "N", tone: "sand" };

/**
 * The household's open notes, newest first: not marked Klar, and at most
 * noteMaxDays old. `me` is the signed-in member; `others` names the rest.
 */
export async function listOpenNotesIn(db: NotesDb, me: string, others: Others, now: Date = new Date()): Promise<NoteView[]> {
  const since = new Date(now.getTime() - noteMaxDays * 24 * 60 * 60_000).toISOString();
  const { data, error } = await db
    .from("household_note")
    .select("id, user_id, text, mood, actions, created_at")
    .is("done_at", null)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(readLimit);
  if (error) throw new NoteDataError(`list_failed ${error.code}`);
  return data.map((row) => {
    const mine = row.user_id === me;
    const other = row.user_id ? others.get(row.user_id) : undefined;
    const author: NoteAuthor = mine
      ? { name: "Du", initial: "", tone: "mint" }
      : other
        ? { name: other.name, initial: initialOf(other.name), tone: other.tone }
        : someone;
    return {
      id: row.id,
      text: row.text,
      mood: row.mood,
      actions: parseNoteActions(row.actions),
      createdAt: row.created_at,
      mine,
      author,
    };
  });
}

/** Adds a note as the signed-in member. `limited` after noteDailyLimit notes in a day (MK429). */
export async function insertNoteIn(db: NotesDb, input: ValidNoteInput): Promise<"sent" | "limited"> {
  const { error } = await db.from("household_note").insert({
    text: input.text,
    mood: input.mood,
    actions: input.actions,
    reply_to: input.replyTo,
  });
  if (error?.code === "MK429") return "limited";
  if (error) throw new NoteDataError(`insert_failed ${error.code}`);
  return "sent";
}

/** Klar (`done`) or its Ångra: the database stamps the time and who pressed it. False when no such open/done note is the household's. */
export async function setNoteDoneIn(db: NotesDb, id: string, done: boolean): Promise<boolean> {
  const query = db
    .from("household_note")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  const { data, error } = await (done ? query.is("done_at", null) : query.not("done_at", "is", null)).select("id");
  if (error) throw new NoteDataError(`done_failed ${error.code}`);
  return data.length > 0;
}
