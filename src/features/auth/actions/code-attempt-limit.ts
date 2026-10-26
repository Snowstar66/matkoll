import "server-only";
import { createCodeAttempts } from "../domain/code-attempts";

/**
 * The wrong codes counted by this server instance (Story 11.6): at most 5 per
 * address and client IP in 15 minutes. In memory, so each instance counts on
 * its own and a restart starts from zero (see domain/code-attempts.ts).
 */
export const codeAttempts = createCodeAttempts();
