/**
 * What the P button, the avatar sheet and the side menu show of the account
 * (Story 19.2). The account has no name of its own, so the name is the first
 * part of the e-mail address: "pontus.hellgren@cgi.com" is "Pontus".
 */
export type Account = {
  /** "Pontus": the first part of the address, with a capital letter. */
  name: string;
  email: string;
  /** "P": the first letter of the name, for the round avatar. */
  initial: string;
};

export function accountOf(email: string): Account {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._+-]/).find((part) => part.length > 0) ?? local;
  const name = first.length > 0 ? first.charAt(0).toLocaleUpperCase("sv-SE") + first.slice(1) : email;
  return { name, email, initial: name.charAt(0).toLocaleUpperCase("sv-SE") || "?" };
}
