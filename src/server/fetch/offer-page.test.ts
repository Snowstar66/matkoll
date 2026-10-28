import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchImpl } from "./safe-fetch";

// fetchOfferPage (Story 9.1, AD-25) on the saved pages in tests/fixtures/sites
// (AI_PROVIDER=mock and a local SITE_URL): one request, the offers' honest
// User-Agent, and the last answer's status for the caller. ica.se is never
// called. And the saved offer pages' days, which follow the week the tests run in.

vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", SITE_URL: "http://localhost:3100" } }));

const seen: { url: string; headers: Readonly<Record<string, string>> }[] = [];
vi.mock("./fixture-sites", async (importOriginal) => {
  const sites = await importOriginal<typeof import("./fixture-sites")>();
  return {
    ...sites,
    fixtureSites: () => {
      const real = sites.fixtureSites();
      const fetchImpl: FetchImpl = (url, init) => {
        seen.push({ url: url.href, headers: init.headers });
        return real.fetchImpl(url, init);
      };
      return { lookup: real.lookup, fetchImpl };
    },
  };
});

const { fetchOfferPage, OFFERS_USER_AGENT } = await import("./index");
const { fillFixtureDates } = await import("./fixture-sites");

const options = () => ({ allowedDomains: ["www.ica.se"], signal: new AbortController().signal });
const link = (slug: string) => `https://www.ica.se/erbjudanden/${slug}/`;

beforeEach(() => {
  seen.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOfferPage", () => {
  it("fetches the page once with the offers' User-Agent, no cookies and nothing like a browser", async () => {
    const { page, status } = await fetchOfferPage(link("matkoll-test-butik-1000001"), options());
    expect(page.ok && page.data.html).toContain("window.__INITIAL_DATA__");
    expect(status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].headers["user-agent"]).toBe(OFFERS_USER_AGENT);
    expect(OFFERS_USER_AGENT).toBe("Mozilla/5.0 (compatible; Matkoll/1.0; +weekly offers for personal use)");
    expect(Object.keys(seen[0].headers).sort()).toEqual(["accept", "accept-language", "user-agent"]);
  });

  it.each([
    ["matkoll-test-nekad-1000005", 403],
    ["matkoll-test-for-manga-1000006", 429],
    ["matkoll-test-serverfel-1000007", 500],
  ])("gives the status of a refusal from %s, after one request", async (slug, code) => {
    const { page, status } = await fetchOfferPage(link(slug), options());
    expect(page.ok).toBe(false);
    expect(status).toBe(code);
    expect(seen).toHaveLength(1);
  });

  it("follows a redirect within ica.se, and stops one to another host before connecting", async () => {
    const moved = await fetchOfferPage(link("matkoll-test-flyttad-1000010"), options());
    expect(moved.page.ok && moved.page.data.url).toBe("https://www.ica.se/");
    const away = await fetchOfferPage(link("matkoll-test-annan-sajt-1000011"), options());
    expect(away.page.ok ? null : away.page.error.code).toBe("fetch_domain_not_allowed");
    expect(seen.map((request) => request.url)).not.toContain("https://evil.example/erbjudanden/");
  });

  it("refuses a host that is not an offer site", async () => {
    const { page, status } = await fetchOfferPage("https://www.koket.se/chow-mein-med-lovbiff", options());
    expect(page.ok ? null : page.error.code).toBe("fetch_domain_not_allowed");
    expect(status).toBeNull();
    expect(seen).toEqual([]);
  });
});

describe("fillFixtureDates", () => {
  it("sets {{sunday}} to this week's Sunday in Swedish time, and {{sunday+N}} N days later", () => {
    const text = "a {{sunday}} b {{sunday+21}} c";
    expect(fillFixtureDates(text, new Date("2026-10-28T12:00:00+01:00"))).toBe("a 2026-11-01 b 2026-11-22 c");
    expect(fillFixtureDates(text, new Date("2026-11-01T23:59:00+01:00"))).toBe("a 2026-11-01 b 2026-11-22 c");
    expect(fillFixtureDates(text, new Date("2026-11-02T00:00:00+01:00"))).toBe("a 2026-11-08 b 2026-11-29 c");
    expect(fillFixtureDates("<p>Inga datum</p>")).toBe("<p>Inga datum</p>");
  });
});
