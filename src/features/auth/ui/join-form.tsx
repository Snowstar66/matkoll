"use client";

import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { errorMessages } from "@/lib/errors";
import { joinHousehold } from "../actions/join-household";
import { minPasswordLength } from "../domain/login-schema";

/** Where someone goes after joining: Recept, with "Välkommen till …" (the app's WelcomeGate shows it). */
export function joinedPath(household: string): string {
  return `/recept?${new URLSearchParams({ valkommen: household })}`;
}

/**
 * "Gå med" on /ga-med (Story 21.2b). Not signed in: E-postadress and Välj
 * lösenord make an account, no mail needed (the code is the proof), and "Har du
 * redan ett konto? Logga in" turns the same fields into a sign-in. Signed in:
 * only the button. After joining, a full load of Recept, so the whole app
 * reads the new household.
 */
export function JoinForm({ code, signedIn }: { code: string; signedIn: boolean }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailId = useId();
  const passwordId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setFields({});
    setPending(true);
    try {
      const result = await joinHousehold(signedIn ? { mode: "session", code } : { mode, code, email, password });
      if (result.ok) {
        window.location.assign(joinedPath(result.data.household));
        return;
      }
      if (result.error.fields) setFields(result.error.fields);
      else setMessage(result.error.message);
    } catch {
      setMessage(errorMessages.household_join_failed);
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col gap-3" data-testid="join-form">
      {signedIn ? null : (
        <>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={emailId}>E-postadress</FieldLabel>
            <Input
              id={emailId}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fields.email ? true : undefined}
              aria-describedby={fields.email ? `${emailId}-error` : undefined}
            />
            {fields.email ? <FieldError id={`${emailId}-error`}>{fields.email}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={passwordId}>{mode === "signup" ? "Välj lösenord" : "Lösenord"}</FieldLabel>
            <Input
              id={passwordId}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? minPasswordLength : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fields.password ? true : undefined}
              aria-describedby={fields.password ? `${passwordId}-error` : undefined}
            />
            {fields.password ? (
              <FieldError id={`${passwordId}-error`}>{fields.password}</FieldError>
            ) : mode === "signup" ? (
              <p className="text-meta text-ink-2">Minst {minPasswordLength} tecken.</p>
            ) : null}
          </div>
        </>
      )}
      {message ? (
        <div data-testid="join-error">
          <Notice role="alert">{message}</Notice>
        </div>
      ) : null}
      <Button type="submit" fullWidth disabled={pending}>
        {mode === "login" && !signedIn ? "Logga in och gå med" : "Gå med"}
      </Button>
      {signedIn ? null : (
        <Button
          variant="text"
          className="self-center"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setFields({});
            setMessage(null);
          }}
        >
          {mode === "signup" ? "Har du redan ett konto? Logga in" : "Nytt här? Välj e-post och lösenord"}
        </Button>
      )}
    </form>
  );
}
