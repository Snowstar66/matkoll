import { inviteCodeAlphabet, normalizeInviteCode } from "@/features/household";

// The app invitation (Story 21.1): the owner invites an address, and gets a code of
// 8 characters (the household codes' alphabet, shown 4+4) and a link to share. The
// database makes the code and keeps only its hash.

export const appInviteCodeLength = 8;

/** Where an app invitation leads (the code as `kod`). */
export const appJoinRoute = "/inbjudan";

/** Whether `raw` can be an app invitation code at all: 8 characters of the alphabet once normalised. */
export function isAppInviteCodeShape(raw: string): boolean {
  const code = normalizeInviteCode(raw);
  return code.length === appInviteCodeLength && [...code].every((char) => inviteCodeAlphabet.includes(char));
}

/** "K7Q4MP2X" → "K7Q4 MP2X". */
export function formatAppInviteCode(code: string): string {
  const clean = normalizeInviteCode(code);
  return `${clean.slice(0, 4)} ${clean.slice(4)}`.trim();
}

/** The address of the join page for `code` on `siteUrl`. */
export function appInviteLink(siteUrl: string, code: string): string {
  const url = new URL(appJoinRoute, siteUrl);
  url.searchParams.set("kod", normalizeInviteCode(code));
  return url.toString();
}

/** The text the share sheet sends. */
export function appInviteShareText({ inviter, link, code, app }: { inviter: string; link: string; code: string; app: string }): string {
  return `${inviter} bjuder in dig till ${app}: ${link} (kod ${normalizeInviteCode(code)}). Använd samma e-postadress som inbjudan skickades till.`;
}

/** A plausible address, as the input is checked before it is sent (the database checks again). */
export function isPlausibleEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
}

export type AppInvite = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  /** The person has made (or used) an account with the invitation. */
  accepted: boolean;
};

/** The state of an invitation as a row says it. */
export function appInviteStatusText(invite: AppInvite, now: Date, validUntil: (expiresAt: string) => string): string {
  if (invite.accepted) return "Har konto";
  return new Date(invite.expiresAt) > now ? `Väntar på konto · gäller till ${validUntil(invite.expiresAt)}` : "Koden har gått ut";
}
