"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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

/** The code step: the address the code belongs to, frozen, and whether a link was just sent. */
type CodeStep = { email: string; sent: boolean; key: number };

/**
 * The code step survives a reload in the same tab: iOS may reload the app on
 * the home screen while Pontus is in Mail fetching the code. For as long as a
 * code lasts (one hour), never anywhere but this tab's sessionStorage.
 */
export const codeStepStorageKey = "matkoll-login-code";
const codeStepMaxAgeMs = 60 * 60 * 1000;

function readStoredStep(): { email: string; sent: boolean } | null {
  try {
    const raw = sessionStorage.getItem(codeStepStorageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { email?: unknown; sent?: unknown; at?: unknown };
    if (typeof stored.email !== "string" || typeof stored.at !== "number") return null;
    if (Date.now() - stored.at > codeStepMaxAgeMs) return null;
    return { email: stored.email, sent: stored.sent === true };
  } catch {
    return null;
  }
}

function storeStep(email: string, sent: boolean) {
  try {
    sessionStorage.setItem(codeStepStorageKey, JSON.stringify({ sent, email, at: Date.now() }));
  } catch {
    // Private mode or storage turned off: the step just does not survive a reload.
  }
}

function clearStoredStep() {
  try {
    sessionStorage.removeItem(codeStepStorageKey);
  } catch {
    // As above.
  }
}

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
 * on the iPhone home screen needs, since the link opens in Safari. While the
 * code step shows, the address is the one the link went to and cannot be
 * edited; "Byt adress" goes back. "Jag har redan en kod" opens the code step
 * without sending a new mail.
 */
export function LoginForm({ next, notice }: LoginFormProps) {
  const [codeStep, setCodeStep] = useState<CodeStep | null>(null);
  const sends = useRef(0);
  const [state, formAction, pending] = useActionState<SendMagicLinkState, FormData>(async (previous, formData) => {
    const result = await sendMagicLink(previous, formData);
    if (result?.ok) {
      const sentTo = String(formData.get("email") ?? "").trim();
      storeStep(sentTo, true);
      // A new send gets a new code form, without the old one's errors.
      startTransition(() => setCodeStep({ email: sentTo, sent: true, key: ++sends.current }));
    }
    return result;
  }, null);
  const [clientError, setClientError] = useState<string | null>(null);
  // Controlled, so the address stays in the field after the form is sent.
  const [email, setEmail] = useState("");
  // A submit before hydration would post the form without the action state, so the
  // answer would never show; the button waits for React instead.
  const hydrated = useHydrated();
  const emailRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const errorId = useId();

  // Back to the code step after a reload in the same tab.
  useEffect(() => {
    const stored = readStoredStep();
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is read only in the browser, after hydration.
    setEmail(stored.email);
    setCodeStep({ email: stored.email, sent: stored.sent, key: ++sends.current });
  }, []);

  const fieldError = clientError ?? (state && !state.ok ? (state.error.fields?.email ?? state.error.message) : null);
  // The notice is there on page load, so it is an alert, not part of the live region below.
  const showNotice = Boolean(notice) && !state && !codeStep;

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const result = loginSchema.safeParse({ email: new FormData(event.currentTarget).get("email") });
    if (!result.success) {
      event.preventDefault();
      setClientError(loginFieldErrors(result.error).email ?? null);
    } else {
      setClientError(null);
    }
  }

  function openCodeStepWithoutSending() {
    const result = loginSchema.safeParse({ email });
    if (!result.success) {
      setClientError(loginFieldErrors(result.error).email ?? null);
      emailRef.current?.focus();
      return;
    }
    setClientError(null);
    storeStep(result.data.email, false);
    setCodeStep({ email: result.data.email, sent: false, key: ++sends.current });
  }

  function changeAddress() {
    clearStoredStep();
    setCodeStep(null);
    emailRef.current?.focus();
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form action={formAction} onSubmit={validateBeforeSubmit} noValidate className="flex w-full flex-col gap-3">
        {showNotice ? <Notice role="alert">{notice}</Notice> : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <FieldLabel htmlFor={emailId}>E-postadress</FieldLabel>
        <Input
          ref={emailRef}
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          readOnly={codeStep !== null}
          className={codeStep ? "bg-bg text-ink-2" : undefined}
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
        {codeStep ? (
          <Button variant="text" className="-ml-3 self-start" onClick={changeAddress}>
            Byt adress
          </Button>
        ) : null}
        <Button type="submit" variant={codeStep ? "secondary" : "primary"} fullWidth disabled={pending || !hydrated}>
          Skicka länk
        </Button>
        <p role="status" aria-live="polite" className="text-body text-ink-2">
          {codeStep?.sent ? sentMessage : null}
        </p>
        {codeStep ? null : (
          <Button variant="text" className="-ml-3 self-start" disabled={!hydrated} onClick={openCodeStepWithoutSending}>
            Jag har redan en kod
          </Button>
        )}
      </form>
      {codeStep ? <CodeForm key={codeStep.key} email={codeStep.email} sent={codeStep.sent} next={next} /> : null}
    </div>
  );
}

/** "Kod från mejlet" and "Logga in": the six digits from the same e-mail as the link. */
function CodeForm({ email, sent, next }: { email: string; sent: boolean; next?: string }) {
  const [state, formAction, pending] = useActionState<VerifyCodeState, FormData>(async (_previous, formData) => {
    // Gone once signed in (the action then leaves the page); back if the code was refused.
    clearStoredStep();
    const result = await verifyEmailCode({ email, code: String(formData.get("code") ?? ""), next });
    storeStep(email, sent);
    return result;
  }, null);
  const [code, setCode] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  // The server's answer is about the code that was sent; editing the code hides it.
  const [edited, setEdited] = useState(false);
  const codeId = useId();
  const errorId = useId();

  const error = clientError ?? (!edited && state && !state.ok ? state.error.message : null);

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    // Not six digits (after spaces and dashes go): the same answer as a wrong code, without asking the server.
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
