"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { fail, type Result } from "@/lib/errors";
import { requestPasswordReset } from "../actions/request-password-reset";

const noSubscription = () => () => {};
const hydratedNow = () => true;
const hydratedOnServer = () => false;

/**
 * "Byt lösenord" under Konto (Story 14.7): the same flow as "Välj lösenord" on
 * the login page (Story 17.2). A link is mailed to the signed-in address and
 * leads to /auth/confirm, where the new password is chosen; the answer is the
 * same whatever happens at the mail server, as on the login page.
 */
export function ChangePassword({ email }: { email: string }) {
  const hydrated = useSyncExternalStore(noSubscription, hydratedNow, hydratedOnServer);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result<null> | null>(null);

  async function send() {
    setPending(true);
    try {
      setResult(await requestPasswordReset({ email, next: "/installningar/konto" }));
    } catch {
      // No answer (e.g. no connection).
      setResult(fail("auth_reset_mail_failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {result?.ok ? (
        <p role="status" className="px-1 text-meta text-ink-2" data-testid="password-link-sent">
          Vi har skickat en länk till {email}. Öppna den för att välja ett nytt lösenord.
        </p>
      ) : null}
      {result && !result.ok ? <Notice role="alert">{result.error.message}</Notice> : null}
      {/* Story 19.7: an action is a button, not a row with an arrow. */}
      <Button variant="secondary" fullWidth disabled={!hydrated || pending} onClick={send}>
        Byt lösenord
      </Button>
      <p className="px-1 text-meta text-ink-3">Du får ett mejl med en länk där du väljer ett nytt lösenord.</p>
    </div>
  );
}
