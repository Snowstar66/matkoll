import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("are set on every path", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual(securityHeaders);
  });

  it("forbid framing, plugins and a foreign <base>, without a script policy (PPR, see docs/molnet.md)", () => {
    const csp = securityHeaders.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("default-src");
  });

  it("allow the camera for the app only, and set nosniff and the referrer policy", () => {
    const value = (key: string) => securityHeaders.find((header) => header.key === key)?.value;
    expect(value("Permissions-Policy")).toContain("camera=(self)");
    expect(value("Permissions-Policy")).toContain("microphone=()");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
