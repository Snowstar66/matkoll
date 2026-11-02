// The invitation code (Story 21.2b): 6 characters without the ones that are
// easy to mix up (0/O, 1/I/L), shown 3+3 ("K7Q 4MP"). The database makes the
// code and keeps only its hash; this is how the app shows, reads and links it.

/** The characters a code is made of (household_members.sql makes it from the same). */
export const inviteCodeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const inviteCodeLength = 6;

/** Where an invitation leads (the mockup's /ga-med, the code as `kod`). */
export const joinRoute = "/ga-med";

/** "k7q-4mp " → "K7Q4MP": the code as typed, without spaces and dashes, in capitals. */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Whether `raw` can be a code at all: 6 characters of the alphabet once normalised. */
export function isInviteCodeShape(raw: string): boolean {
  const code = normalizeInviteCode(raw);
  return code.length === inviteCodeLength && [...code].every((char) => inviteCodeAlphabet.includes(char));
}

/** "K7Q4MP" → "K7Q 4MP". */
export function formatInviteCode(code: string): string {
  const clean = normalizeInviteCode(code);
  return `${clean.slice(0, 3)} ${clean.slice(3)}`.trim();
}

/** The address of the join page for `code`, on `siteUrl` ("https://livskoll.vercel.app/ga-med?kod=K7Q4MP"). */
export function inviteLink(siteUrl: string, code: string): string {
  const url = new URL(joinRoute, siteUrl);
  url.searchParams.set("kod", normalizeInviteCode(code));
  return url.toString();
}

/** The text the share sheet sends: "Pontus bjuder in dig till Hushållet Hellgren i Livskoll: <länk> (kod K7Q4MP)". */
export function inviteShareText({ inviter, household, link, code, app }: { inviter: string; household: string; link: string; code: string; app: string }): string {
  return `${inviter} bjuder in dig till ${household} i ${app}: ${link} (kod ${normalizeInviteCode(code)})`;
}

const shortDate = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" });

/** "8 nov": the last day an invitation is valid (without the dot Intl may add). */
export function inviteValidUntil(expiresAt: string | Date): string {
  return shortDate.format(new Date(expiresAt)).replace(".", "");
}
