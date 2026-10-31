"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import type { Result } from "@/lib/errors";
import { resetPasswordForm } from "../actions/reset-password-form";
import { minPasswordLength } from "../domain/login-schema";

/** "Nytt lösenord" and "Spara lösenord" on /auth/confirm for the link from "Glömt lösenord" (Story 17.2). */
export function ResetPasswordForm({ tokenHash, next }: { tokenHash: string; next: string }) {
  const [state, formAction, pending] = useActionState<Result<never> | null, FormData>(resetPasswordForm, null);
  const passwordId = useId();
  const errorId = useId();
  const error = state && !state.ok ? (state.error.fields?.password ?? state.error.message) : null;

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="next" value={next} />
      <FieldLabel htmlFor={passwordId}>Nytt lösenord</FieldLabel>
      <Input
        id={passwordId}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={minPasswordLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <p className="text-meta text-ink-2">Minst {minPasswordLength} tecken.</p>
      {error ? (
        <FieldError id={errorId} role="alert">
          {error}
        </FieldError>
      ) : null}
      <Button type="submit" fullWidth disabled={pending}>
        Spara lösenord
      </Button>
    </form>
  );
}
