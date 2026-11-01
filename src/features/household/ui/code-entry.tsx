"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { inviteCodeLength, isInviteCodeShape, joinRoute, normalizeInviteCode } from "../domain/invite-code";

/**
 * "Har du en kod?" (Story 21.2b): a field for the 6 characters that leads to
 * /ga-med with the code. On the login page it starts as a text button.
 */
export function CodeEntry({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsed);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isInviteCodeShape(code)) {
      setError(`Koden har ${inviteCodeLength} tecken, till exempel K7Q 4MP.`);
      return;
    }
    router.push(`${joinRoute}?${new URLSearchParams({ kod: normalizeInviteCode(code) })}`);
  }

  if (!open) {
    return (
      <Button variant="text" className="self-center" onClick={() => setOpen(true)} data-testid="have-code">
        Har du en kod?
      </Button>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col gap-3" data-testid="code-entry">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={fieldId}>Kod från inbjudan</FieldLabel>
        <Input
          id={fieldId}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={9}
          className="font-mono tracking-[2px] uppercase"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
        />
        {error ? <FieldError id={`${fieldId}-error`}>{error}</FieldError> : null}
      </div>
      <Button type="submit" variant={collapsed ? "secondary" : "primary"} fullWidth>
        Fortsätt
      </Button>
    </form>
  );
}
