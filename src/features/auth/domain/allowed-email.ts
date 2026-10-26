/** Lower-cases and trims an e-mail address, the form ALLOWED_EMAILS is stored in. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * True when `email` is in the allowlist (AD-3). `allowed` holds normalised
 * addresses, as parsed from ALLOWED_EMAILS; an empty list allows no one.
 */
export function isAllowedEmail(email: string | null | undefined, allowed: readonly string[]): boolean {
  if (typeof email !== "string") return false;
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && allowed.includes(normalized);
}
