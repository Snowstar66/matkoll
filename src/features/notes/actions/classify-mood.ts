import "server-only";
import { getAiServiceForUser } from "@/features/settings/server";
import type { AvatarMood } from "../domain/note";

// The one cheap text call that gives a note without a mood emoji the look of
// its avatar (Story 24.2, AD-9): the text in, one word out. It runs before the
// note is saved but never holds it up: a short deadline, and any failure (no
// AI, a slow model, a strange answer) gives null, which the avatar shows as
// neutral. Only a code is logged, never the text.

/** How long a note may wait for the AI before it is sent without a mood. */
export const classifyDeadlineMs = 4_000;

/** The mood the AI judges `text` to have, or null when it does not answer in time. */
export async function classifyNoteAvatarMood(text: string): Promise<AvatarMood | null> {
  try {
    const answered = await (await getAiServiceForUser()).classifyNoteMood({ text }, AbortSignal.timeout(classifyDeadlineMs + 1_000), {
      deadline: Date.now() + classifyDeadlineMs,
    });
    if (answered.ok) return answered.data.mood;
    console.error("note_mood_failed", { code: answered.error.code });
  } catch {
    console.error("note_mood_failed", { code: "exception" });
  }
  return null;
}
