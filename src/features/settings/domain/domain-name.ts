import { z } from "zod";

// Approved recipe sites are stored as bare domain names (AD-11): lower case,
// without scheme, path, port or "www.", and in punycode when the name is not
// ASCII. The table's check constraint (supabase/migrations/*_settings.sql)
// follows the same rules.

/** Longest domain name in DNS. */
export const maxDomainChars = 253;

/** Shown when what Pontus typed is not a domain name. */
export const domainNameMessage = "Ange ett domännamn, till exempel koket.se.";

/** One DNS label: letters, digits and inner hyphens, at most 63 characters. */
const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const domainPattern = new RegExp(`^${label}(?:\\.${label})+$`);

/**
 * The bare domain name in `input` ("https://www.Koket.se/recept/x" →
 * "koket.se"), or `null` when it is not one: an IP address, a single label,
 * a scheme other than http(s), or anything URL cannot read.
 */
export function normalizeDomainName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  let host: string;
  try {
    // URL lower-cases the host and turns a non-ASCII name into punycode.
    host = new URL(hasScheme ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (host.length > maxDomainChars || !domainPattern.test(host)) return null;
  // Every label is digits: an IPv4 address in some notation.
  if (/^[0-9.]+$/.test(host)) return null;
  return host;
}

/** A domain as Pontus types it, normalised to the stored form (AD-11). */
export const domainNameSchema = z.string().transform((value, context) => {
  const domain = normalizeDomainName(value);
  if (domain === null) {
    context.addIssue({ code: "custom", message: domainNameMessage });
    return z.NEVER;
  }
  return domain;
});
