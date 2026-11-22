import { z } from "zod";

// Värdetips (Tillval, Förråd): while a card is read the AI may flag the few föremål that may be
// collectible or worth more than they look, with one short sentence and how sure it is. It is a
// tip, never a valuation: no price anywhere. thing_item keeps the sentence and the confidence in
// two columns (both or neither). Pure.

export const worthConfidences = ["sure", "guess", "unsure"] as const;
export type WorthConfidence = (typeof worthConfidences)[number];

/**
 * A föremål with a star ("Kan ha värde"): the AI's tip (why it may be worth a closer look, and how sure the model was)
 * and the fuller explanation once asked for. A star the user set has no tip of its own: `why` is "" and `confidence`
 * is null then (`byUser`), unless the AI had given one. A föremål without a star has no ThingWorth.
 */
export type ThingWorth = { why: string; confidence: WorthConfidence | null; detail?: string | null; byUser?: boolean };

type WorthColumns = { worth_why?: string | null; worth_confidence?: string | null; worth_detail?: string | null; worth_set_by_user?: boolean | null };

/** The AI's tip of a row (both columns, valid), whatever the star says. */
function tipOfRow(row: WorthColumns): { why: string; confidence: WorthConfidence } | null {
  const why = row.worth_why?.trim();
  const confidence = row.worth_confidence;
  if (!why || !(worthConfidences as readonly string[]).includes(confidence ?? "")) return null;
  return { why, confidence: confidence as WorthConfidence };
}

/**
 * The columns of a thing_item row as a star, or `null` when it has none. The user's choice goes first, both ways:
 * `worth_set_by_user` true is a star (with the AI's tip if there is one), false is none even with a tip, and null
 * (never touched) is a star when the AI gave a tip.
 */
export function worthOfRow(row: WorthColumns): ThingWorth | null {
  const tip = tipOfRow(row);
  const choice = row.worth_set_by_user ?? null;
  if (choice === false) return null;
  if (choice === null && !tip) return null;
  const detail = row.worth_detail?.trim();
  return { why: tip?.why ?? "", confidence: tip?.confidence ?? null, ...(detail ? { detail } : {}), ...(choice === true ? { byUser: true } : {}) };
}

/** Who made the star: the AI, the user, or the user removed an AI tip's star; `null` when it never had one. */
export type WorthSetBy = "ai" | "user" | "removed";

/** A föremål's whole state for its sheet, also when the star is off: the switch, who set it, the tip and the kept explanation. */
export type WorthState = { starred: boolean; setBy: WorthSetBy | null; tip: { why: string; confidence: WorthConfidence } | null; detail: string | null };

export function worthStateOfRow(row: WorthColumns): WorthState {
  const tip = tipOfRow(row);
  const choice = row.worth_set_by_user ?? null;
  const detail = row.worth_detail?.trim() || null;
  if (choice === true) return { starred: true, setBy: "user", tip, detail };
  if (choice === false) return { starred: false, setBy: "removed", tip, detail };
  return { starred: tip !== null, setBy: tip ? "ai" : null, tip, detail };
}

/** The filter that picks the rows with a star (PostgREST `or`): the user's, or an AI tip the user has not touched. */
export const starredRowsFilter = "worth_set_by_user.eq.true,and(worth_set_by_user.is.null,worth_why.not.is.null)";

/** The two row columns as a zod shape, tolerant of a row without them (a missing column is no tip). */
export const worthRowShape = {
  worth_why: z.string().nullable().optional(),
  worth_confidence: z.string().nullable().optional(),
  // "Undersök värdet"; a database before its migration has no such column.
  worth_detail: z.string().nullable().optional(),
  // The user's own choice about the star; a database before its migration has no such column.
  worth_set_by_user: z.boolean().nullable().optional(),
};

export const worthTitleText = "Kan ha värde";
export const worthDisclaimerText = "Ett tips, inte en värdering.";

const confidenceWords: Record<WorthConfidence, string> = { sure: "Säker", guess: "Gissning", unsure: "Osäker" };

/** "Säker", "Gissning" or "Osäker". */
export function worthConfidenceText(confidence: WorthConfidence): string {
  return confidenceWords[confidence];
}

/** What a screen reader says for the marker on a row: "Kan ha värde, gissning". */
export function worthMarkerLabel(worth: ThingWorth): string {
  return worth.confidence ? `${worthTitleText}, ${confidenceWords[worth.confidence].toLowerCase()}` : worthTitleText;
}

/** The switch in a föremål's sheet and what it says about who made the star. */
export const worthSwitchHints: Record<WorthSetBy | "none", string> = {
  ai: "Markerad av AI:n",
  user: "Markerad av dig",
  removed: "Borttagen av dig. AI:n ändrar den inte.",
  none: "Inte markerad",
};

export const updateWorthText = "Uppdatera";
export const updatingWorthText = "Uppdaterar …";
export const oneAiCallText = "Ett AI-anrop";
export const recommendationLabel = "AI:ns rekommendation:";
export const recommendsYesText = "Kan ha värde";
export const recommendsNoText = "Inte särskilt värde";

