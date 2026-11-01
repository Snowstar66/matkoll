"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Avatar } from "@/components/app-shell/avatar";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { errorMessages } from "@/lib/errors";
import { setMyName } from "../actions/members";
import { cleanName, initialOf, type MemberColor, memberNameMaxLength } from "../domain/member";

/**
 * "Vad heter du?" (Story 21.2b, decision 4): asked once, the first time someone
 * without a name signs in (Pontus too, after the release), before the welcome
 * tour. Prefilled from the address ("martina" → Martina); the big initial
 * follows what is typed. Fortsätt saves the name; it can be changed under
 * Inställningar → Konto.
 */
export function NamePrompt({ suggested, tone, onDone }: { suggested: string; tone: MemberColor; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (cleanName(name).length === 0) {
      setError("Skriv ditt namn.");
      return;
    }
    setPending(true);
    try {
      const saved = await setMyName({ name });
      if (!saved.ok) {
        setError(saved.error.fields?.name ?? saved.error.message);
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setError(errorMessages.household_failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 overflow-y-auto bg-bg"
      data-testid="name-prompt"
    >
      <form
        onSubmit={submit}
        noValidate
        className="mx-auto flex min-h-full w-full max-w-96 flex-col justify-center gap-4 px-page py-[max(var(--header-top-mobile),env(safe-area-inset-top))]"
      >
        <Avatar initial={initialOf(name)} size={72} tone={tone} className="self-center" />
        <h1 id={titleId} className="mt-2 text-center text-page-title text-ink">
          Vad heter du?
        </h1>
        <p className="text-center text-body text-ink-2">Namnet syns för de andra i hushållet, till exempel när du bockar av en vara.</p>
        <div className="mt-2 flex flex-col gap-1.5">
          <FieldLabel htmlFor={fieldId}>Förnamn</FieldLabel>
          <Input
            id={fieldId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            maxLength={memberNameMaxLength}
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="done"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            // The one thing on the screen, asked once: the keyboard may come up at once.
            autoFocus
          />
          {error ? <FieldError id={errorId}>{error}</FieldError> : null}
        </div>
        <Button type="submit" fullWidth disabled={pending}>
          Fortsätt
        </Button>
        <p className="text-center text-meta text-ink-2">Går att ändra under Inställningar → Konto.</p>
      </form>
    </div>
  );
}
