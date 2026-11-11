// The words and the small date sums of Veckoagentens screens. Pure, so the texts can be tested.

export const dayShort = ["MÅN", "TIS", "ONS", "TOR", "FRE", "LÖR", "SÖN"] as const;
export const dayWords = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"] as const;
export const dayInitials = ["M", "T", "O", "T", "F", "L", "S"] as const;
const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;

/** "måndag" for day 1. */
export const dayWord = (dayIndex: number): string => dayWords[dayIndex - 1] ?? "";
/** "MÅN" for day 1. */
export const dayLabel = (dayIndex: number): string => dayShort[dayIndex - 1] ?? "";

/** The date of a day of the week: 16 and "nov" for day 1 of 2026-11-16. Plain calendar arithmetic on noon UTC. */
export function dayDate(weekStart: string, dayIndex: number): { day: number; month: string } {
  const date = new Date(`${weekStart}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return { day: dayIndex, month: "" };
  date.setUTCDate(date.getUTCDate() + dayIndex - 1);
  return { day: date.getUTCDate(), month: months[date.getUTCMonth()] ?? "" };
}

/** "måndag", "måndag och torsdag", "måndag, onsdag och torsdag". */
export function joinDays(days: readonly number[]): string {
  const words = [...days].sort((a, b) => a - b).map(dayWord);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} och ${words[words.length - 1]}`;
}

export const pluralDays = (count: number): string => (count === 1 ? "1 ledig dag" : `${count} lediga dagar`);

/** What the card in Matsedel is for the week: nothing filled, some filled, every open day filled, or nothing to plan (a week that is past). */
export type CardState = "empty" | "partial" | "full" | "none";

export function cardState(filledDays: readonly number[], emptyDays: readonly number[]): CardState {
  if (emptyDays.length === 0) return filledDays.length > 0 ? "full" : "none";
  return filledDays.length === 0 ? "empty" : "partial";
}

export const cardTexts = {
  emptyTitle: "Föreslå veckan",
  partialTitle: "Fyll resten av veckan",
  emptyBody: (week: number) => `Vecka ${week} är tom. Få ett förslag på middagar efter vad du har hemma och vad som är på erbjudande.`,
  partialBody: (emptyDays: number, filledDays: readonly number[]) =>
    `${pluralDays(emptyDays)}. ${filledDays.length === 1 ? "Din rätt" : "Dina rätter"} (${joinDays(filledDays)}) ligger kvar som ${filledDays.length === 1 ? "den" : "de"} är.`,
  draftBody: (week: number) => `Du har ett utkast för vecka ${week}. Inget är sparat i Matsedel än.`,
  waitingTitle: "Du har ett förslag på väntan",
  waitingOpen: "Se förslaget",
  waitingNew: "Gör nytt",
  oldTitle: "Ditt förra förslag är gammalt. Gör nytt?",
  discard: "Förkasta",
  discardTitle: "Förkasta förslaget?",
  discardBody: "Inget ändras i Matsedel.",
  discardKeep: "Behåll",
  discarded: "Förslaget förkastades.",
  settings: "Ställ in",
} as const;

/** The menu item that redoes a full week: only the days the agent put there change; with none of the user's own, the whole week. */
export function redoMenuTexts(agentDays: number, ownDays: number): { title: string; hint: string } {
  if (ownDays === 0) return { title: "Gör om veckan", hint: `Byter ${agentDays === 1 ? "1 rätt" : `${agentDays} rätter`} mot ett nytt förslag.` };
  return {
    title: "Gör om de olåsta",
    hint: `Byter ${agentDays === 1 ? "1 rätt" : `${agentDays} rätter`}. ${ownDays === 1 ? "Din 1 ligger" : `Dina ${ownDays} ligger`} kvar.`,
  };
}

/** The one line under the title of the proposal. */
export function summaryText(proposed: number, fixed: number, lockedByUser: number): string {
  const around = fixed === 0 ? "" : ` runt ${fixed === 1 ? "din 1 rätt" : `dina ${fixed} rätter`}${lockedByUser > 0 ? ` och ${lockedByUser} du låst` : ""}`;
  const head = fixed === 0 && lockedByUser === 0 ? `${proposed} ${proposed === 1 ? "middag" : "middagar"}` : `${proposed} förslag${around}`;
  return `${head}. Inget är sparat förrän du trycker Använd veckan.`;
}

/** "5 rätter tillagda. Dina 2 låg kvar. 14 varor att köpa." (`toBuy` left out when it is not known) */
export function appliedText(written: number, kept: number, toBuy?: number | null): string {
  const head = `${written} ${written === 1 ? "rätt tillagd" : "rätter tillagda"}.`;
  const keptText = kept > 0 ? ` ${kept === 1 ? "Din 1 låg kvar." : `Dina ${kept} låg kvar.`}` : "";
  const buyText = typeof toBuy === "number" && toBuy > 0 ? ` ${toBuy} ${toBuy === 1 ? "vara" : "varor"} att köpa.` : "";
  return `${head}${keptText}${buyText}`;
}

/** Which letter stands in the red ring of an allergy: the first letter of the name in "Kan innehålla laktos (Anna)". */
export function allergyInitial(warning: string): string {
  const name = /\(([^)]+)\)\s*$/.exec(warning)?.[1]?.trim();
  return (name ? name.charAt(0) : "!").toLocaleUpperCase("sv-SE");
}

/** Rough tokens of one week proposal, for the cost line: Haiku on a shortlist, and what the careful run (Sonnet) reads and writes. */
export const weekPlanTokens = {
  standard: { tokensIn: 4_000, tokensOut: 1_000 },
  careful: { tokensIn: 4_000, tokensOut: 1_000 },
} as const;
