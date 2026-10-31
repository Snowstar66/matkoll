"use client";

import { useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { clearingText, clearLeadText, matchesClearWord, typeToConfirmText, type ClearCounts } from "../domain/thing-clear";

// The sheet that guards a clearing (Story 18.15): it says what goes (the counts),
// that it cannot be undone, and keeps the button disabled until the user has
// typed the word asked for (the room's name, or RENSA). Used by "Rensa rummet"
// and "Rensa förrådet"; only the word, the texts and the call differ.

export type ClearSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  counts: ClearCounts;
  /** What else the sheet says: what goes besides the counts and that it cannot be undone. */
  detail: string;
  /** The word to type, matched without regard to case and surrounding spaces. */
  word: string;
  /** The call that clears; the sheet closes when it succeeds. */
  onClear: (typed: string) => Promise<Result<ClearCounts>>;
  /** After a clearing that went through, with what it removed. */
  onCleared: (counts: ClearCounts) => void;
  /** After a failure that means the page is out of date (the room or boende is gone). */
  onStale?: () => void;
};

export function ClearSheet({ open, onClose, title, counts, detail, word, onClear, onCleared, onStale }: ClearSheetProps) {
  const ids = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ready = matchesClearWord(typed, word);

  async function clear() {
    if (!ready || busy) return;
    setBusy(true);
    setNotice(null);
    let result: Result<ClearCounts>;
    try {
      result = await onClear(typed);
    } catch {
      // No answer (e.g. no connection): it may have gone through, so the page is read again.
      result = fail("things_clear_failed");
      onStale?.();
    }
    setBusy(false);
    if (result.ok) {
      setTyped("");
      onCleared(result.data);
      return;
    }
    if (result.error.code === "things_place_gone" || result.error.code === "unauthorized") onStale?.();
    setNotice(result.error.message);
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setTyped("");
        setNotice(null);
        onClose();
      }}
      title={title}
      closeLabel="Avbryt"
      preventClose={busy}
      footer={
        <Button fullWidth disabled={!ready || busy} onClick={clear} data-testid="clear-confirm">
          {busy ? clearingText : title}
        </Button>
      }
    >
      <div className="flex flex-col gap-3" aria-busy={busy || undefined}>
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        <p className="text-body font-semibold text-ink" data-testid="clear-counts">
          {clearLeadText(counts)}
        </p>
        <p className="text-body text-ink-2">{detail}</p>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${ids}-word`}>{typeToConfirmText(word)}</FieldLabel>
          <Input
            id={`${ids}-word`}
            name="confirm"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="clear-word"
          />
        </div>
      </div>
    </Sheet>
  );
}
