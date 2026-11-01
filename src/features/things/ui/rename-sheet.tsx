"use client";

import { useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { maxPlaceNameChars } from "../domain/thing-place";
import { renameSaveText, renamingText } from "../domain/thing-place-edit";

// The sheet that gives a room, a part or a box a new name (Story 18.16): one
// field, "Spara". When the name is another room's, `submit` answers `ask` and the
// sheet asks whether to merge; the button then says what it does ("Slå ihop
// rummen") and the field is kept as it was.

export type RenameOutcome =
  | { kind: "done" }
  | { kind: "ask"; question: string }
  | { kind: "error"; message: string; field?: boolean };

export type RenameSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  initial: string;
  /** What the button says once a question has been asked. */
  confirmText?: string;
  submit: (name: string, merge: boolean) => Promise<RenameOutcome>;
};

export function RenameSheet({ open, onClose, title, label, initial, confirmText, submit }: RenameSheetProps) {
  const ids = useId();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ message: string; field: boolean } | null>(null);
  const changed = name.trim() !== initial.trim();

  function reset() {
    setName(initial);
    setQuestion(null);
    setProblem(null);
  }

  async function save() {
    if (busy || !changed) return;
    setBusy(true);
    setProblem(null);
    let outcome: RenameOutcome;
    try {
      outcome = await submit(name, question !== null);
    } catch {
      outcome = { kind: "error", message: "Det gick inte att byta namn. Försök igen." };
    }
    setBusy(false);
    if (outcome.kind === "done") {
      setQuestion(null);
      onClose();
      return;
    }
    if (outcome.kind === "ask") {
      setQuestion(outcome.question);
      return;
    }
    setQuestion(null);
    setProblem({ message: outcome.message, field: outcome.field ?? false });
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={title}
      closeLabel="Avbryt"
      preventClose={busy}
      footer={
        <Button fullWidth disabled={!changed || busy} onClick={save} data-testid="rename-save">
          {busy ? renamingText : question ? (confirmText ?? renameSaveText) : renameSaveText}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        aria-busy={busy || undefined}
      >
        {problem && !problem.field ? <Notice role="alert">{problem.message}</Notice> : null}
        {question ? (
          <p className="text-body font-medium text-ink" role="status" data-testid="rename-question">
            {question}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${ids}-name`}>{label}</FieldLabel>
          <Input
            id={`${ids}-name`}
            name="name"
            autoComplete="off"
            maxLength={maxPlaceNameChars * 2}
            value={name}
            readOnly={question !== null}
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
            aria-invalid={problem?.field ? true : undefined}
            aria-describedby={problem?.field ? `${ids}-error` : undefined}
            data-testid="rename-name"
          />
          {problem?.field ? <FieldError id={`${ids}-error`}>{problem.message}</FieldError> : null}
        </div>
      </form>
    </Sheet>
  );
}
