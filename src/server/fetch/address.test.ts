import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./address";

describe("isPublicAddress", () => {
  it.each(["151.101.1.1", "8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.0", "172.32.0.1", "2a04:4e42::645", "2606:4700::1111"])(
    "allows %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    ["this network", "0.1.2.3"],
    ["private 10/8", "10.255.0.1"],
    ["shared 100.64/10", "100.64.0.1"],
    ["loopback", "127.0.0.2"],
    ["link-local and cloud metadata", "169.254.169.254"],
    ["private 172.16/12", "172.31.255.254"],
    ["IETF assignments", "192.0.0.8"],
    ["documentation", "192.0.2.1"],
    ["private 192.168/16", "192.168.0.1"],
    ["benchmarking", "198.19.0.1"],
    ["documentation 2", "198.51.100.7"],
    ["documentation 3", "203.0.113.9"],
    ["multicast", "224.0.0.1"],
    ["reserved", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["IPv6 unspecified", "::"],
    ["IPv6 loopback", "::1"],
    ["IPv4-mapped", "::ffff:127.0.0.1"],
    ["IPv4-mapped public", "::ffff:8.8.8.8"],
    ["unique local fc00::/7", "fc00::1"],
    ["unique local fd", "fdff:ffff::1"],
    ["link-local", "fe80::1"],
    ["multicast", "ff02::1"],
    ["NAT64", "64:ff9b::a00:1"],
    ["Teredo", "2001:0:4136:e378::1"],
    ["IPv6 documentation", "2001:db8::1"],
    ["6to4", "2002:a00:1::1"],
    ["not an address", "koket.se"],
    ["empty", ""],
  ])("refuses %s (%s)", (_name, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});
