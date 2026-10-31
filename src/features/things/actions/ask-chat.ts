"use server";

import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import type { AskThingsPlace } from "@/server/ai";
import { ThingsDataError } from "../data/client";
import { loadUnseenIn, searchThingsIn } from "../data/search";
import { chatInputSchema, cleanHistory, groupHits, maxAnswerHits, questionTooLongText, questionWords, refOfGroup, type ChatRef, type ChatTurn } from "../domain/thing-ask";
import { placeTitle } from "../domain/thing-place";
import { hitDateText } from "../domain/thing-search";

// "Fråga om ditt förråd" as a chat (Story 18.14, FR-24, AD-9). Pontus may have
// thousands of things, so they never all go to the AI. Three steps:
//   1. the AI turns the question (and the latest turns) into search terms;
//   2. the database finds the things whose names hold or are close to them
//      (search_things, typo tolerant, scoped to the user by RLS);
//   3. the AI answers from those things only, with the closed containers and
//      empty boxes of the rooms they are in.
// Two short calls, answered in the request itself (a Server Action, the page's
// maxDuration is 60 s): 15 s for the terms and 30 s for the answer. Text only:
// the photos never reach the model. The conversation lives in the browser; only
// the latest six turns come here, and nothing of them is stored. The AI choice
// of Inställningen applies and both calls are counted (Story 17.6). Only counts
// and codes are logged, never the question, a name or an answer.

const termsDeadlineMs = 15_000;
const answerDeadlineMs = 30_000;
/** At most this many rooms' closed containers go to the model. */
const maxUnseenRooms = 10;

export type ChatAnswer = { answer: string; refs: ChatRef[] };

/**
 * Answers `question` from the things the database finds for it. The refs are
 * cards (or boxes with written things) that really are among the found things.
 * Fails with `unauthorized`, `validation` (the text in `fields.question`),
 * `things_unavailable`, or the AI port's `ai_unavailable`, `ai_rejected` and `ai_invalid`.
 */
export async function askChat(input: { question: string; history: ChatTurn[] }): Promise<Result<ChatAnswer>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = chatInputSchema.safeParse(input);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.path[0] === "question" && issue.message === "too long");
    return fail("validation", { question: tooLong ? questionTooLongText : "Skriv en fråga." });
  }
  const { question } = parsed.data;
  const history = cleanHistory(parsed.data.history, cleanModelText, cutCodePoints);

  const ai = await getAiServiceForUser();
  const termsAnswer = await ai.thingSearchTerms({ question, history }, AbortSignal.timeout(termsDeadlineMs + 5_000), {
    deadline: Date.now() + termsDeadlineMs,
  });
  if (!termsAnswer.ok) return termsAnswer;
  // A question the model found no words in ("hej") still gets its words looked for.
  const terms = termsAnswer.data.terms.length > 0 ? termsAnswer.data.terms : questionWords(question);

  let hits;
  let unseen;
  try {
    const db = await createClient();
    hits = await searchThingsIn(db, terms, maxAnswerHits);
    unseen = await loadUnseenIn(db);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }

  // The rooms the found things are in; with no hit, every room that has closed containers.
  const rooms = new Set(hits.map((hit) => `${hit.siteId}|${hit.roomKey}`));
  const relevant = unseen.filter((room) => rooms.size === 0 || rooms.has(`${room.siteId}|${room.roomKey}`)).slice(0, maxUnseenRooms);

  const groups = groupHits(hits);
  const places: AskThingsPlace[] = groups.map((group) => {
    const [first] = group.hits;
    return {
      title: cleanModelText(placeTitle(first)) || "Plats",
      site: cleanModelText(first.siteName) || "Boende",
      cardDate: hitDateText(first).replace(/^skrivet /, ""),
      hidden: 0,
      written: first.written,
      things: group.hits.map((hit) => ({ name: cleanModelText(hit.name) || "Pryl", category: hit.category, where: hit.whereHint ? cleanModelText(hit.whereHint) || null : null })),
    };
  });

  const answered = await ai.askThings(
    {
      question,
      places,
      history,
      unseen: relevant.map((room) => ({ room: cleanModelText(room.room) || "Rum", count: room.count })),
    },
    AbortSignal.timeout(answerDeadlineMs + 5_000),
    { deadline: Date.now() + answerDeadlineMs },
  );
  if (!answered.ok) return answered;
  const refs = answered.data.places.flatMap((index) => {
    const group = groups[index];
    return group ? [refOfGroup(group)] : [];
  });
  console.info("things_asked", { terms: terms.length, hits: hits.length, refs: refs.length, turns: history.length });
  return ok({ answer: answered.data.answer, refs });
}
