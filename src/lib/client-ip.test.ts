import { describe, expect, it } from "vitest";
import { clientIpFrom, ipLogTag, sha256Hex } from "./client-ip";

describe("clientIpFrom", () => {
  it.each([
    [{ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, "203.0.113.7"],
    [{ "x-forwarded-for": " 2001:db8::1 " }, "2001:db8::1"],
    [{ "x-real-ip": "198.51.100.2" }, "198.51.100.2"],
    [{ "x-forwarded-for": "inte-en-ip", "x-real-ip": "198.51.100.2" }, "198.51.100.2"],
    [{ "x-forwarded-for": "inte-en-ip" }, null],
    [{}, null],
  ])("reads %o as %s", (headers, expected) => {
    expect(clientIpFrom(new Headers(headers))).toBe(expected);
  });
});

describe("ipLogTag", () => {
  it("logs 8 hex characters of the hash, never the IP", () => {
    const tag = ipLogTag("203.0.113.7");
    expect(tag).toMatch(/^[0-9a-f]{8}$/);
    expect(tag).toBe(sha256Hex("203.0.113.7").slice(0, 8));
    expect(ipLogTag(null)).toBe("none");
  });
});
