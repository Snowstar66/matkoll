import "server-only";
import { getOthers } from "@/features/household/server";
import { createClient } from "@/lib/supabase/server";
import { listOpenNotesIn } from "./data/notes";
import type { NoteBoard } from "./domain/note";

// Server-only entry (AD-1): the household's notes for GET /api/notes.

export { NoteDataError } from "./data/notes";

/**
 * The household's open notes for the signed-in member `me`, newest first, and
 * the other members' names. Throws NoteDataError.
 */
export async function getNoteBoard(me: string): Promise<NoteBoard> {
  const others = await getOthers();
  const notes = await listOpenNotesIn(await createClient(), me, others);
  return { notes, others: [...others.values()].map((other) => other.name) };
}
