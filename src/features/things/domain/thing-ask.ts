import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";
import { cardDateText } from "./thing-photo";
import { hitHref, searchKey, type ThingHit } from "./thing-search";

// "Fråga om ditt förråd" as a chat (Stories 18.4 and 18.14): the question, the
// latest turns of the conversation, and the hits the answer is built from,
// grouped by card. Pure.

/** The longest question, in characters. */
export const maxQuestionChars = 300;
/** How many earlier turns go with a question: the browser keeps the conversation, the server only sees these. */
export const maxHistoryTurns = 6;
/** The longest answer kept in the history, in characters (the answers are short). */
export const maxHistoryAnswerChars = 300;
/** The most things the answer is built from. */
export const maxAnswerHits = 30;

export const questionSchema = z
  .string()
  .transform((text) => oneLine(text).normalize("NFC"))
  .refine((text) => text.length > 0, "empty")
  .refine((text) => charLength(text) <= maxQuestionChars, "too long");

/** One earlier turn, as the browser sends it. */
export type ChatTurn = { question: string; answer: string };

/** What a chat turn needs: the question and the latest turns before it (more are cut to the latest maxHistoryTurns). */
export const chatInputSchema = z.object({
  question: questionSchema,
  history: z
    .array(z.object({ question: z.string().max(maxQuestionChars * 2), answer: z.string().max(maxHistoryAnswerChars * 4) }))
    .max(100)
    .transform((turns) => turns.slice(-maxHistoryTurns)),
});

/** The turns as the model gets them: each on one line, the answer cut; a turn without text is left out. */
export function cleanHistory(turns: readonly ChatTurn[], clean: (text: string) => string, cut: (text: string, max: number) => string): ChatTurn[] {
  return turns
    .slice(-maxHistoryTurns)
    .map((turn) => ({ question: cut(clean(turn.question), maxQuestionChars), answer: cut(clean(turn.answer), maxHistoryAnswerChars) }))
    .filter((turn) => turn.question !== "" && turn.answer !== "");
}

/** What the chat says and does, in Swedish. */
export const questionTooLongText = `Frågan får vara högst ${maxQuestionChars} tecken.`;
export const askLabel = "Fråga om ditt förråd";
export const askPlaceholder = "Fråga om ditt förråd …";
export const askButtonText = "Skicka";
export const askingText = "Tänker …";
export const newQuestionText = "Ny fråga";
export const askExamplesText = "Till exempel: Har du sett min skiftnyckel?";

/** A reference in an answer: a card (or the box a thing was written into) to tap. */
export type ChatRef = {
  href: string;
  /** The card's photo, for the thumbnail; null for things written into a box. */
  photoId: string | null;
  /** "Skräpförrådet · väggen". */
  title: string;
  /** "Kort från 31 okt", "Låda · Skrivet 31 okt". */
  sub: string;
};

/** The hits of one card, or of one box's written things: what the model reads as one place. */
export type HitGroup = {
  key: string;
  hits: ThingHit[];
};

/** The hits grouped by the card each is on (the things written into a box are one group per box), in the order of the first hit. */
export function groupHits(hits: readonly ThingHit[]): HitGroup[] {
  const groups = new Map<string, HitGroup>();
  for (const hit of hits) {
    const key = hit.photoId ?? `box:${hit.placeId}`;
    const group = groups.get(key);
    if (group) group.hits.push(hit);
    else groups.set(key, { key, hits: [hit] });
  }
  return [...groups.values()];
}

/** The reference chip of a group: where it is and which card it is from. */
export function refOfGroup(group: HitGroup): ChatRef {
  const [hit] = group.hits;
  const date = new Date(hit.takenAt);
  const where = hit.part ? `${hit.room} · ${hit.part}` : hit.room;
  const from = hit.written ? `Skrivet ${cardDateText(date).replace("Kort från ", "")}` : cardDateText(date);
  return { href: hitHref(hit), photoId: hit.photoId, title: where, sub: hit.isBox ? `Låda · ${from}` : from };
}

/** Small words that say nothing about what is asked for. */
const stopWords = new Set(["har", "vi", "ni", "jag", "du", "att", "med", "och", "det", "den", "ett", "som", "var", "finns", "något", "någon", "några", "ligger", "kan", "till", "för", "inte", "min", "mina", "våra", "vår", "sett", "då", "hur", "vad"]);

/** The words of a question worth looking for in names, when the AI gives no search terms: two letters or more, and not a small word. */
export function questionWords(question: string): string[] {
  const words = searchKey(question)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => [...word].length >= 2 && !stopWords.has(word));
  return [...new Set(words)].slice(0, 8);
}
