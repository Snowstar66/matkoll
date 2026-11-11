import { describe, expect, it } from "vitest";
import { isBlockedAddress, pastedMenuUrl } from "./own-site";

describe("pastedMenuUrl", () => {
  it("accepts an https link and strips the fragment", () => {
    expect(pastedMenuUrl("  https://www.trattoria.se/meny#lunch ")).toBe("https://www.trattoria.se/meny");
  });
  it("refuses http (not upgraded), credentials, odd ports, localhost, IP literals, other schemes, long and non-strings", () => {
    for (const value of ["http://www.trattoria.se/meny", "https://user:pw@a.se/", "https://a.se:8443/", "https://localhost/", "https://127.0.0.1/", "https://10.0.0.5/meny", "https://[::1]/", "https://169.254.169.254/latest", "ftp://a.se/", "javascript:alert(1)", "nonsense", "", null, 5, `https://a.se/${"x".repeat(2100)}`]) expect(pastedMenuUrl(value)).toBeNull();
  });
});

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, CGNAT, metadata, multicast and unspecified IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "999.1.1.1"]) expect(isBlockedAddress(ip)).toBe(true);
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "93.184.216.34"]) expect(isBlockedAddress(ip)).toBe(false);
  });
  it("blocks IPv6 loopback, unique-local, link-local, mapped private and unparsable input", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "not-an-ip", "2001:db8::1"]) expect(isBlockedAddress(ip)).toBe(true);
  });
  it("allows public IPv6 and a mapped public IPv4", () => {
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8"]) expect(isBlockedAddress(ip)).toBe(false);
  });
});
