import { z } from "zod";
import { shortDateText } from "./thing-photo";

// Ta och fyll på (Story 18.23): a count on the föremål where it matters
// (gravljus, batterier, glödlampor), and the short history of what was taken
// and filled up since the card. Livskoll lets the count drift and says
// honestly what it knows and where from: "Du borde ha 3 kvar · 2 togs 1 nov ·
// kortet 12 okt visade 5". Only "st": a pack counts as 1. No names before
// Epic 21: one shared account does not know who. Pure.

/** The kinds of change, as thing_change_kind_check lists them. */
export const thingChangeKinds = ["take", "refill", "set", "card", "noted"] as const;
export type ThingChangeKind = (typeof thingChangeKinds)[number];

/** One change of a count, as the sheet and the answers read it. Plain data: it crosses from the server to the browser. */
export type ThingChange = {
  id: string;
  kind: ThingChangeKind;
  /** What a take (≤ 0) or refill (≥ 0) really changed; null for the others. */
  delta: number | null;
  quantityAfter: number;
  /** On a card that replaced an older count: how many older changes it cleared. */
  cleared: number | null;
  /** When (ISO). */
  at: string;
};

/** What a change gave: the new count, and the change's id for Ångra. */
export type Changed = { changeId: string; quantity: number };

/** A föremål's count as its sheet shows it: the föremål that holds the count (itself, or the one it was merged into), the count (null: not counted) and its history, newest first. */
export type ThingCount = { itemId: string; quantity: number | null; changes: ThingChange[] };

/** A thing_change row, checked. */
export const changeRowSchema = z.object({
  id: z.uuid(),
  item_id: z.uuid(),
  kind: z.enum(thingChangeKinds),
  delta: z.number().int().nullable(),
  quantity_after: z.number().int(),
  cleared: z.number().int().nullable(),
  created_at: z.string(),
});

export function toChange(row: z.output<typeof changeRowSchema>): ThingChange {
  return { id: row.id, kind: row.kind, delta: row.delta, quantityAfter: row.quantity_after, cleared: row.cleared, at: new Date(row.created_at).toISOString() };
}

/** Newest first, the id breaking a tie. */
export function newestFirst(changes: readonly ThingChange[]): ThingChange[] {
  return [...changes].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : -1));
}

/** The most a take or refill changes at once (the server action's check). */
export const maxCountStep = 999;
/** The most a count can be. */
export const maxCount = 9999;

/** "5 st", or "Slut" at 0. */
export function countText(quantity: number): string {
  return quantity === 0 ? outText : `${quantity} st`;
}
export const outText = "Slut";

/**
 * A name in the middle of a sentence: a small first letter ("gravljus",
 * "batterier AA"), except when the second letter is a capital too ("USB-sladdar").
 */
export function inlineName(name: string): string {
  const [first, second] = [...name];
  if (!first) return name;
  if (second && second !== second.toLocaleLowerCase("sv") && second === second.toLocaleUpperCase("sv")) return name;
  return first.toLocaleLowerCase("sv") + name.slice(first.length);
}

/**
 * The toast after Ta / Fyll på: "Tog 2 gravljus.", "Fyllde på 2 gravljus.", and "Slut på gravljus." when Ta took
 * the last ones (`quantity` is the count after). The föremål stays, as Slut.
 */
export function changedText(kind: "take" | "refill", amount: number, name: string, quantity?: number): string {
  if (kind === "take" && quantity === 0) return `Slut på ${inlineName(name)}.`;
  return `${kind === "take" ? "Tog" : "Fyllde på"} ${amount} ${inlineName(name)}.`;
}

