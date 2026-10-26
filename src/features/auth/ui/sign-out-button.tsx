"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { fail, type Result } from "@/lib/errors";
import { signOut } from "../actions/sign-out";

type SignOutState = Result<never> | null;

async function signOutOrFail(): Promise<SignOutState> {
  try {
    return await signOut();
  } catch (error) {
    // The action's redirect to /logga-in rejects the call; Next handles it.
    unstable_rethrow(error);
    return fail("auth_sign_out_failed");
  }
}

/**
 * "Logga ut" (FR1): a text button at the bottom of Inställningar. The action
 * ends the session on the server and goes to /logga-in; only a failure, or
 * no answer at all, comes back here, as a notice.
 */
export function SignOutButton() {
  const [state, formAction, pending] = useActionState<SignOutState>(signOutOrFail, null);
  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      {state && !state.ok ? <Notice role="alert">{state.error.message}</Notice> : null}
      <Button type="submit" variant="text" disabled={pending} className="-ml-3">
        Logga ut
      </Button>
    </form>
  );
}
