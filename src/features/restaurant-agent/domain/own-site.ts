// What we may fetch when a person pastes the link to a restaurant's menu, and which addresses we never connect to. Pure.

const maxUrlChars = 2_048;

/**
 * The https URL to fetch for a pasted menu link, or null when it is not https (a plain http link is refused, not
 * upgraded), has credentials or a port, a host without a dot (localhost) or an IP literal, or is too long.
 */
export function pastedMenuUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "" || text.length > maxUrlChars) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
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
