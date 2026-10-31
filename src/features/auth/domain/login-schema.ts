import { z } from "zod";
import { maxNextLength } from "./safe-next-path";

/** The login form, validated the same way in the form and in the action. */
export const loginSchema = z.object({
  email: z
    .string({ error: "Ange en giltig e-postadress." })
    .trim()
    .pipe(z.email({ error: "Ange en giltig e-postadress." })),
  // A `next` over the cap is dropped (Pontus lands on /recept), never an error in the form.
  next: z.string().max(maxNextLength).optional().catch(undefined),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** First message per field, for showing next to the form fields. */
export function loginFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}

/** Exactly six digits, as Supabase sends them (`otp_length = 6`). */
export const emailCodePattern = "[0-9]{6}";

/** Spaces and the dashes people type or paste between digit groups ("123 456", "123-456"). */
// The hyphen-minus is last, so it is a character and not a range.
const codeSeparators = /[\s\u2010-\u2015\u2212\ufe58\ufe63\uff0d-]/g;

/**
 * The code as typed or pasted, made comparable: NFKC turns full-width digits
 * into ASCII digits, and spaces and dashes go.
 */
export function normalizeEmailCode(code: string): string {
  return code.normalize("NFKC").replace(codeSeparators, "");
}

/**
 * Signing in with the code from the e-mail (AD-3, AD-27). The code is
 * normalised (normalizeEmailCode); anything but six digits is refused before
 * Supabase is asked.
 */
export const emailCodeSchema = loginSchema.extend({
  code: z
    .string()
    .transform(normalizeEmailCode)
    .pipe(z.string().regex(new RegExp(`^${emailCodePattern}$`))),
});

export type EmailCodeInput = z.input<typeof emailCodeSchema>;

/** The shortest password the app accepts when one is chosen (Story 17.2); Supabase's own minimum is lower. */
export const minPasswordLength = 12;
/** bcrypt, which Supabase uses, stops at 72 bytes; Swedish letters take two, so this is counted in bytes. */
export const maxPasswordBytes = 72;

const passwordTooShort = `Lösenordet måste vara minst ${minPasswordLength} tecken.`;
const passwordTooLong = "Lösenordet är för långt. Välj ett kortare.";

const withinBytes = (password: string) => new TextEncoder().encode(password).length <= maxPasswordBytes;

/** Signing in with an existing password: nothing about its strength is checked. */
export const passwordLoginSchema = loginSchema.extend({
  password: z
    .string({ error: "Ange ditt lösenord." })
    .min(1, "Ange ditt lösenord.")
    .refine(withinBytes, "Ange ditt lösenord."),
});

export type PasswordLoginInput = z.input<typeof passwordLoginSchema>;

/** A new password, chosen with the link from "Välj lösenord". */
export const newPasswordSchema = z
  .string({ error: passwordTooShort })
  .min(minPasswordLength, passwordTooShort)
  .refine(withinBytes, passwordTooLong);
