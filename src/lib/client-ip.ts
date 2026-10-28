import { createHash } from "node:crypto";
import { isIP } from "node:net";

// The browser's IP for limits on login attempts (Story 11.6). On Vercel,
// `x-forwarded-for` and `x-real-ip` are set by Vercel's edge and overwrite
// what the browser sent; without such a proxy in front (local dev) they can be
// made up, so the IP is only ever a key for counting, never a permission.

/** The first valid IP in `x-forwarded-for`, else `x-real-ip`, else null. */
export function clientIpFrom(headers: Pick<Headers, "get">): string | null {
  const candidates = [headers.get("x-forwarded-for")?.split(",")[0], headers.get("x-real-ip")];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && isIP(ip) !== 0) return ip;
  }
  return null;
}

/** A sha256 hex digest, for keys that must not hold an address or an IP as such. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The first 8 hex characters of the IP's hash, the most of an IP that is logged. */
export function ipLogTag(ip: string | null): string {
  return ip ? sha256Hex(ip).slice(0, 8) : "none";
}
