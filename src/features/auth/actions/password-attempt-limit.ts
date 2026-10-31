import "server-only";
import { createCodeAttempts } from "../domain/code-attempts";

/**
 * Failed password sign-ins counted by this server instance (Story 17.2): at
 * most 5 per address and client IP in 15 minutes, in memory like codeAttempts.
 * Supabase's own per-IP limit sits behind it.
 */
export const passwordAttempts = createCodeAttempts();

/** Confirmation mails asked for again (Story 17.2): every request counts, 5 per address and client IP in 15 minutes. */
export const resendAttempts = createCodeAttempts();
