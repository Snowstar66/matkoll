"use client";

import { type FormEvent, useActionState, useId, useState, useSyncExternalStore } from "react";
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
      {showNotice ? <p role="alert">{notice}</p> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label htmlFor={emailId} className="font-medium">
        E-postadress
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
        onChange={() => setClientError(null)}
        className="min-h-11 w-full rounded-md border border-current/30 bg-transparent px-3 text-base"
      />
      {fieldError ? (
        <p id={errorId} role="alert">
          {fieldError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !hydrated}
        className="min-h-11 rounded-md border border-current px-4 text-base font-medium disabled:opacity-60"
      >
        Skicka länk
      </button>
      <p role="status" aria-live="polite">
        {sent ? sentMessage : null}
      </p>
    </form>
  );
}