/** What the answer to Undersök värdet says about the star, by what it did. */
export type WorthApplied = "starred" | "unstarred" | "unchanged";

export function worthAppliedText(recommends: boolean, applied: WorthApplied, wasAi: boolean): string | null {
  if (recommends && applied === "starred") return "Kan ha värde, stjärnmarkerad.";
  if (!recommends && applied === "unstarred") return wasAi ? "Verkar inte ha särskilt värde. Stjärnan är borttagen." : "Verkar inte ha särskilt värde. Ingen stjärna.";
  if (!recommends && applied === "unchanged") return "Verkar inte ha särskilt värde. Ingen stjärna.";
  return null;
}

/**
 * What the AI thinks when the user's own choice on the star differs from it: a plain line. There is no button for it
 * (Pontus 22 Nov): the switch "Kan ha värde" is the one control for the star, and the user flips it himself.
 */
export function worthOpinionText(recommends: boolean): string {
  return recommends ? "AI:n tycker att den kan ha värde." : "AI:n tycker inte att den har särskilt värde.";
}

export const explainWorthButtonText = "Undersök värdet";
export const explainingWorthText = "Funderar …";
export const explainWorthFailedText = "Det gick inte att förklara just nu. Försök igen om en stund.";

/** The three labelled parts of a fuller explanation. */
export const worthDetailHeadings = { why: "Därför markerades den", couldBe: "Vad det kan vara", check: "Att undersöka vidare" } as const;

/** The longest a kept explanation is (thing_item_worth_detail_check holds the same). */
export const maxWorthDetailChars = 1500;

/** The heading of the last, optional section of a kept explanation: the phrase to search for sold lookalikes with. */
export const worthSearchHeading = "Sökfras";

/** The first, optional section of a kept explanation: what the AI recommends about the star. */
export const worthRecommendationHeading = "Rekommendation";

export type WorthDetailParts = { why: string; couldBe: string; checks: string[]; search?: string; recommends?: boolean };

/**
 * The explanation as the one text thing_item keeps: three headings, each followed by its text, the checks as "- " lines.
 * Cut to maxWorthDetailChars by dropping the last checks first; `null` when there is nothing to keep.
 */
export function formatWorthDetail(parts: WorthDetailParts): string | null {
  const why = parts.why.trim();
  const couldBe = parts.couldBe.trim();
  const checks = parts.checks.map((line) => line.trim()).filter((line) => line !== "");
  if (!why && !couldBe && checks.length === 0) return null;
  const search = (parts.search ?? "").replace(/\s+/g, " ").trim();
  const build = (lines: string[]) =>
    [
      ...(parts.recommends === undefined ? [] : [`${worthRecommendationHeading}\n${parts.recommends ? recommendsYesText : recommendsNoText}`]),
      `${worthDetailHeadings.why}\n${why}`,
      `${worthDetailHeadings.couldBe}\n${couldBe}`,
      `${worthDetailHeadings.check}\n${lines.map((line) => `- ${line}`).join("\n")}`,
      ...(search ? [`${worthSearchHeading}\n${search}`] : []),
    ].join("\n\n");
  let kept = checks;
  let text = build(kept);
  while (text.length > maxWorthDetailChars && kept.length > 0) {
    kept = kept.slice(0, -1);
    text = build(kept);
  }
  return text.length > maxWorthDetailChars ? null : text;
}

/** The kept text as its parts, or `null` when it is not in the shape formatWorthDetail writes (it is then shown as it is). */
export function parseWorthDetail(text: string): WorthDetailParts | null {
  const { why, couldBe, check } = worthDetailHeadings;
  const all = text.split(/\n\n(?=Vad det kan vara\n|Att undersöka vidare\n|Sökfras\n|Därför markerades den\n)/);
  // The recommendation is the first section when there is one.
  const recommendation = all[0]?.startsWith(`${worthRecommendationHeading}\n`) ? all[0].slice(worthRecommendationHeading.length + 1).trim() : null;
  const sections = recommendation === null ? all : all.slice(1);
  // Three sections (an explanation kept before the search phrase existed) or four.
  if (sections.length !== 3 && sections.length !== 4) return null;
  const body = (section: string, heading: string) => (section.startsWith(`${heading}\n`) ? section.slice(heading.length + 1).trim() : null);
  const first = body(sections[0] ?? "", why);
  const second = body(sections[1] ?? "", couldBe);
  const third = body(sections[2] ?? "", check);
  if (first === null || second === null || third === null) return null;
  const fourth = sections.length === 4 ? body(sections[3] ?? "", worthSearchHeading) : undefined;
  if (fourth === null) return null;
  return {
    why: first,
    couldBe: second,
    checks: third.split("\n").map((line) => line.replace(/^- /, "").trim()).filter((line) => line !== ""),
    ...(fourth ? { search: fourth } : {}),
    ...(recommendation === null ? {} : { recommends: recommendation === recommendsYesText }),
  };
}