export const takeText = "Ta";
export const refillText = "Fyll på";
export const cancelText = "Avbryt";
/** The button that says what happens: "Ta 2", "Fyll på 2". */
export function confirmText(kind: "take" | "refill", amount: number): string {
  return `${kind === "take" ? takeText : refillText} ${amount}`;
}
export const countLabel = "Antal";
export const notCountedText = "räknas inte";
export const countThisText = "Räkna";
export const fixCountText = "Rätta antalet";
export const stopCountText = "Sluta räkna";
export const saveCountText = "Spara antal";
export const changesLabel = "Ändringar";
/** How many changes the sheet shows before "Visa alla N". */
export const shownChanges = 5;
export function showAllChangesText(count: number): string {
  return `Visa alla ${count}`;
}
/** The toast after Sluta räkna. */
export function stoppedText(name: string): string {
  return `Slutade räkna ${inlineName(name)}.`;
}
export const fewerText = "Ta färre";
export const moreText = "Ta fler";
export const fewerRefillText = "Fyll på färre";
export const moreRefillText = "Fyll på fler";
export const lessCountText = "Färre";
export const moreCountText = "Fler";
/** The stepper's value in words for a screen reader: "2 st". */
export function stepperValueText(value: number): string {
  return `${value} st`;
}

/** The day of a change in the sheet's list: "i dag", or "12 okt". */
export function changeDateText(at: string, now: Date = new Date()): string {
  const date = shortDateText(new Date(at));
  return date === shortDateText(now) ? "i dag" : date;
}

/** A change's row in the sheet: the sign and number ("−2", "+2", "5"), what it was, and the day. */
export function changeRow(change: ThingChange): { amount: string; label: string; plus: boolean; quiet: boolean } {
  if (change.kind === "take") return { amount: `−${Math.abs(change.delta ?? 0)}`, label: "Tog", plus: false, quiet: false };
  if (change.kind === "refill") return { amount: `+${change.delta ?? 0}`, label: "Fyllde på", plus: true, quiet: false };
  if (change.kind === "set") return { amount: String(change.quantityAfter), label: "Rättat till", plus: false, quiet: true };
  if (change.kind === "noted") return { amount: String(change.quantityAfter), label: "Inskrivet", plus: false, quiet: true };
  return { amount: String(change.quantityAfter), label: "Nytt kort", plus: false, quiet: true };
}

/** Where the count starts: the newest card, written-in or corrected count, and the takes and refills since it (newest first). */
export function countStory(changes: readonly ThingChange[]): { base: ThingChange | null; since: ThingChange[] } {
  const ordered = newestFirst(changes);
  const index = ordered.findIndex((change) => change.kind === "card" || change.kind === "set" || change.kind === "noted");
  const since = (index === -1 ? ordered : ordered.slice(0, index)).filter((change) => (change.kind === "take" || change.kind === "refill") && change.delta !== 0);
  return { base: index === -1 ? null : ordered[index], since };
}

/** "kortet 12 okt visade 5", "du skrev 5 den 12 okt". */
function baseText(base: ThingChange): string {
  const date = shortDateText(new Date(base.at));
  return base.kind === "card" ? `kortet ${date} visade ${base.quantityAfter}` : `du skrev ${base.quantityAfter} den ${date}`;
}

/** "kortet 12 okt", "du skrev in antalet 12 okt": what the count since is reckoned from. */
function sinceText(base: ThingChange): string {
  const date = shortDateText(new Date(base.at));
  return base.kind === "card" ? `kortet ${date}` : `du skrev in antalet ${date}`;
}

/** "2 togs 1 nov", "2 fylldes på 3 nov". */
function sinceChangeText(change: ThingChange): string {
  const amount = Math.abs(change.delta ?? 0);
  return `${amount} ${change.kind === "take" ? "togs" : "fylldes på"} ${shortDateText(new Date(change.at))}`;
}

/** A card that replaced an older count says so the first week. */
const clearedForMs = 7 * 24 * 60 * 60 * 1000;
function freshlyCleared(base: ThingChange | null, now: Date): base is ThingChange & { cleared: number } {
  return base !== null && base.kind === "card" && base.cleared !== null && base.cleared > 0 && now.getTime() - Date.parse(base.at) < clearedForMs;
}

