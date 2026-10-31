import "server-only";
import { createCodeAttempts } from "../domain/code-attempts";

/**
 * Failed password sign-ins counted by this server instance (Story 17.2): at
 * most 5 per address and client IP in 15 minutes, in memory like codeAttempts.
 * Supabase's own per-IP limit sits behind it.
 */
export const passwordAttempts = createCodeAttempts();
