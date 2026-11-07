"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { appInviteCodeLength, appJoinRoute, isAppInviteCodeShape } from "@/features/app-invites";
import { inviteCodeLength, isInviteCodeShape, joinRoute, normalizeInviteCode } from "../domain/invite-code";

/**
 * The field for an invitation code (Story 21.2b, UX-10): 6 characters from a
 * household, 8 from the app's owner, with or without spaces. It leads to
 * /ga-med or /inbjudan with the code. The same field is on the login page
 * (under "Har du fått en inbjudan?"), /ga-med and /inbjudan.
 */
export function CodeEntry({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    // Story 21.1: the owner's invitation to the app has 8 characters and its own page.
    if (isAppInviteCodeShape(code)) {
      router.push(`${appJoinRoute}?${new URLSearchParams({ kod: normalizeInviteCode(code) })}`);
      return;
    }
    if (!isInviteCodeShape(code)) {
      setError(`Koden har ${inviteCodeLength} eller ${appInviteCodeLength} tecken, till exempel K7Q4 MP2X.`);
      return;
    }
    router.push(`${joinRoute}?${new URLSearchParams({ kod: normalizeInviteCode(code) })}`);
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
          placeholder="K7Q4 MP2X"
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
      <Button type="submit" variant={variant} fullWidth>
        Gå med
      </Button>
    </form>
  );
}
