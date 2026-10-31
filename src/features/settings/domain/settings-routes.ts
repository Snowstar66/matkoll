// The pages under Inställningar (Story 14.7): one per row on the start page.
// Client-safe, so the start page, the redirects for the old anchors and the
// tests all read the same list.

export const settingsPages = [
  "konto",
  "boenden",
  "butiker",
  "receptsajter",
  "spara-i-matkoll",
  "ai",
  "installera",
  "om",
] as const;

export type SettingsPage = (typeof settingsPages)[number];

export const settingsHref = "/installningar";

/** The address of a page under Inställningar. */
export function settingsPageHref(page: SettingsPage): string {
  return `${settingsHref}/${page}`;
}

// The old one-page Inställningar had these anchors (Stories 1.13, 11.6, 17.5);
// a link or a bookmark with one of them goes to the page that now holds it.
const anchorPages: Record<string, SettingsPage> = {
  "spara-i-matkoll": "spara-i-matkoll",
  "godkanda-receptsajter": "receptsajter",
  ai: "ai",
  butik: "butiker",
  butiker: "butiker",
};

/** The page an old `#anchor` of Inställningar now lives on, or null for an unknown one. */
export function pageForAnchor(hash: string): SettingsPage | null {
  const key = hash.replace(/^#/, "");
  return anchorPages[key] ?? null;
}
