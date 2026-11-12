import "server-only";
import { isIP } from "node:net";
import { httpsFetch } from "./https-fetch";
import {
  BlockedAddressError,
  checkedLookup,
  readCapped,
  RECIPES_USER_AGENT,
  redirectStatuses,
  systemLookup,
  type FetchImpl,
  type Lookup,
} from "./safe-fetch";

// Fetches one picture for a recipe (a recipe's image_url, saved into the app's
// own storage). The same rules as safeFetch (AD-11) with two differences: the
// picture may sit on any public host (image servers are not the recipe site),
// and what comes back is checked as a picture by the caller, never by the
// header here. Rules:
// - https on the default port only, no user name or password, a host name (no IP address);
// - the address is checked inside the connection's own DNS lookup, so the IP
//   that was checked is the one connected to; every address must be public;
// - redirects are followed by hand, each one checked again, at most 3;
// - 8 s for everything, and at most 5 MB of body (stops reading at the limit);
// - no cookies, no browser User-Agent, no Referer.
// A failure is a fixed reason, never the address or what the server sent.

export const imageFetchLimits = {
  maxRedirects: 3,
  timeoutMs: 8_000,
  maxBytes: 5 * 1024 * 1024,
  maxUrlChars: 2_048,
} as const;

export type ImageFetchFailure =
  | "invalid_url"
  | "blocked_address"
  | "connection"
  | "redirect"
  | "status"
  | "not_image"
  | "too_large"
  | "timeout"
  | "aborted";

export type ImageFetchResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: ImageFetchFailure };

export type ImageFetchOptions = {
  signal?: AbortSignal;
  /** For tests: replaces the system resolver. */
  lookup?: Lookup;
  /** For tests and fixtures: replaces the HTTPS request. */
  fetchImpl?: FetchImpl;
};

/** The address when a picture may be fetched from it at all: https, default port, no credentials, a host name, at most 2 048 characters. */
export function checkImageUrl(input: string | URL): URL | null {
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
    url.href.length > imageFetchLimits.maxUrlChars;
  if (invalid) return null;
  url.hash = "";
  return url;
}

/** True for a Content-Type of "image/..." other than SVG (a document, not a picture). */
function isImageType(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return type.startsWith("image/") && !type.includes("svg");
}

/**
 * Fetches `input`'s bytes under the rules above. The caller decodes the bytes
 * (the picture is a picture only when it decodes). Never throws.
 */
export async function fetchImageBytes(input: string, options: ImageFetchOptions = {}): Promise<ImageFetchResult> {
  const first = checkImageUrl(input);
  if (!first) return { ok: false, reason: "invalid_url" };
  let url = first;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new DOMException("Timed out", "TimeoutError")), imageFetchLimits.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  const fetchImpl = options.fetchImpl ?? httpsFetch;
  const lookup = checkedLookup(options.lookup ?? systemLookup);
  const headers = {
    accept: "image/webp,image/jpeg,image/png,image/*;q=0.8",
    "user-agent": RECIPES_USER_AGENT,
  };

  try {
    for (let redirects = 0; ; redirects++) {
      let response: Response;
      try {
        signal.throwIfAborted();
        response = await fetchImpl(url, { signal, headers, lookup });
      } catch (error) {
        if (options.signal?.aborted) return { ok: false, reason: "aborted" };
        if (signal.aborted) return { ok: false, reason: "timeout" };
        return { ok: false, reason: error instanceof BlockedAddressError ? "blocked_address" : "connection" };
      }

      if (redirectStatuses.has(response.status)) {
        await response.body?.cancel().catch(() => {});
        const location = response.headers.get("location");
        if (!location || redirects >= imageFetchLimits.maxRedirects) return { ok: false, reason: "redirect" };
        let next: URL | null;
        try {
          next = checkImageUrl(new URL(location, url));
        } catch {
          next = null;
        }
        if (!next) return { ok: false, reason: "redirect" };
        url = next;
        continue;
      }

      if (response.status < 200 || response.status > 299) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, reason: "status" };
      }
      if (!isImageType(response.headers.get("content-type"))) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, reason: "not_image" };
      }
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > imageFetchLimits.maxBytes) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }

      let bytes: Uint8Array | null;
      try {
        bytes = response.body ? await readCapped(response.body, imageFetchLimits.maxBytes) : new Uint8Array();
      } catch {
        if (options.signal?.aborted) return { ok: false, reason: "aborted" };
        return { ok: false, reason: signal.aborted ? "timeout" : "connection" };
      }
      return bytes === null ? { ok: false, reason: "too_large" } : { ok: true, bytes };
    }
  } finally {
    clearTimeout(timer);
  }
}
