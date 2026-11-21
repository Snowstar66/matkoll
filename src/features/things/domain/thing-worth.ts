import { z } from "zod";

// Värt en titt (Tillval, Förråd): while a card is read the AI may flag the few föremål that may be
// collectible or worth more than they look, with one short sentence and how sure it is. It is a
// tip, never a valuation: no price anywhere. thing_item keeps the sentence and the confidence in
// two columns (both or neither). Pure.

export const worthConfidences = ["sure", "guess", "unsure"] as const;
export type WorthConfidence = (typeof worthConfidences)[number];

/** A föremål's tip: why it may be worth a closer look, and how sure the model was, and the fuller explanation once asked for. */
export type ThingWorth = { why: string; confidence: WorthConfidence; detail?: string | null };

/** The two columns of a thing_item row as a tip, or `null` when it has none (or they are not a tip). */
export function worthOfRow(row: { worth_why?: string | null; worth_confidence?: string | null; worth_detail?: string | null }): ThingWorth | null {
  const why = row.worth_why?.trim();
  const confidence = row.worth_confidence;
  if (!why || !(worthConfidences as readonly string[]).includes(confidence ?? "")) return null;
  const detail = row.worth_detail?.trim();
  return { why, confidence: confidence as WorthConfidence, ...(detail ? { detail } : {}) };
}

/** The two row columns as a zod shape, tolerant of a row without them (a missing column is no tip). */
export const worthRowShape = {
  worth_why: z.string().nullable().optional(),
  worth_confidence: z.string().nullable().optional(),
  // "Förklara närmare"; a database before its migration has no such column.
  worth_detail: z.string().nullable().optional(),
};

export const worthTitleText = "Värt en titt";
export const worthDisclaimerText = "Ett tips, inte en värdering.";

const confidenceWords: Record<WorthConfidence, string> = { sure: "Säker", guess: "Gissning", unsure: "Osäker" };

/** "Säker", "Gissning" or "Osäker". */
export function worthConfidenceText(confidence: WorthConfidence): string {
  return confidenceWords[confidence];
}

/** What a screen reader says for the marker on a row: "Värt en titt, gissning". */
export function worthMarkerLabel(worth: ThingWorth): string {
  return `${worthTitleText}, ${confidenceWords[worth.confidence].toLowerCase()}`;
}

export const explainWorthButtonText = "Förklara närmare";
export const explainingWorthText = "Funderar …";
export const explainWorthFailedText = "Det gick inte att förklara just nu. Försök igen om en stund.";

/** The three labelled parts of a fuller explanation. */
export const worthDetailHeadings = { why: "Därför markerades den", couldBe: "Vad det kan vara", check: "Att undersöka vidare" } as const;

/** The longest a kept explanation is (thing_item_worth_detail_check holds the same). */
export const maxWorthDetailChars = 1500;

/** The heading of the last, optional section of a kept explanation: the phrase to search for sold lookalikes with. */
export const worthSearchHeading = "Sökfras";

export type WorthDetailParts = { why: string; couldBe: string; checks: string[]; search?: string };

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
  const sections = text.split(/\n\n(?=Vad det kan vara\n|Att undersöka vidare\n|Sökfras\n)/);
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
  };
}
