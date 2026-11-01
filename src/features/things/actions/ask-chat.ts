"use server";

import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import type { AskThingsPlace } from "@/server/ai";
import { ThingsDataError } from "../data/client";
import { findNotedIn, loadRoomPartsIn } from "../data/noted";
import { loadUnseenIn, searchThingsIn } from "../data/search";
import { chatInputSchema, cleanHistory, groupHits, maxAnswerHits, questionTooLongText, questionWords, refOfGroup, type ChatRef, type ChatTurn } from "../domain/thing-ask";
import { placeTitle } from "../domain/thing-place";
import { hitDateText, isPlainSearch, plainSearchAnswer, rankHits, searchTerms, type ThingHit } from "../domain/thing-search";
import { thingNounCap } from "../domain/thing-noun";
import { proposalQuestionText, proposePlace, type NotedProposal, type RoomParts } from "../domain/thing-noted";

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
//
// Story 18.19: the first call also says whether the text is something to
// remember ("Passen ligger i översta byrålådan i sovrummet"), with the thing,
// the room and the part; it gets the rooms of the boende for that. Then nothing
// is searched and the second call is not made: the answer is a proposal, which
// "Kom ihåg" (rememberThing) saves.

const termsDeadlineMs = 15_000;
const answerDeadlineMs = 30_000;
/** At most this many rooms' closed containers go to the model. */
const maxUnseenRooms = 10;

export type ChatAnswer = {
  answer: string;
  refs: ChatRef[];
  proposal?: NotedProposal;
  /** Story 18.19: a plain search is answered by the database: the hits that answer it, and the close ones. */
  hits?: ThingHit[];
  similar?: ThingHit[];
};

/** A room or part's name for the model's "Rum:" list: one line, without the list's own ":" and ",". */
function modelName(name: string): string {
  return cleanModelText(name.replace(/[:,]/g, " "));
}

/** The rooms and parts as the model gets them: on one line, empty names left out, at most 60 rooms. */
function roomsForModel(rooms: readonly RoomParts[]): RoomParts[] {
  return rooms
    .map((room) => ({ room: modelName(room.room), parts: room.parts.map(modelName).filter((part) => part !== "").slice(0, 60) }))
    .filter((room) => room.room !== "")
    .slice(0, 60);
}

/**
 * Answers `question` from the things the database finds for it. The refs are
 * cards (or boxes with written things) that really are among the found things.
 * Fails with `unauthorized`, `validation` (the text in `fields.question`),
 * `things_unavailable`, or the AI port's `ai_unavailable`, `ai_rejected` and `ai_invalid`.
 */
export async function askChat(input: { question: string; history: ChatTurn[]; siteId?: string }): Promise<Result<ChatAnswer>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = chatInputSchema.safeParse(input);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.path[0] === "question" && issue.message === "too long");
    return fail("validation", { question: tooLong ? questionTooLongText : "Skriv en fråga." });
  }
  const { question, siteId } = parsed.data;
  const history = cleanHistory(parsed.data.history, cleanModelText, cutCodePoints);

  // A plain search ("coca-cola", "passen") is answered by the database, without AI; only
  // when it finds nothing at all does the AI get the text and may name the closest thing.
  // Not as the answer to a question of the chat's own ("Ska jag komma ihåg …?" – "ja").
  const answersQuestion = history.at(-1)?.answer.trim().endsWith("?") ?? false;
  if (isPlainSearch(question) && !answersQuestion) {
    let found: ThingHit[];
    try {
      found = await searchThingsIn(await createClient(), searchTerms(question), maxAnswerHits);
    } catch (error) {
      if (!(error instanceof ThingsDataError)) throw error;
      console.error("things_unavailable", { reason: error.detail });
      return fail("things_unavailable");
    }
    if (found.length > 0) {
      const { best, similar } = rankHits(question, found);
      console.info("things_searched", { best: best.length, similar: similar.length });
      return ok({ answer: plainSearchAnswer(question, best), refs: [], hits: best, similar });
    }
  }

  // The rooms of the boende the page shows, for a thing to remember (Story 18.19).
  let rooms: RoomParts[] = [];
  if (siteId) {
    try {
      rooms = await loadRoomPartsIn(await createClient(), siteId);
    } catch (error) {
      if (!(error instanceof ThingsDataError)) throw error;
      console.error("things_unavailable", { reason: error.detail });
      return fail("things_unavailable");
    }
  }
  const modelRooms = roomsForModel(rooms);

  const ai = await getAiServiceForUser();
  const termsAnswer = await ai.thingSearchTerms(
    { question, history, ...(modelRooms.length > 0 ? { rooms: modelRooms } : {}) },
    AbortSignal.timeout(termsDeadlineMs + 5_000),
    { deadline: Date.now() + termsDeadlineMs },
  );
  if (!termsAnswer.ok) return termsAnswer;

  const remember = termsAnswer.data.intent === "remember" ? termsAnswer.data.remember : null;
  if (remember) {
    const place = proposePlace(rooms, remember);
    let moves;
    try {
      moves = await findNotedIn(await createClient(), remember.name);
    } catch (error) {
      if (!(error instanceof ThingsDataError)) throw error;
      console.error("things_unavailable", { reason: error.detail });
      return fail("things_unavailable");
    }
    console.info("things_remember_proposed", { room: place.room !== null, newRoom: place.newRoom, moves: moves !== null, turns: history.length });
    return ok({ answer: proposalQuestionText, refs: [], proposal: { name: remember.name, category: remember.category, ...place, moves } });
  }
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
  const hitRooms = new Set(hits.map((hit) => `${hit.siteId}|${hit.roomKey}`));
  const relevant = unseen.filter((room) => hitRooms.size === 0 || hitRooms.has(`${room.siteId}|${room.roomKey}`)).slice(0, maxUnseenRooms);

  const groups = groupHits(hits);
  const places: AskThingsPlace[] = groups.map((group) => {
    const [first] = group.hits;
    return {
      title: cleanModelText(placeTitle(first)) || "Plats",
      site: cleanModelText(first.siteName) || "Boende",
      cardDate: hitDateText(first).replace(/^skrivet /, ""),
      hidden: 0,
      written: first.written,
      noted: first.noted,
      things: group.hits.map((hit) => ({ name: cleanModelText(hit.name) || thingNounCap.singular, category: hit.category, where: hit.whereHint ? cleanModelText(hit.whereHint) || null : null })),
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
