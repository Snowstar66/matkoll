"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "../domain/safe-next-path";
import { confirmEmailLink } from "./confirm-email-link";

/**
 * "Logga in" on /auth/confirm (AD-3, Story 11.6): the link from the e-mail is
 * used only here, on POST. Opening the link (GET) shows the button and uses
 * nothing, so a mail scanner that fetches links (Safe Links and the like)
 * cannot use up the token that the link and the code share.
 */
export async function confirmEmailLinkForm(formData: FormData): Promise<void> {
  const tokenHash = formData.get("token_hash");
  const next = safeNextPath(typeof formData.get("next") === "string" ? (formData.get("next") as string) : null);
  const result = typeof tokenHash === "string" && tokenHash.length > 0 ? await confirmEmailLink(tokenHash) : "invalid";
  if (result === "invalid") redirect(`/logga-in?${new URLSearchParams({ fel: "lank", next })}`);
  if (result === "not_allowed") redirect("/logga-in?fel=atkomst");
  redirect(next);
}
