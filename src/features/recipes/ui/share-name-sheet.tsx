"use client";

import { useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, Input } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { errorMessages } from "@/lib/errors";
import { householdNameMaxLength } from "@/features/household";
import { askNameTitle } from "../domain/shared-recipe";

/**
 * Asked the first time a household shares while it still has the name it got with the account
 * ("Vad ska andra se att ni heter?"): the name is what others see in Delade, "Delat av" and "Sparat
 * av". It starts empty and is never made from the e-mail. "Spara och dela" renames the household
 * and shares; "Hoppa över" shares as it is (others see "Ett hushåll"); "Avbryt" shares nothing.
 * `onSubmit` gets the name, or null for Hoppa över, and returns the message when it failed (the
 * sheet stays open and shows it) or null when it is done (the sheet closes).
 */
export function ShareNameSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string | null) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const errorId = useId();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setError(null);
    }
  }

  async function submit(chosen: string | null) {
    if (pending) return;
    if (chosen !== null && chosen.trim() === "") {
      setError("Skriv ett namn, eller hoppa över.");
      return;
    }
    setPending(true);
    let message: string | null;
    try {
      message = await onSubmit(chosen);
    } catch {
      message = errorMessages.recipe_share_failed;
    }
    setPending(false);
    if (message === null) onClose();
    else setError(message);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={askNameTitle}
      closeLabel="Avbryt"
      preventClose={pending}
      initialFocus="title"
      footer={
        <div className="flex flex-col gap-2">
          <Button fullWidth onClick={() => void submit(name)} disabled={pending}>
            Spara och dela
          </Button>
          <Button variant="text" fullWidth onClick={() => void submit(null)} disabled={pending}>
            Hoppa över
          </Button>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit(name);
        }}
        className="flex flex-col gap-1.5"
      >
        <Input
          id={fieldId}
          aria-label="Hushållets namn"
          value={name}
          maxLength={householdNameMaxLength}
          placeholder="Till exempel Hellgrens"
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </form>
    </Sheet>
  );
}
