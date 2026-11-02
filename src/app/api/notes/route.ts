import { requireUserForRoute } from "@/features/auth/server";
import { getNoteBoard, NoteDataError } from "@/features/notes/server";

// Lappen på kylskåpet (Story 24.1): the household's open notes, newest first,
// and the other members' names. The note card reads this when the app starts
// and then on the live pace of Story 17.12 (every 10 s while the tab is seen),
// with the session's own cookies; nothing is cached.

const headers = { "cache-control": "no-store, private" };

export async function GET(): Promise<Response> {
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;
  try {
    return Response.json({ ok: true, data: await getNoteBoard(auth.user.id) }, { headers });
  } catch (error) {
    if (!(error instanceof NoteDataError)) throw error;
    console.error("note_unavailable", { reason: error.detail });
    return Response.json({ ok: false }, { status: 500, headers });
  }
}
