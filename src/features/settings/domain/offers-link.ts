import { hasRefusedCodePoint } from "@/lib/one-line";
import type { StoreChain } from "./store";

// The link to a store's weekly offers (FR-34, Story 9.1, AD-11, AD-25). Only
// the pages in OFFER_SITES are ever fetched, and only the address saved for
// the store; the list is fixed in code, apart from the recipe sites, and
// Pontus cannot change it. Pure, so it is tested without a database.

/** An offer site: its host, the chain it is for, and the path of a store's offer page. */
export type OfferSite = {
  host: string;
  chain: StoreChain;
  /** The page's path, with its trailing "/": "/erbjudanden/<slug>-<digits>/". */
  path: RegExp;
  /** The site's name in texts: "ica.se". */
  name: string;
};

/** The offer sites. In 1.2 one: ICA's offer page per store (docs/erbjudanden-lankar.md). */
export const OFFER_SITES: readonly OfferSite[] = [
  { host: "www.ica.se", chain: "ICA", path: /^\/erbjudanden\/[a-z0-9]+(?:-[a-z0-9]+)*-\d+\/$/, name: "ica.se" },
];

/** The hosts safeFetch may fetch an offer page from (`allowedDomains`). Never the recipe sites. */
export const OFFER_SITE_DOMAINS: readonly string[] = OFFER_SITES.map((site) => site.host);

/** Longest link, in characters, as store_offers_url_check counts it. */
export const maxOffersUrlLength = 300;

/** The field's label in the sheet Butik. */
export const offersLinkLabel = "Länk till veckans erbjudanden";
/** The help text under the field. */
export const offersLinkHint = "Öppna butikens erbjudanden på ica.se och kopiera adressen.";
/** Under the field when the address is not a store's offer page on ica.se. */
export const offersLinkMessage =
  "Ange adressen till butikens erbjudanden på ica.se, till exempel https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/.";
/** In place of the field for a chain without an offer site. */
export const offersLinkChainText = "Länk stöds bara för ICA än så länge.";

/** The offer site for a chain, or `undefined` when the chain has none. */
export function offerSiteFor(chain: StoreChain): OfferSite | undefined {
  return OFFER_SITES.find((site) => site.chain === chain);
}

export type OffersLink = { url: string; site: OfferSite };

/**
 * A link to a store's offer page as it is stored and fetched, or `null`:
 * https on the default port, without user name, query or fragment, at the
 * chain's offer site (the host exactly, in any case) and on its offer page's
 * path. A missing trailing "/" is added. At most 300 characters, with no
 * whitespace or invisible characters. A chain without an offer site has no
 * link.
 */
export function parseOffersLink(text: string, chain: StoreChain): OffersLink | null {
  const site = offerSiteFor(chain);
  const typed = text.trim();
  if (!site || !/^https:\/\//i.test(typed) || /[\s?#]/.test(typed) || hasRefusedCodePoint(typed)) return null;
  let url: URL;
  try {
    url = new URL(typed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname !== site.host) return null;
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  if (!site.path.test(path)) return null;
  const stored = `https://${site.host}${path}`;
  return stored.length > maxOffersUrlLength ? null : { url: stored, site };
}

/** "ica.se" for a stored link, for "Erbjudanden: ica.se" on the store's card; `null` for an address on no offer site. */
export function offersSiteName(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return OFFER_SITES.find((site) => site.host === host)?.name ?? null;
}

/** "Erbjudanden: ica.se", the store card's line when the store has a link. */
export function offersLinkCardText(siteName: string): string {
  return `Erbjudanden: ${siteName}`;
}
