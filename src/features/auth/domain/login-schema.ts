import { z } from "zod";

/** The login form, validated the same way in the form and in the action. */
export const loginSchema = z.object({
  email: z
    .string({ error: "Ange en giltig e-postadress." })
    .trim()
    .pipe(z.email({ error: "Ange en giltig e-postadress." })),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Exactly six digits, as Supabase sends them (`otp_length = 6`). */
export const emailCodePattern = "[0-9]{6}";

/**
 * Signing in with the code from the e-mail (AD-3, AD-27). Spaces around the
 * code are dropped; anything but six digits is refused before Supabase is asked.
 */
export const emailCodeSchema = loginSchema.extend({
  code: z.string().trim().regex(new RegExp(`^${emailCodePattern}$`)),
});

export type EmailCodeInput = z.input<typeof emailCodeSchema>;

/** First message per field, for showing next to the form fields. */
export function loginFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}
