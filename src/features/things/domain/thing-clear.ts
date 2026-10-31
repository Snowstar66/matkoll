import { z } from "zod";
import { cardsText, thingsText } from "./thing-room";
import { thingNoun } from "./thing-noun";

// "Rensa rummet" and "Rensa förrådet" (Story 18.15): what is removed is counted
// first, and the user types a word (the room's name, or RENSA) before the button
// works. Pure.

/** The word typed to clear a boende's whole Förråd. */
export const clearSiteWord = "RENSA";

/** What a clearing removes. */
export type ClearCounts = { things: number; cards: number; boxes: number };

/** "74 prylar, 9 kort, 2 lådor"; what is zero is left out. */
export function clearCountsText(counts: ClearCounts): string {
  const parts = [
    counts.things > 0 ? thingsText(counts.things) : null,
    counts.cards > 0 ? cardsText(counts.cards) : null,
    counts.boxes > 0 ? (counts.boxes === 1 ? "1 låda" : `${counts.boxes} lådor`) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Inget";
}

/** Whether `typed` is the word asked for: the case and the spaces at the ends do not matter. */
export function matchesClearWord(typed: string, word: string): boolean {
  const clean = (text: string) => text.normalize("NFC").trim().toLocaleLowerCase("sv");
  return clean(word) !== "" && clean(typed) === clean(word);
}

/** The input of clearing a room, or (without `roomKey`) a boende's whole Förråd. */
export const clearInputSchema = z.object({ siteId: z.uuid(), roomKey: z.string().min(1).max(160).optional(), confirm: z.string().max(100) });

/** The result of a clearing: what went. */
export type Cleared = ClearCounts;

export const clearRoomMenuText = "Rensa rummet";
export const moreActionsText = "Fler val";
export const clearUndoneText = "Det går inte att ångra.";
export const clearingText = "Rensar …";

/** "Rensa förrådet i Hemma". */
export function clearSiteText(site: string): string {
  return `Rensa förrådet i ${site}`;
}

/** The sheet's lead: "Det här tas bort: 74 prylar, 9 kort, 2 lådor." */
export function clearLeadText(counts: ClearCounts): string {
  return `Det här tas bort: ${clearCountsText(counts)}.`;
}

/** What the room's clearing says besides the counts. */
export const clearRoomDetailText = `Korten, fotona, ${thingNoun.definitePlural}, de inskrivna lådorna och platserna i rummet tas bort. Det går inte att ångra.`;

/** What the Förråd's clearing says besides the counts; Matvaror is never touched. */
export function clearSiteDetailText(site: string): string {
  return `Allt i Förrådet i ${site} tas bort: kort, foton, ${thingNoun.plural}, lådor och platser. Matvaror rörs inte. Det går inte att ångra.`;
}

/** "Skriv Skräpförrådet för att bekräfta." */
export function typeToConfirmText(word: string): string {
  return `Skriv ${word} för att bekräfta.`;
}

/** The toast after a clearing. */
export function clearedText(counts: ClearCounts): string {
  return counts.things + counts.cards + counts.boxes === 0 ? "Det fanns inget att rensa." : `Rensade ${clearCountsText(counts)}.`;
}
