"use client";

import { type FormEvent, useActionState, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { errorMessages, type Result } from "@/lib/errors";
import { emailCodePattern, emailCodeSchema, loginFieldErrors, loginSchema } from "../domain/login-schema";
import { sendMagicLink, type SendMagicLinkState } from "../actions/send-magic-link";
import { verifyEmailCode } from "../actions/verify-email-code";

// The same text whether or not the address is allowed (AD-3).
const sentMessage = "Vi har skickat en länk och en kod till din e-post.";

type LoginFormProps = {
  /** Where to go after the link is opened or the code is entered; checked again on the server. */
  next?: string;
  /** A message to show before the form is used, e.g. for an expired link. */
  notice?: string;
};

type VerifyCodeState = Result<never> | null;

const noSubscription = () => () => {};

/** False during server rendering and before hydration, true once React runs in the browser. */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * Logga in (FR-1, AD-3): the e-mail address and "Skicka länk", and once the
 * mail is sent, "Kod från mejlet" and "Logga in" (Story 11.6). The link signs
 * in the browser it is opened in; the code signs in here, which is what the app
 * on the iPhone home screen needs, since the link opens in Safari.
 */
export function LoginForm({ next, notice }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<SendMagicLinkState, FormData>(sendMagicLink, null);
  const [clientError, setClientError] = useState<string | null>(null);
  // Controlled, so the address stays in the field after the form is sent.
  const [email, setEmail] = useState("");
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
    <div className="flex w-full flex-col gap-6">
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
          value={email}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setClientError(null);
          }}
        />
        {fieldError ? (
          <FieldError id={errorId} role="alert">
            {fieldError}
          </FieldError>
        ) : null}
        <Button type="submit" variant={sent ? "secondary" : "primary"} fullWidth disabled={pending || !hydrated}>
          Skicka länk
        </Button>
        <p role="status" aria-live="polite" className="text-body text-ink-2">
          {sent ? sentMessage : null}
        </p>
      </form>
      {sent ? <CodeForm email={email} next={next} /> : null}
    </div>
  );
}

/** "Kod från mejlet" and "Logga in": the six digits from the same e-mail as the link. */
function CodeForm({ email, next }: { email: string; next?: string }) {
  const [state, formAction, pending] = useActionState<VerifyCodeState, FormData>(
    (_previous, formData) => verifyEmailCode({ email, code: String(formData.get("code") ?? ""), next }),
    null,
  );
  const [code, setCode] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  // The server's answer is about the code that was sent; editing the code hides it.
  const [edited, setEdited] = useState(false);
  const codeId = useId();
  const errorId = useId();

  const error = clientError ?? (!edited && state && !state.ok ? state.error.message : null);

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    // Not six digits: the same answer as a wrong code, without asking the server.
    if (!emailCodeSchema.safeParse({ email, code }).success) {
      event.preventDefault();
      setClientError(errorMessages.auth_code_invalid);
    } else {
      setClientError(null);
      setEdited(false);
    }
  }

  return (
    <form action={formAction} onSubmit={validateBeforeSubmit} noValidate className="flex w-full flex-col gap-3">
      <FieldLabel htmlFor={codeId}>Kod från mejlet</FieldLabel>
      <Input
        id={codeId}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={emailCodePattern}
        required
        value={code}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setCode(event.target.value);
          setClientError(null);
          setEdited(true);
        }}
      />
      {error ? (
        <FieldError id={errorId} role="alert">
          {error}
        </FieldError>
      ) : null}
      <Button type="submit" fullWidth disabled={pending}>
        Logga in
      </Button>
    </form>
  );
}
