"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { LogoutIcon } from "@/components/icons";
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
export function SignOutButton({
  asRow = false,
  appearance,
}: {
  /** Story 14.7: a card of its own with the word centred, last on the start page of Inställningar. */
  asRow?: boolean;
  /** Story 19.2: `sheet` is the grey button with an icon under the rows of the avatar sheet; `menu` the last row at the bottom of the side menu. */
  appearance?: "sheet" | "menu";
}) {
  const [state, formAction, pending] = useActionState<SignOutState>(signOutOrFail, null);
  if (appearance) {
    return (
      <form action={formAction} className="flex flex-col gap-2">
        {state && !state.ok ? <Notice role="alert">{state.error.message}</Notice> : null}
        <button
          type="submit"
          disabled={pending}
          className={
            appearance === "sheet"
              ? "flex h-button w-full items-center justify-center gap-1.5 rounded-md bg-fill text-row-title text-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
              : "flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-body font-medium text-ink-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          }
        >
          <LogoutIcon size={appearance === "sheet" ? 20 : 22} />
          Logga ut
        </button>
      </form>
    );
  }
  if (asRow) {
    return (
      <form action={formAction} className="flex flex-col gap-3">
        {state && !state.ok ? <Notice role="alert">{state.error.message}</Notice> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-surface px-4 text-row-title text-accent focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Logga ut
        </button>
      </form>
    );
  }
  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      {state && !state.ok ? <Notice role="alert">{state.error.message}</Notice> : null}
      <Button type="submit" variant="text" disabled={pending} className="-ml-3">
        Logga ut
      </Button>
    </form>
  );
}
