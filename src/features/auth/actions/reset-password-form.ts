"use server";

import { redirect } from "next/navigation";
import { fail, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { resetPasswordWithToken } from "../data/auth";
import { isAllowedEmail } from "../domain/allowed-email";
import { newPasswordSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { ensureStartData } from "./ensure-start-data";

/**
 * "Spara lösenord" on /auth/confirm for the reset link (Story 17.2): the link
 * is used only here, on POST, together with the new password, so a mail
 * scanner that fetches the link spends nothing. A link for an address outside
 * ALLOWED_EMAILS gives no session. On success the person is signed in with the
 * new password and goes to a safe `next`.
 */
export async function resetPasswordForm(_previous: Result<never> | null, formData: FormData): Promise<Result<never>> {
  const tokenHash = formData.get("token_hash");
  const password = formData.get("password");
  const next = safeNextPath(typeof formData.get("next") === "string" ? (formData.get("next") as string) : null);

  const checked = newPasswordSchema.safeParse(password);
  if (!checked.success) return fail("validation", { password: checked.error.issues[0].message });
  if (typeof tokenHash !== "string" || tokenHash.length === 0) return fail("auth_reset_invalid");

  const result = await resetPasswordWithToken(tokenHash, checked.data, (email) =>
    isAllowedEmail(email, env.ALLOWED_EMAILS ?? []),
  );
  if (result === "invalid") return fail("auth_reset_invalid");
  if (result === "not_allowed") redirect("/logga-in?fel=atkomst");
  if (result === "failed") return fail("auth_reset_failed");
  await ensureStartData();
  redirect(next);
}
