"use client";

import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/button";
import { ChevronDownIcon } from "@/components/icons";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { errorMessages, type Result } from "@/lib/errors";
import { emailCodePattern, emailCodeSchema, loginFieldErrors, loginSchema } from "../domain/login-schema";
import { loginWithPassword } from "../actions/login-with-password";
import { requestPasswordReset } from "../actions/request-password-reset";
import { sendMagicLink, type SendMagicLinkState } from "../actions/send-magic-link";
import { verifyEmailCode } from "../actions/verify-email-code";

// The same text whether or not the address is allowed (AD-3).
const sentMessage = (email: string) =>
  `Vi har skickat en länk och en kod till ${email}. Tryck på länken, eller skriv koden här.`;

type LoginFormProps = {
  /** Where to go after the link is opened or the code is entered; checked again on the server. */
  next?: string;
  /** A message to show before the form is used, e.g. for an expired link. */
  notice?: string;
  /** The invitation code field, shown under "Har du fått en inbjudan?" (the household feature's, passed in by the page). */
  invite?: ReactNode;
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

/** What the main button does: sign in, or ask for the mail where a password is chosen. */
type Mode = "login" | "reset";

const modeLabels: Record<Mode, string> = {
  login: "Logga in",
  reset: "Skicka länk för att välja lösenord",
};

// The same text whether or not the address has an account (AD-3).
const resetSentMessage = "Om adressen har ett konto skickar vi ett mejl med en länk där du väljer lösenord.";

/**
 * Logga in (FR-1, AD-3, Story 17.2, UX-10): three parts from the top. E-mail
 * address and password with "Logga in"; accounts are made by `pnpm
 * users:sync`, so a first sign-in and a forgotten password both go through
 * "Välj lösenord", a mail with a link. Then "Logga in utan lösenord": "Skicka
 * länk och kod" mails a one-time link and a code, and once it is sent, "Kod
 * från mejlet" and "Logga in" (Story 11.6). The link signs in the browser it is
 * opened in; the code signs in here, which is what the app on the iPhone home
 * screen needs, since the link opens in Safari. While the code step shows, the
 * address is the one the link went to and cannot be edited; "Byt adress" goes
 * back. Last, a folded row "Har du fått en inbjudan?" with the invitation
 * code; open, it folds the part without a password.
 */
export function LoginForm({ next, notice, invite }: LoginFormProps) {
  const [codeStep, setCodeStep] = useState<CodeStep | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  // "Har du fått en inbjudan?" open: the part without a password folds into a row.
  const [inviteOpen, setInviteOpen] = useState(false);
  const sends = useRef(0);
  const [state, formAction, linkPending] = useActionState<SendMagicLinkState, FormData>(async (previous, formData) => {
    const result = await sendMagicLink(previous, formData);
    if (result?.ok) {
      const sentTo = String(formData.get("email") ?? "").trim();
      storeStep(sentTo, true);
      // A new send gets a new code form, without the old one's errors.
      startTransition(() => setCodeStep({ email: sentTo, sent: true, key: ++sends.current }));
    }
    return result;
  }, null);
  // The main button's answer: only a failure or, for a reset mail, ok comes back; a sign-in leaves the page.
  const [mainState, mainAction, mainPending] = useActionState<Result<unknown> | null, FormData>(
    async (_previous, formData) => {
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      if (mode === "reset") return requestPasswordReset({ email, next });
      return loginWithPassword({ email, password, next });
    },
    null,
  );
  // The main answer is about what was typed; editing or changing mode hides it.
  const [mainEdited, setMainEdited] = useState(false);
  const pending = linkPending || mainPending;
  const [clientError, setClientError] = useState<string | null>(null);
  // Controlled, so the address stays in the field after the form is sent.
  const [email, setEmail] = useState("");
  // Controlled too: a form action resets uncontrolled fields, and a refused short password should not vanish.
  const [password, setPassword] = useState("");
  // A submit before hydration would post the form without the action state, so the
  // answer would never show; the button waits for React instead.
  const hydrated = useHydrated();
  const emailRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const formId = useId();
  const errorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();

  // Back to the code step after a reload in the same tab.
  useEffect(() => {
    const stored = readStoredStep();
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is read only in the browser, after hydration.
    setEmail(stored.email);
    setCodeStep({ email: stored.email, sent: stored.sent, key: ++sends.current });
  }, []);

  const mainError = mainState && !mainState.ok && !mainEdited ? mainState.error : null;
  const fieldError =
    clientError ??
    mainError?.fields?.email ??
    (state && !state.ok ? (state.error.fields?.email ?? state.error.message) : null);
  const passwordError = mainError && !mainError.fields?.email ? (mainError.fields?.password ?? mainError.message) : null;
  const resetSent = mode === "reset" && mainState?.ok === true && !mainEdited;

  // The notice is there on page load, so it is an alert, not part of the live region below.
  const showNotice = Boolean(notice) && !state && !mainState && !codeStep;

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const result = loginSchema.safeParse({ email: new FormData(event.currentTarget).get("email") });
    if (!result.success) {
      event.preventDefault();
      setClientError(loginFieldErrors(result.error).email ?? null);
    } else {
      setClientError(null);
      setMainEdited(false);
    }
  }

  function changeAddress() {
    clearStoredStep();
    setCodeStep(null);
    emailRef.current?.focus();
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setMainEdited(true);
    setClientError(null);
  }

  const passwordless = mode === "login" || codeStep !== null;

  return (
    <div className="flex w-full flex-col gap-3">
      <form
        id={formId}
        action={formAction}
        onSubmit={validateBeforeSubmit}
        noValidate
        className="flex w-full flex-col gap-3"
      >
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
            setMainEdited(true);
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
        ) : (
          <>
            {mode === "reset" ? null : (
              <>
                <FieldLabel htmlFor={passwordId}>Lösenord</FieldLabel>
                <Input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? passwordErrorId : undefined}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setMainEdited(true);
                  }}
                />
              </>
            )}
            {passwordError ? (
              <FieldError id={passwordErrorId} role="alert">
                {passwordError}
              </FieldError>
            ) : null}
            {/* First submit button, so Enter in a field uses it; the form's own action sends the link. */}
            <Button type="submit" formAction={mainAction} fullWidth disabled={pending || !hydrated}>
              {modeLabels[mode]}
            </Button>
            {mode === "reset" ? (
              <>
                <p role="status" aria-live="polite" className="text-body text-ink-2">
                  {resetSent ? resetSentMessage : null}
                </p>
                <Button variant="text" className="-ml-3 self-start text-left" onClick={() => chooseMode("login")}>
                  Tillbaka till inloggning
                </Button>
              </>
            ) : (
              <p className="text-meta text-ink-2">
                Glömt lösenordet eller första gången?{" "}
                <button type="button" className="font-medium text-accent" onClick={() => chooseMode("reset")}>
                  Välj lösenord
                </button>
              </p>
            )}
          </>
        )}
        {passwordless ? (
          <>
            <hr className="border-border" />
            {inviteOpen ? (
              <FoldedRow title="Logga in utan lösenord" onClick={() => setInviteOpen(false)} />
            ) : (
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-row-title font-semibold text-ink">
                    Logga in utan lösenord
                  </h2>
                  {codeStep ? (
                    <p role="status" aria-live="polite" className="text-meta text-ink-2">
                      {codeStep.sent ? sentMessage(codeStep.email) : "Skriv koden från mejlet."}
                    </p>
                  ) : (
                    <p className="text-meta text-ink-2">Vi mejlar en länk och en kod till adressen ovan.</p>
                  )}
                </div>
                {codeStep ? null : (
                  <Button type="submit" variant="secondary" fullWidth disabled={pending || !hydrated}>
                    Skicka länk och kod
                  </Button>
                )}
              </section>
            )}
          </>
        ) : null}
      </form>
      {codeStep && passwordless && !inviteOpen ? (
        <CodeForm
          key={codeStep.key}
          email={codeStep.email}
          sent={codeStep.sent}
          next={next}
          formId={formId}
          resending={linkPending}
        />
      ) : null}
      <hr className="border-border" />
      {inviteOpen ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-row-title font-semibold text-ink">
            Har du fått en inbjudan?
          </h2>
          {invite}
        </section>
      ) : (
        <FoldedRow title="Har du fått en inbjudan?" subtitle="Skriv koden från inbjudan" onClick={() => setInviteOpen(true)} />
      )}
    </div>
  );
}

/** A folded part of the page: a row with a chevron that opens it. */
function FoldedRow({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      className="flex min-h-tap w-full items-center justify-between gap-3 text-left"
    >
      <span className="flex flex-col">
        <span className="text-row-title font-medium text-ink">{title}</span>
        {subtitle ? <span className="text-meta text-ink-2">{subtitle}</span> : null}
      </span>
      <ChevronDownIcon className="shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
}

/** "Kod från mejlet" and "Logga in": the six digits from the same e-mail as the link. */
function CodeForm({
  email,
  sent,
  next,
  formId,
  resending,
}: {
  email: string;
  sent: boolean;
  next?: string;
  /** The form that sends the link again, for "Skicka igen". */
  formId: string;
  resending: boolean;
}) {
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
        placeholder="6 siffror"
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
      <Button type="submit" form={formId} variant="text" className="self-center" disabled={resending}>
        Skicka igen
      </Button>
    </form>
  );
}
