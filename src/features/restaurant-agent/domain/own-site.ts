// What counts as a restaurant's OWN site, and what we may fetch. Pure. The address of a restaurant's website comes from
// the finder (an address, not content); the text we use comes from fetching that page ourselves.

/** Hosts that are about a restaurant but are not its own site: social media, review and booking sites, maps. */
const notOwn = ["facebook.com", "instagram.com", "tripadvisor.", "google.", "yelp.", "thefork.", "bokabord.", "foursquare.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "linktr.ee", "wolt.com", "foodora.", "ubereats.com", "bolt.eu"];

/** The https URL to fetch for a website address, or null when it is not https, has credentials or a port, or is not an own site. */
export function ownSiteUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // A plain http address is upgraded: we only ever fetch https.
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || notOwn.some((entry) => (entry.endsWith(".") ? host.includes(entry) : host === entry || host.endsWith(`.${entry}`)))) return null;
  url.hash = "";
  return url.toString();
}

const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** True for an address we refuse to connect to: loopback, private, link-local, CGNAT, multicast, reserved, unspecified, and the IPv6 equivalents (also IPv4-mapped). */
export function isBlockedAddress(address: string): boolean {
  const text = address.trim().toLowerCase();
  const match = ipv4.exec(text);
  if (match) {
    const [a, b] = [Number(match[1]), Number(match[2])];
    if ([1, 2, 3, 4].some((i) => Number(match[i]) > 255)) return true;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0)
    );
  }
  if (!text.includes(":")) return true; // not an IP at all
  const mapped = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (mapped?.[1]) return isBlockedAddress(mapped[1]);
  if (/^::ffff:[0-9a-f:]+$/.test(text)) return true; // IPv4-mapped in hex form: refuse rather than parse
  if (text === "::" || text === "::1") return true;
  const first = text.split(":")[0] ?? "";
  const head = first === "" ? 0 : Number.parseInt(first, 16);
  if (Number.isNaN(head)) return true;
  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 documentation.
  return (head & 0xfe00) === 0xfc00 || (head & 0xffc0) === 0xfe80 || (head & 0xff00) === 0xff00 || text.startsWith("2001:db8:") || text.startsWith("2001:0db8:");
}
