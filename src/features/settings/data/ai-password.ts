import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Whether AI_SETTINGS_PASSWORD is set; without it the AI choice stays locked for everyone. */
export function aiPasswordConfigured(configured: string | undefined): configured is string {
  return typeof configured === "string" && configured !== "";
}

/**
 * True when `given` is the password for changing the AI choice, AI_SETTINGS_PASSWORD.
 * There is no built-in default (the repository is public): without the variable
 * every password is refused, so the choice stays locked and nothing else changes.
 * Both sides are hashed first, so the comparison takes the same time whatever the
 * lengths and where they differ.
 */
export function aiPasswordMatches(given: unknown, configured: string | undefined): boolean {
  if (!aiPasswordConfigured(configured)) return false;
  if (typeof given !== "string" || given === "") return false;
  return timingSafeEqual(digest(given), digest(configured));
}
