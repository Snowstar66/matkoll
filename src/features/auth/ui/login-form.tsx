"use client";

import { type FormEvent, useActionState, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { loginFieldErrors, loginSchema } from "../domain/login-schema";
import { sendMagicLink, type SendMagicLinkState } from "../actions/send-magic-link";

const sentMessage = "Om adressen har åtkomst får du en länk.";

type LoginFormProps = {
  /** Where to go after the link is opened; checked again on the server. */
  next?: string;
  /** A message to show before the form is used, e.g. for an expired link. */
  notice?: string;
};

const noSubscription = () => () => {};

/** False during server rendering and before hydration, true once React runs in the browser. */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export function LoginForm({ next, notice }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<SendMagicLinkState, FormData>(sendMagicLink, null);
  const [clientError, setClientError] = useState<string | null>(null);
  // A submit before hydration would post the form without the action state, so the
  // answer would never show; the button waits for React instead.
  const hydrated = useHydrated();
  const emailId = useId();
  const errorId = useId();

  const fieldError = clientError ?? (state && !state.ok ? (state.error.fields?.email ?? state.error.message) : null);
  const sent = state?.ok === true && !clientError;
  // The notice is there on page load, so it is an alert, not part of the live region below.
  const showNotice = Boolean(notice) && !state;

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const result = loginSchema.safeParse({ email: new FormData(event.currentTarget).get("email") });
    if (!result.success) {
      event.preventDefault();
      setClientError(loginFieldErrors(result.error).email ?? null);
    } else {
      setClientError(null);
    }
  }

  return (
    <form action={formAction} onSubmit={validateBeforeSubmit} noValidate className="flex w-full flex-col gap-3">
      {showNotice ? <Notice role="alert">{notice}</Notice> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FieldLabel htmlFor={emailId}>E-postadress</FieldLabel>
      <Input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
        onChange={() => setClientError(null)}
      />
      {fieldError ? (
        <FieldError id={errorId} role="alert">
          {fieldError}
        </FieldError>
      ) : null}
      <Button type="submit" fullWidth disabled={pending || !hydrated}>
        Skicka länk
      </Button>
      <p role="status" aria-live="polite" className="text-body text-ink-2">
        {sent ? sentMessage : null}
      </p>
    </form>
  );
}
