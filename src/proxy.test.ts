import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

// The proxy's matcher (AD-3, AD-27): the manifest and the generated app icons
// load without a session; every page still goes through the proxy.

vi.mock("@/server/env", () => ({ env: {} }));

const { config } = await import("./proxy");

const runsProxy = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it.each([
    "/manifest.webmanifest",
    "/icon",
    "/icon/192",
    "/icon/512?3f2a1b0c9d8e7f6a",
    "/icon/maskable",
    "/apple-icon",
    "/apple-icon?3f2a1b0c9d8e7f6a",
    "/apple-icon/0",
    "/favicon.ico",
    "/_next/static/chunks/main.js",
  ])("lets %s through without the proxy", (url) => {
    expect(runsProxy(url)).toBe(false);
  });

  it.each([
    "/",
    "/recept",
    "/recept/0b6f0a1e-1111-4222-8333-944445555666",
    "/matsedel",
    "/matsedel/tidigare",
    "/lista",
    "/hemma",
    "/installningar",
    "/logga-in",
    "/auth/confirm",
    "/api/pantry/photo",
    // Look-alikes of the icon paths are pages like any other.
    "/icons",
    "/iconx",
    "/icon/192/extra",
    "/apple-icons",
    "/recept/icon",
    "/installningar/apple-icon",
    "/manifest",
  ])("runs the proxy for %s", (url) => {
    expect(runsProxy(url)).toBe(true);
  });
});
