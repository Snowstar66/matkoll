import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import { isPublicAddress } from "./address";
import { httpsFetch } from "./https-fetch";

// The only code that fetches from recipe sites (AD-11), and from the store
// offer pages in OFFER_SITES (Story 9.1, AD-25). The caller passes the
// approved domains (from the settings module); the port never reads them
// itself (AD-1). Rules:
// - only https on the default port, no user name or password in the address;
// - the host is an approved domain or its "www." variant, never an IP address;
// - the address is checked inside the connection's own DNS lookup, so the IP
//   that was checked is the one connected to (no DNS rebinding between a
//   check and the connection); every address must be public (address.ts);
// - redirects are followed by hand, each one checked again, at most 3;
// - 10 s for everything, redirects and body included; at most 3 MB of body.

export const fetchLimits = {
  maxRedirects: 3,
  timeoutMs: 10_000,
  maxBytes: 3 * 1024 * 1024,
  /** Longest address, the same as a saved recipe's source_url. */
  maxUrlChars: 2_048,
} as const;

export type ResolvedAddress = { address: string; family: 4 | 6 };

/** Resolves a host name to its addresses. The default is the system resolver. */
export type Lookup = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/**
 * Makes one GET request without following redirects. `lookup` is the checked
 * lookup: the implementation must use it to resolve the host when it
 * connects, and it throws BlockedAddressError for an address that is not
 * public. The default (https-fetch.ts) passes it to node:https.
 */
export type FetchImpl = (
  url: URL,
  init: { signal: AbortSignal; headers: Readonly<Record<string, string>>; lookup: Lookup },
) => Promise<Response>;

export type SafeFetchOptions = {
  /** Approved domains, bare and lower case ("koket.se"); "www." is allowed in front of each. */
  allowedDomains: readonly string[];
  signal: AbortSignal;
  /** For tests: replaces the system resolver. */
  lookup?: Lookup;
  /** For tests and fixtures: replaces the HTTPS request. */
  fetchImpl?: FetchImpl;
  /**
   * The User-Agent: RECIPES_USER_AGENT (the default) or OFFERS_USER_AGENT.
   * Always one of the honest ones below, never a browser's.
   */
  userAgent?: MatkollUserAgent;
};

export type FetchedPage = {
  /** The address the page came from, after redirects. */
  url: string;
  html: string;
};

/** Thrown by the checked lookup when a host resolves to an address safeFetch may not connect to. */
export class BlockedAddressError extends Error {
  constructor() {
    super("fetch_blocked: address");
    this.name = "BlockedAddressError";
  }
}

/**
 * The honest User-Agents (AD-11, AD-25): what Matkoll is and what it fetches
 * for, never a browser's. Recipe import is the default; the weekly offers
 * from a store's page (Story 9.1) say so.
 */
export const RECIPES_USER_AGENT = "Mozilla/5.0 (compatible; Matkoll/1.0; +personal recipe import)";
export const OFFERS_USER_AGENT = "Mozilla/5.0 (compatible; Matkoll/1.0; +weekly offers for personal use)";
export type MatkollUserAgent = typeof RECIPES_USER_AGENT | typeof OFFERS_USER_AGENT;

/**
 * Every request's headers: these three and nothing else. No cookies (a
 * Set-Cookie in an answer is never sent back), and nothing that makes Matkoll
 * look like a browser (no sec-ch-ua, no browser User-Agent).
 */
function requestHeaders(userAgent: MatkollUserAgent): Readonly<Record<string, string>> {
  return {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    "accept-language": "sv-SE,sv;q=0.9,en;q=0.5",
    "user-agent": userAgent,
  };
}

const htmlTypes = new Set(["text/html", "application/xhtml+xml"]);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

async function systemLookup(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, order: "verbatim" });
  return addresses.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
}

/** The lookup a connection uses: every address must be public, or nothing is connected to. */
function checkedLookup(lookup: Lookup): Lookup {
  return async (hostname) => {
    const addresses = await lookup(hostname);
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new BlockedAddressError();
    }
    return addresses;
  };
}

/** The site's name for messages: the host without "www.". */
const siteName = (host: string) => host.replace(/^www\./, "");

function failWith(code: ErrorCode, reason: string, host?: string) {
  // Only the code and a fixed reason; never the address or the page.
  console.error(code, { reason });
  return host ? fail(code, { domain: siteName(host) }) : fail(code);
}

/**
 * The address when it can be fetched at all, before any approved domain is
 * looked at: https on the default port, no credentials, a host name (no IP
 * address), at most 2 048 characters. `null` otherwise. Needs no I/O, so the
 * import flow checks a link with it before it reads the approved sites.
 */
export function checkLinkSyntax(input: string | URL): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const invalid =
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    host === "" ||
    host.startsWith("[") ||
    isIP(host) !== 0 ||
    url.href.length > fetchLimits.maxUrlChars;
  return invalid ? null : url;
}

