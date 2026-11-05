import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Used when AI_SETTINGS_PASSWORD is not set. Never sent to the client. */
const defaultAiSettingsPassword = "frasse";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * True when `given` is the password for changing the AI choice: AI_SETTINGS_PASSWORD
 * if set, else the built-in default. Both sides are hashed first, so the comparison
 * takes the same time whatever the lengths and where they differ.
 */
export function aiPasswordMatches(given: unknown, configured: string | undefined): boolean {
  if (typeof given !== "string" || given === "") return false;
  return timingSafeEqual(digest(given), digest(configured ?? defaultAiSettingsPassword));
}
