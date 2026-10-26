import "server-only";
import { BlockList, isIP } from "node:net";

// Which IP addresses safeFetch may connect to (AD-11): public unicast only.
// Private, loopback, link-local, shared, documentation, benchmarking,
// multicast and other reserved ranges are refused, for IPv4 and IPv6.

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // shared address space (carrier-grade NAT)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation (TEST-NET-1)
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation (TEST-NET-2)
  ["203.0.113.0", 24], // documentation (TEST-NET-3)
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and 255.255.255.255
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}

/** Global unicast IPv6 (2000::/3). Everything outside it, ::1, fc00::/7, fe80::/10 and ff00::/8 among them, is refused. */
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

/** Special ranges inside 2000::/3. */
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23], // IETF protocol assignments, Teredo among them
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4: would reach an embedded IPv4 address
  ["3fff::", 20], // documentation
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

/**
 * True when `address` is an IP address safeFetch may connect to. Anything that
 * is not an IP address, IPv4-mapped IPv6 included, is refused.
 */
export function isPublicAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return !blockedV4.check(address, "ipv4");
    case 6:
      return globalV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
    default:
      return false;
  }
}