/**
 * Checks an address before anything is connected to: checkLinkSyntax, and a
 * host that is an approved domain or its "www." variant. Pontus's link gives
 * `fetch_invalid_url` for a bad address; a redirect to one gives `fetch_blocked`.
 */
function checkUrl(input: string | URL, allowedDomains: readonly string[], from: "link" | "redirect"): Result<URL> {
  const url = checkLinkSyntax(input);
  if (!url) return from === "link" ? fail("fetch_invalid_url") : failWith("fetch_blocked", "redirect_invalid");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!allowedDomains.some((domain) => host === domain || host === `www.${domain}`)) {
    return fail("fetch_domain_not_allowed", { domain: siteName(host) });
  }
  url.hash = "";
  return ok(url);
}

/** The body, or `null` when it is larger than `limit` bytes. Stops reading at the limit. */
async function readCapped(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The character set from the Content-Type header, or from a <meta> near the
 * start of the page; UTF-8 otherwise. A <meta> that says UTF-16 is ignored:
 * a page whose <meta> can be read as ASCII is not UTF-16 (as in the HTML spec).
 */
function decode(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const metaLabel = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  const fromMeta = metaLabel && !/^utf-?16/i.test(metaLabel) ? metaLabel : undefined;
  for (const label of [fromHeader, fromMeta]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // An unknown label: try the next one.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/** The caller stopped the fetch: not an error, so only noted as info. */
function aborted() {
  console.info("fetch_aborted", { reason: "aborted" });
  return fail("fetch_aborted");
}

async function discard(response: Response) {
  await response.body?.cancel().catch(() => {});
}

/**
 * Fetches a recipe page under the rules above. Gives `{ url, html }`, or
 * `fetch_invalid_url`, `fetch_domain_not_allowed` (with `fields.domain`),
 * `fetch_blocked` (an address that is not public, a redirect that is not
 * allowed or one too many, HTTP errors such as 403, 429 and 5xx, a page that
 * is not HTML, or a connection that fails), `fetch_timeout` (10 s) or `fetch_too_large` (over 3 MB). When the caller's own
 * signal aborts ("Avbryt"), the result is `fetch_aborted`, which is not an
 * error and is not logged as one.
 */
export async function safeFetch(input: string, options: SafeFetchOptions): Promise<Result<FetchedPage>> {
  const { allowedDomains } = options;
  const first = checkUrl(input, allowedDomains, "link");
  if (!first.ok) return first;
  let url = first.data;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new DOMException("Timed out", "TimeoutError")), fetchLimits.timeoutMs);
  const signal = AbortSignal.any([options.signal, timeout.signal]);
  const fetchImpl = options.fetchImpl ?? httpsFetch;
  const lookup = checkedLookup(options.lookup ?? systemLookup);
  const headers = requestHeaders(options.userAgent ?? RECIPES_USER_AGENT);

  try {
    for (let redirects = 0; ; redirects++) {
      const host = url.hostname;
      let response: Response;
      try {
        signal.throwIfAborted();
        response = await fetchImpl(url, { signal, headers, lookup });
      } catch (error) {
        if (options.signal.aborted) return aborted();
        if (signal.aborted) return failWith("fetch_timeout", "timeout", host);
        return failWith("fetch_blocked", error instanceof BlockedAddressError ? "address" : "connection", host);
      }

      if (redirectStatuses.has(response.status)) {
        await discard(response);
        const location = response.headers.get("location");
        if (!location) return failWith("fetch_blocked", "redirect_without_location", host);
        if (redirects >= fetchLimits.maxRedirects) return failWith("fetch_blocked", "too_many_redirects", host);
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          return failWith("fetch_blocked", "redirect_invalid", host);
        }
        const checked = checkUrl(next, allowedDomains, "redirect");
        if (!checked.ok) return checked;
        url = checked.data;
        continue;
      }

      if (response.status < 200 || response.status > 299) {
        await discard(response);
        return failWith("fetch_blocked", `status_${response.status}`, host);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!htmlTypes.has(contentType.split(";")[0].trim().toLowerCase())) {
        await discard(response);
        return failWith("fetch_blocked", "not_html", host);
      }
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > fetchLimits.maxBytes) {
        await discard(response);
        return failWith("fetch_too_large", "content_length", host);
      }

      let bytes: Uint8Array | null;
      try {
        bytes = response.body ? await readCapped(response.body, fetchLimits.maxBytes) : new Uint8Array();
      } catch {
        if (options.signal.aborted) return aborted();
        if (signal.aborted) return failWith("fetch_timeout", "timeout", host);
        return failWith("fetch_blocked", "body", host);
      }
      if (bytes === null) return failWith("fetch_too_large", "body", host);
      return ok({ url: url.href, html: decode(bytes, contentType) });
    }
  } finally {
    clearTimeout(timer);
  }
}
