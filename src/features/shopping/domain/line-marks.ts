import { doerOf, whenText, type Doer, type Others } from "@/features/household";

// Se vem som gjort vad (Story 21.3; the mockup hushallet.html, section 5,
// decision 6): a line someone else in the household checked off or added gets
// their initial, 20 px in their shade, just before the amount. What I did
// myself looks as before.

/** Someone else's check or own item, and when. */
export type LineMark = Doer & { at: string };

/** Per line key: who else checked it off, and who else added it (an own item). */
export type LineMarks = Readonly<Record<string, { checkedBy?: LineMark; addedBy?: LineMark }>>;

export const noMarks: LineMarks = {};

/** The marks of the list from the checks (their user_id is who checked) and the own items (who added them). */
export function lineMarksOf(
  checks: readonly { key: string; by?: string | null; at?: string }[],
  addedItems: readonly { key: string; by?: string | null; at?: string }[],
  others: Others,
): LineMarks {
  const marks: Record<string, { checkedBy?: LineMark; addedBy?: LineMark }> = {};
  for (const [field, rows] of [["checkedBy", checks], ["addedBy", addedItems]] as const) {
    for (const row of rows) {
      const doer = doerOf(others, row.by);
      if (doer && row.at) marks[row.key] = { ...marks[row.key], [field]: { ...doer, at: row.at } };
    }
  }
  return marks;
}

/** What the row shows: the latest of someone else's, as the line is shown now (a line I unchecked has no check). */
export function shownMark(line: { key: string; checked: boolean }, marks: LineMarks): { kind: "checked" | "added"; mark: LineMark } | null {
  const entry = marks[line.key];
  if (line.checked && entry?.checkedBy) return { kind: "checked", mark: entry.checkedBy };
  if (entry?.addedBy) return { kind: "added", mark: entry.addedBy };
  return null;
}

/** For the screen reader, after "i korgen": "bockad av Martina", "tillagd av Martina". */
export function markLabel(shown: { kind: "checked" | "added"; mark: LineMark }): string {
  return `${shown.kind === "checked" ? "bockad av" : "tillagd av"} ${shown.mark.name}`;
}

/** Listpostdetalj's line: "Martina bockade av · 17:42", "Martina lade till · 4 nov". */
export function markDetailText(shown: { kind: "checked" | "added"; mark: LineMark }, now: Date = new Date()): string {
  return `${shown.mark.name} ${shown.kind === "checked" ? "bockade av" : "lade till"} · ${whenText(shown.mark.at, now)}`;
}
