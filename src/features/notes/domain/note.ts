import { z } from "zod";
import type { MemberColor } from "@/features/household";

// Lappen på kylskåpet (Story 24.1; the mockup hushallet.html, section 6,
// decisions 5, 11 and 12 with their defaults). Client-safe: types, rules and
// texts. The buttons on a note are found by rules, never by AI: a recipe of the
// household's library named in the text, and a few words about shopping.

/** The longest note (the database checks it too). */
export const maxNoteChars = 280;
/** How many notes a member may write in a day (household_note_daily_limit()). */
export const noteDailyLimit = 20;
/** A note nobody marks Klar goes away after this many days (decision 5). */
export const noteMaxDays = 7;
/** How many buttons a note can carry. */
export const maxNoteActions = 3;
/** How many recipes one note suggests at most. */
const maxRecipeActions = 2;

export const noteMoods = [
  { id: "happy", emoji: "😊", label: "Glad" },
  { id: "love", emoji: "😍", label: "Kär" },
  { id: "yum", emoji: "😋", label: "Sugen" },
  { id: "cross", emoji: "😤", label: "Arg" },
  { id: "weary", emoji: "😩", label: "Trött" },
] as const;

export type NoteMood = (typeof noteMoods)[number]["id"];

export const noteMoodSchema = z.enum(["happy", "love", "yum", "cross", "weary"]);

export function moodEmoji(mood: NoteMood | null): string | null {
  return noteMoods.find((candidate) => candidate.id === mood)?.emoji ?? null;
}

/** A button on a note: put a recipe on this week's meal plan, or open the shopping list. */
export type NoteAction = { kind: "plan"; recipeId: string; title: string } | { kind: "list" };

export const noteActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan"), recipeId: z.uuid(), title: z.string().trim().min(1).max(200) }),
  z.object({ kind: z.literal("list") }),
]);

export const noteActionsSchema = z.array(noteActionSchema).max(maxNoteActions);

/** What a stored note's actions column holds; anything else gives no buttons. */
export function parseNoteActions(value: unknown): NoteAction[] {
  const parsed = noteActionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function noteActionLabel(action: NoteAction): string {
  return action.kind === "plan" ? `Lägg ${action.title} på matsedeln` : "Visa listan";
}

export function noteActionKey(action: NoteAction): string {
  return action.kind === "plan" ? `plan:${action.recipeId}` : "list";
}

/** What Skicka sends. */
export const noteInputSchema = z.object({
  text: z.string().trim().min(1).max(maxNoteChars),
  mood: noteMoodSchema.nullable(),
  actions: noteActionsSchema,
  replyTo: z.uuid().nullable(),
});

export type NoteInput = z.input<typeof noteInputSchema>;
export type ValidNoteInput = z.output<typeof noteInputSchema>;

/** A recipe the text may name. */
export type RecipeTitle = { id: string; title: string };

const letter = /\p{L}|\p{N}/u;

/** Lower case with single spaces, for matching words in text. */
function fold(text: string): string {
  return text.toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
}

/** Where `needle` stands as whole words in `haystack` (both folded), or -1. */
function wholeWordsAt(haystack: string, needle: string): number {
  if (!needle) return -1;
  for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + 1)) {
    const before = haystack[from - 1];
    const after = haystack[from + needle.length];
    if ((before === undefined || !letter.test(before)) && (after === undefined || !letter.test(after))) return from;
  }
  return -1;
}

// "handla", "handlar", "köp", "köpa", "köper", "listan", "inköpslistan".
const shoppingWords = /(?<![\p{L}\p{N}])(handla\p{L}*|köp(?:a|er|te|t)?|(?:inköps)?listan)(?![\p{L}\p{N}])/iu;

/**
 * The buttons a note's text suggests, in the order they appear in it: a recipe
 * whose whole title the text names ("Sugen på fisksoppa" with the recipe
 * Fisksoppa; the longest title wins where two overlap, at most two), then Visa
 * listan when it speaks of shopping ("handla", "köp", "listan").
 */
export function suggestNoteActions(text: string, recipes: readonly RecipeTitle[]): NoteAction[] {
  const haystack = fold(text);
  if (!haystack) return [];
  const found: { at: number; end: number; action: NoteAction }[] = [];
  const byLength = [...recipes].sort((x, y) => fold(y.title).length - fold(x.title).length);
  for (const recipe of byLength) {
    if (found.length >= maxRecipeActions) break;
    const needle = fold(recipe.title);
    const at = wholeWordsAt(haystack, needle);
    if (at === -1) continue;
    const end = at + needle.length;
    if (found.some((other) => at < other.end && other.at < end)) continue;
    found.push({ at, end, action: { kind: "plan", recipeId: recipe.id, title: recipe.title.trim() } });
  }
  const actions = found.sort((x, y) => x.at - y.at).map((entry) => entry.action);
  if (shoppingWords.test(haystack)) actions.push({ kind: "list" });
  return actions.slice(0, maxNoteActions);
}

/** Who wrote a note, as the card shows them. */
export type NoteAuthor = { name: string; initial: string; tone: MemberColor };

/** A note as the app shows it. */
export type NoteView = {
  id: string;
  text: string;
  mood: NoteMood | null;
  actions: NoteAction[];
  createdAt: string;
  /** Written by the signed-in member. */
  mine: boolean;
  author: NoteAuthor;
};

/** What the app reads: the household's open notes, newest first, and whom a new note goes to. */
export type NoteBoard = {
  notes: NoteView[];
  /** The other members' names, in the order they joined; empty when alone. */
  others: string[];
};

export const emptyNoteBoard: NoteBoard = { notes: [], others: [] };

/** "Lapp till Martina", or "Lapp till hushållet" with more than one other member. */
export function noteSheetTitle(others: readonly string[]): string {
  return others.length === 1 ? `Lapp till ${others[0]}` : "Lapp till hushållet";
}

/** "Svar till Pontus". */
export function replySheetTitle(author: string): string {
  return `Svar till ${author}`;
}

/** The quick replies in Svara (they fill the field). */
export const quickReplies = ["Ja, jag fixar det", "Kan inte idag", "👍"] as const;

/** "1 lapp till", "2 lappar till". */
export function moreNotesText(count: number): string {
  return `${count} ${count === 1 ? "lapp" : "lappar"} till`;
}

/** The note's text with its mood last ("… kan du handla? 😍"). */
export function noteText(note: Pick<NoteView, "text" | "mood">): string {
  const emoji = moodEmoji(note.mood);
  return emoji ? `${note.text} ${emoji}` : note.text;
}

/** The notes from someone else, newest first, and the signed-in member's own newest one. */
export function splitNotes(notes: readonly NoteView[]): { received: NoteView[]; ownNewest: NoteView | null } {
  return { received: notes.filter((note) => !note.mine), ownNewest: notes.find((note) => note.mine) ?? null };
}
