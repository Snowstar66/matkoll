import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { isBlockedAddress, ownSiteUrl } from "../domain/own-site";

// Fetches ONE page of a restaurant's own website, safely (SSRF): https only, no credentials or ports, no IP-literal
// hosts, every address the host resolves to must be public (checked at connect time, in the socket's own lookup, so a
// DNS answer that changes between check and connect cannot slip through), redirects followed by hand (at most 3, each
// checked again), a size limit and a time limit, and only text content. A failure of any kind is `null`: a restaurant
// without a readable page is simply "menu missing". Nothing here logs a URL or content.

export type FetchedPage = { url: string; html: string };
export type PageFetcher = (url: string) => Promise<FetchedPage | null>;

const maxBytes = 400_000;
const maxRedirects = 3;
const totalMs = 6_000;

/** The socket's DNS lookup: resolves every address and refuses the connection when any of them is not public. */
function safeLookup(hostname: string, options: { all?: boolean }, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void): void {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) return callback(new Error("blocked_address"), "", 0);
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    return first ? callback(null, first.address, first.family) : callback(new Error("no_address"), "", 0);
  });
}

function once(url: string, deadline: number): Promise<{ status: number; location: string | null; html: string | null }> {
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new Error("timeout"));
    const req = request(url, { method: "GET", lookup: safeLookup as never, headers: { "user-agent": "LivskollBot/1.0 (+menu lookup for a household)", accept: "text/html,text/plain;q=0.9", "accept-language": "sv,en;q=0.5" } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      const type = String(res.headers["content-type"] ?? "").toLowerCase();
      if (status < 200 || status >= 300 || !/text\/html|text\/plain|application\/xhtml/.test(type)) {
        res.destroy();
        return resolve({ status, location, html: null });
      }
      const charset = /charset=([\w-]+)/.exec(type)?.[1] ?? "utf-8";
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      const finish = () => {
        let html: string;
        try {
          html = new TextDecoder(charset).decode(Buffer.concat(chunks));
        } catch {
          html = Buffer.concat(chunks).toString("utf8");
        }
        resolve({ status, location, html });
      };
      res.on("end", finish);
      // A body cut at the size limit is still a usable start of the page.
      res.on("close", finish);
      res.on("error", reject);
    });
    req.setTimeout(left, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** The page at `address` (an https URL of a restaurant's own site), or null when it cannot be fetched safely. */
export const fetchOwnPage: PageFetcher = async (address) => {
  const deadline = Date.now() + totalMs;
  let current = ownSiteUrl(address);
  try {
    for (let hop = 0; hop <= maxRedirects && current; hop += 1) {
      const host = new URL(current).hostname.replace(/^\[|\]$/g, "");
      if (isIP(host) !== 0) return null;
      const answer = await once(current, deadline);
      if (answer.status >= 300 && answer.status < 400 && answer.location) {
        current = ownSiteUrl(new URL(answer.location, current).toString());
        continue;
      }
      return answer.html === null ? null : { url: current, html: answer.html };
    }
  } catch {
    return null;
  }
  return null;
};
