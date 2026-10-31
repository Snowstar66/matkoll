"use server";

import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { loadThingIndexIn } from "../data/index";
import { questionSchema, refLabel, type AskRef } from "../domain/thing-ask";
import { buildAskInput } from "./ask-input";

// "Fråga om dina prylar" (Story 18.4, FR-24, AD-9). A short call, so it is
// answered in the request itself (a Server Action) and not as an AI job:
// the model gets a question and a few thousand characters of text and answers
// in a few sentences, which Haiku does in seconds and Qwen in well under a
// minute, and Pontus is waiting for exactly this answer. The page sets
// maxDuration to 60 s and the call gets 45 s of it. The lists are read here,
// on the server, from the user's own rows; the browser sends only the
// question. Text only: the photos never reach the model. The AI choice of
// Inställningar applies (Story 17.5). Only counts and codes are logged, never
// the question, a name or an answer.

/** The time the model gets: within the page's maxDuration of 60 s. */
const askDeadlineMs = 45_000;

export type AskAnswer = { answer: string; refs: AskRef[] };

/**
 * Answers `question` from the things on the user's cards. The answer's
 * references are places that are really in the lists, with a label for the
 * chip. Fails with `unauthorized`, `validation` (the text in `fields.question`),
 * `things_ask_empty` (nothing to ask about), `things_unavailable`, or the AI
 * port's `ai_unavailable`, `ai_rejected` and `ai_invalid`.
 */
export async function askAboutThings(question: string): Promise<Result<AskAnswer>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) return fail("validation", { question: "Skriv en fråga." });

  let built;
  try {
    built = buildAskInput(await loadThingIndexIn(await createClient()), parsed.data);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }
  if (!built) return fail("things_ask_empty");

  const answered = await (await getAiServiceForUser()).askThings(built.input, AbortSignal.timeout(askDeadlineMs + 5_000), {
    deadline: Date.now() + askDeadlineMs,
  });
  if (!answered.ok) return answered;
  const refs = answered.data.places.flatMap((index) => {
    const place = built.used[index];
    return place ? [{ placeId: place.id, label: refLabel(place) }] : [];
  });
  console.info("things_asked", { places: built.input.places.length, refs: refs.length });
  return ok({ answer: answered.data.answer, refs });
}
