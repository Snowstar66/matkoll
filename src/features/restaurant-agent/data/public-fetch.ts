import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { isBlockedAddress, pastedMenuUrl } from "../domain/own-site";

// Fetches ONE page that a person pasted the link to (a restaurant's menu), safely (SSRF): https only, no credentials or
// ports, no IP-literal hosts, every address the host resolves to must be public (checked at connect time, in the socket's
// own lookup, so a DNS answer that changes between check and connect cannot slip through), redirects followed by hand (at
// most 3, each checked again), a size limit (400 KB) and a time limit (6 s), and only text content: a PDF or an image
// is reported as such (the person is sent to the photo). Nothing here logs a URL or content.

export type FetchedPage = { url: string; html: string };
export type PageResult = ({ ok: true } & FetchedPage) | { ok: false; reason: "invalid" | "blocked" | "unreachable" | "not_text" };
export type PageFetcher = (url: string) => Promise<PageResult>;

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

type Once = { status: number; location: string | null; html: string | null; textual: boolean };

function once(url: string, deadline: number): Promise<Once> {
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new Error("timeout"));
    const req = request(url, { method: "GET", lookup: safeLookup as never, headers: { "user-agent": "LivskollBot/1.0 (+menu link pasted by a household)", accept: "text/html,text/plain;q=0.9", "accept-language": "sv,en;q=0.5" } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      const type = String(res.headers["content-type"] ?? "").toLowerCase();
      const textual = /text\/html|text\/plain|application\/xhtml/.test(type);
      if (status < 200 || status >= 300 || !textual) {
        res.destroy();
        return resolve({ status, location, html: null, textual });
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
        resolve({ status, location, html, textual: true });
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

/** The page at a pasted https `address`, or why it could not be fetched safely. */
export const fetchPublicPage: PageFetcher = async (address) => {
  const deadline = Date.now() + totalMs;
  let current = pastedMenuUrl(address);
  if (!current) return { ok: false, reason: "invalid" };
  try {
    for (let hop = 0; hop <= maxRedirects && current; hop += 1) {
      const host = new URL(current).hostname.replace(/^\[|\]$/g, "");
      if (isIP(host) !== 0) return { ok: false, reason: "blocked" };
      const answer = await once(current, deadline);
      if (answer.status >= 300 && answer.status < 400 && answer.location) {
        // Each redirect is checked again, as strictly as the pasted address.
        current = pastedMenuUrl(new URL(answer.location, current).toString());
        if (!current) return { ok: false, reason: "blocked" };
        continue;
      }
      if (answer.html !== null) return { ok: true, url: current, html: answer.html };
      return { ok: false, reason: answer.status >= 200 && answer.status < 300 && !answer.textual ? "not_text" : "unreachable" };
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.message === "blocked_address" ? "blocked" : "unreachable" };
  }
  return { ok: false, reason: "unreachable" };
};
