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

/** First message per field, for showing next to the form fields. */
export function loginFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}