/**
 * The line under the count in the sheet: "Du borde ha 3 kvar · kortet 12 okt
 * visade 5" when it has changed since the card, "Räknat på kortet 12 okt" when
 * not (with "2 äldre ändringar rensades." the first week after a card that
 * replaced an older count), "Du skrev 4 den 3 nov" for a count written in.
 */
export function countLine(quantity: number, changes: readonly ThingChange[], now: Date = new Date()): string {
  const { base, since } = countStory(changes);
  if (since.length > 0) {
    const start = quantity === 0 ? "Slut enligt det som tagits" : `Du borde ha ${quantity} kvar`;
    return base ? `${start} · ${baseText(base)}` : start;
  }
  if (!base) return "";
  const date = shortDateText(new Date(base.at));
  if (base.kind !== "card") return `Du skrev ${base.quantityAfter} den ${date}`;
  if (freshlyCleared(base, now)) return `Räknat på kortet ${date}. ${base.cleared === 1 ? "1 äldre ändring rensades" : `${base.cleared} äldre ändringar rensades`}.`;
  return `Räknat på kortet ${date}`;
}

/**
 * The answer to "har vi gravljus" for one counted föremål (Story 18.23), from
 * the database and never from the AI, so the numbers always hold. `place` is
 * where it is ("Förrådet · Översta hyllan"):
 * - unchanged since the card: "Ja, 5 gravljus i Förrådet · Översta hyllan."
 *   (", enligt kortet 5 nov" the first week after a card that replaced an older count);
 * - changed: "Du borde ha 3 kvar i Förrådet · Översta hyllan. 2 togs 1 nov,
 *   kortet 12 okt visade 5." with at most the two latest changes, "och 3
 *   ändringar till", and no names;
 * - at 0: "Nej, glödlampor E27 är slut, enligt det som tagits sedan kortet 12
 *   okt. De brukar ligga i Förrådet · Översta hyllan."
 */
export function countAnswer(name: string, place: string, quantity: number, changes: readonly ThingChange[], now: Date = new Date()): string {
  const { base, since } = countStory(changes);
  const inline = inlineName(name);
  if (quantity === 0) {
    const reckoned = since.length > 0 && base ? `, enligt det som tagits sedan ${sinceText(base)}` : "";
    return `Nej, ${inline} är slut${reckoned}. De brukar ligga i ${place}.`;
  }
  if (since.length === 0) {
    const after = freshlyCleared(base, now) ? `, enligt kortet ${shortDateText(new Date(base.at))}` : "";
    return `Ja, ${quantity} ${inline} i ${place}${after}.`;
  }
  const latest = since.slice(0, 2).reverse().map(sinceChangeText);
  const more = since.length - latest.length;
  const moreText = more > 0 ? ` och ${more === 1 ? "1 ändring" : `${more} ändringar`} till` : "";
  const why = [latest.join(", ") + moreText, base ? baseText(base) : null].filter(Boolean).join(", ");
  return `Du borde ha ${quantity} kvar i ${place}. ${why.charAt(0).toUpperCase()}${why.slice(1)}.`;
}

/** What Sluta räkna gives back, for Ångra. */
export const countSnapshotSchema = z.object({
  item: z.uuid(),
  quantity: z.number().int().min(0).max(maxCount),
  changes: z
    .array(
      z.object({
        kind: z.enum(thingChangeKinds),
        delta: z.number().int().nullable(),
        quantity_after: z.number().int().min(0).max(maxCount),
        cleared: z.number().int().nullable(),
        created_at: z.string(),
      }),
    )
    .max(50),
});
export type CountSnapshot = z.output<typeof countSnapshotSchema>;

/** Ta / Fyll på: a whole number from −999 to 999, never 0. */
export const changeCountInputSchema = z.object({
  itemId: z.uuid(),
  delta: z
    .number()
    .int()
    .refine((delta) => delta !== 0 && Math.abs(delta) <= maxCountStep),
});

/** Räkna / Rätta antalet: 0 to 9999. */
export const setCountInputSchema = z.object({ itemId: z.uuid(), quantity: z.number().int().min(0).max(maxCount) });
