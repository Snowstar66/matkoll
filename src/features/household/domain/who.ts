import type { Member, MemberColor } from "./member";

// Se vem som gjort vad (Story 21.3; the mockup hushallet.html, section 5,
// decisions 6 and 7): only what someone else in the household did is marked,
// with their initial in their shade, or their name. Client-safe.

/** Someone else in the household: what a mark shows of them. */
export type Doer = { name: string; tone: MemberColor };

/** The other members by user id. Me, and anyone no longer in the household, are not in it. */
export type Others = ReadonlyMap<string, Doer>;

export const noOthers: Others = new Map();

export function othersOf(members: readonly Member[]): Map<string, Doer> {
  return new Map(members.filter((member) => !member.isMe).map((member) => [member.userId, { name: member.name, tone: member.color }]));
}

/** The member who did it when that is someone else, or null (me, nobody known, or someone who has left). */
export function doerOf(others: Others, userId: string | null | undefined): Doer | null {
  return userId ? (others.get(userId) ?? null) : null;
}

const months = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

function stockholmParts(date: Date): Record<string, number> {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => (part.type === "literal" ? all : { ...all, [part.type]: Number(part.value) }), {});
}

function sameDay(a: Record<string, number>, b: Record<string, number>): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** "17:42" today, otherwise "4 nov" (Swedish time). */
export function whenText(at: string, now: Date = new Date()): string {
  const parts = stockholmParts(new Date(at));
  if (sameDay(parts, stockholmParts(now))) return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return `${parts.day} ${months[parts.month - 1]}`;
}

/** "i dag", otherwise "4 nov" (Swedish time). */
export function dayText(at: string, now: Date = new Date()): string {
  const parts = stockholmParts(new Date(at));
  return sameDay(parts, stockholmParts(now)) ? "i dag" : `${parts.day} ${months[parts.month - 1]}`;
}

/**
 * Who last added or changed a pantry item or a föremål, and when (Story 21.3).
 * `added` while the row is as it was added.
 */
export type LastChange = Doer & { at: string; added: boolean };

/** "Martina ändrade · 4 nov", "Martina lade till · i dag". */
export function lastChangeText(change: LastChange, now: Date = new Date()): string {
  return `${change.name} ${change.added ? "lade till" : "ändrade"} · ${dayText(change.at, now)}`;
}

/**
 * The last change of a row from its columns: updated_by and updated_at since
 * Story 21.3, otherwise who added it and when. Null when that was me (or
 * someone no longer in the household). A row counts as added while it was last
 * written when it was added (in the same transaction, so at the same time).
 */
export function lastChangeOf(
  others: Others,
  row: { user_id: string | null; created_at: string; updated_by?: string | null; updated_at?: string | null },
): LastChange | null {
  const changedAt = row.updated_at ?? null;
  const doer = doerOf(others, changedAt ? row.updated_by : row.user_id);
  if (!doer) return null;
  const at = changedAt ?? row.created_at;
  const added = !changedAt || Date.parse(changedAt) === Date.parse(row.created_at);
  return { ...doer, at: new Date(at).toISOString(), added };
}
