import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, type Result } from "@/lib/errors";
import type { FetchedPage, SafeFetchOptions } from "./safe-fetch";

// Which sites the import flow fetches from: the saved test pages only with
// AI_PROVIDER=mock on a local SITE_URL, the internet otherwise.

const env = { AI_PROVIDER: "mock", SITE_URL: "http://localhost:3100" };
vi.mock("@/server/env", () => ({ env }));

const safeFetch = vi.fn<(url: string, options: SafeFetchOptions) => Promise<Result<FetchedPage>>>(async (url) =>
  ok({ url, html: "" }),
);
vi.mock("./safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./safe-fetch")>()),
  safeFetch: (url: string, options: SafeFetchOptions) => safeFetch(url, options),
}));

const { fetchRecipePage } = await import("./index");

const options = () => ({ allowedDomains: ["koket.se"], signal: new AbortController().signal });

async function optionsFor(provider: string, siteUrl: string) {
  env.AI_PROVIDER = provider;
  env.SITE_URL = siteUrl;
  await fetchRecipePage("https://www.koket.se/x", options());
  return safeFetch.mock.calls[0][1];
}

beforeEach(() => {
  safeFetch.mockClear();
});

describe("fetchRecipePage", () => {
  it.each(["lmstudio", "anthropic", "openai"])("fetches from the internet with AI_PROVIDER=%s", async (provider) => {
    const passed = await optionsFor(provider, "http://localhost:3000");
    expect(passed.fetchImpl).toBeUndefined();
    expect(passed.lookup).toBeUndefined();
    expect(passed.allowedDomains).toEqual(["koket.se"]);
  });

  it.each(["http://localhost:3100", "http://127.0.0.1:3000"])("uses the saved pages with the mock on %s", async (siteUrl) => {
    const passed = await optionsFor("mock", siteUrl);
    expect(passed.fetchImpl).toBeTypeOf("function");
    expect(await passed.lookup?.("www.koket.se")).toEqual([{ address: "151.101.1.1", family: 4 }]);
  });

  it.each(["https://matkoll.example.se", "http://192.168.1.10:3000", "https://localhost.example.com"])(
    "never uses the saved pages on %s, even with the mock",
    async (siteUrl) => {
      const passed = await optionsFor("mock", siteUrl);
      expect(passed.fetchImpl).toBeUndefined();
      expect(passed.lookup).toBeUndefined();
    },
  );
});
