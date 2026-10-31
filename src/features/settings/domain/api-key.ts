// Personal keys for Siri and shortcuts (Story 17.9). Pure, so it is tested without a database.

/** A key as the page lists it: never the key itself, only when it was made and last used. */
export type ApiKeyView = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** The most keys that work at once (api_key_limit, MK402). */
export const maxApiKeys = 5;
/** The name a new key gets; the shortcut is named the same. */
export const defaultKeyLabel = "Siri";

const dateFormat = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Stockholm" });

/** "31 okt. 2026". */
export function keyDateText(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "Skapad 31 okt. 2026 · Aldrig använd" / "· Senast använd …" / "Återkallad …". */
export function keyStatusText(key: ApiKeyView): string {
  if (key.revokedAt) return `Skapad ${keyDateText(key.createdAt)} · Återkallad ${keyDateText(key.revokedAt)}`;
  const used = key.lastUsedAt ? `Senast använd ${keyDateText(key.lastUsedAt)}` : "Aldrig använd";
  return `Skapad ${keyDateText(key.createdAt)} · ${used}`;
}

/** The address a shortcut posts to, from the site's own origin. */
export function quickAddUrl(origin: string): string {
  return `${origin}/api/snabb`;
}
