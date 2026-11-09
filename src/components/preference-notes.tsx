import { cx } from "@/components/cx";

/** One note about a dish against the household's food preferences, already worded ("Anna undviker koriander"). */
export type PreferenceNote = { kind: "allergy" | "dislike" | "like"; text: string };

/**
 * PreferenceNotes: the small lines under a recipe or an AI suggestion that say what it means for the household's
 * preferences. An allergy is red and bold ("Kan innehålla gluten (Anna)"), "Undviker" is calm grey and "Älskar" is
 * green; the words say it, so colour is never the only sign. Nothing at all without notes (a household that has
 * filled in nothing sees no extra line). `max` cuts the list; allergy comes first, so it is never the one cut.
 * Only spans, so it fits inside a paragraph (the meta line of a compact row).
 */
export function PreferenceNotes({ notes, max, className }: { notes: readonly PreferenceNote[] | undefined; max?: number; className?: string }) {
  if (!notes || notes.length === 0) return null;
  const shown = max === undefined ? notes : notes.slice(0, max);
  return (
    <span data-testid="preference-notes" className={cx("flex min-w-0 flex-col gap-0.5", className)}>
      {shown.map((note) => (
        <span
          key={`${note.kind}-${note.text}`}
          data-kind={note.kind}
          className={cx("block min-w-0 text-[0.8125rem]/[18px] wrap-break-word", note.kind === "allergy" ? "font-semibold text-danger" : note.kind === "like" ? "text-mint-ink" : "text-ink-2")}
        >
          {note.text}
        </span>
      ))}
    </span>
  );
}
