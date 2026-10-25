import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, type Result } from "@/lib/errors";
import { checkLinkSyntax, fetchLimits, safeFetch, type FetchImpl, type Lookup, type ResolvedAddress } from "./safe-fetch";

// safeFetch with a fake resolver and a fake request (AD-11): no network. The
// fake request does what a real connection does first, it resolves the host
// through the checked lookup it was given, and records which hosts it then
// "connected" to.

const allowedDomains = ["koket.se", "tasteline.com"];
const publicV4: ResolvedAddress = { address: "151.101.1.1", family: 4 };
const page = "<html><body><h1>Kladdkaka</h1></body></html>";

type Route = (url: URL) => Response | Promise<Response>;

let resolved: Record<string, readonly ResolvedAddress[]>;
let routes: Record<string, Route>;
let connected: string[];
let lookups: string[];
let seenHeaders: Readonly<Record<string, string>> | undefined;

const lookup: Lookup = async (hostname) => {
  lookups.push(hostname);
  return resolved[hostname] ?? [publicV4];
};

const fetchImpl: FetchImpl = async (url, init) => {
  await init.lookup(url.hostname);
  connected.push(url.href);
  seenHeaders = init.headers;
  const route = routes[url.href];
  if (!route) return new Response("Not found", { status: 404, headers: { "content-type": "text/html" } });
  return route(url);
};

const html = (body: BodyInit = page, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
const redirect = (location: string, status = 301) => new Response(null, { status, headers: { location } });

const codeOf = (result: Result<unknown>) => (result.ok ? null : result.error.code);

const get = (url: string, signal: AbortSignal = new AbortController().signal) =>
  safeFetch(url, { allowedDomains, signal, lookup, fetchImpl });

beforeEach(() => {
  resolved = {};
  routes = {};
  connected = [];
  lookups = [];
  seenHeaders = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("approved links", () => {
  it.each(["https://www.koket.se/kladdkaka", "https://koket.se/kladdkaka", "https://WWW.Tasteline.com/recept/x/"])(
    "fetches %s",
    async (url) => {
      routes[new URL(url).href] = () => html();
      const result = await get(url);
      expect(result).toEqual({ ok: true, data: { url: new URL(url).href, html: page } });
      expect(lookups).toEqual([new URL(url).hostname]);
    },
  );

  it("drops the fragment and keeps the query", async () => {
    routes["https://www.koket.se/kladdkaka?portioner=4"] = () => html();
    const result = await get("https://www.koket.se/kladdkaka?portioner=4#steg");
    expect(result.ok && result.data.url).toBe("https://www.koket.se/kladdkaka?portioner=4");
  });

  it("asks for HTML in Swedish", async () => {
    routes["https://www.koket.se/x"] = () => html();
    await get("https://www.koket.se/x");
    expect(seenHeaders?.accept).toMatch(/^text\/html/);
    expect(seenHeaders?.["accept-language"]).toMatch(/^sv-SE/);
  });
});

describe("refused before any connection", () => {
  it.each([
    ["another site", "https://example.com/recept", "example.com"],
    ["another site with www.", "https://www.example.com/recept", "example.com"],
    ["a subdomain other than www.", "https://recept.koket.se/x", "recept.koket.se"],
    ["a look-alike", "https://koket.se.example.com/x", "koket.se.example.com"],
  ])("%s gives fetch_domain_not_allowed with the domain", async (_name, url, domain) => {
    expect(await get(url)).toEqual(fail("fetch_domain_not_allowed", { domain }));
    expect(lookups).toEqual([]);
    expect(connected).toEqual([]);
  });

  it("refuses everything without approved domains", async () => {
    const result = await safeFetch("https://www.koket.se/x", {
      allowedDomains: [],
      signal: new AbortController().signal,
      lookup,
      fetchImpl,
    });
    expect(result).toEqual(fail("fetch_domain_not_allowed", { domain: "koket.se" }));
    expect(connected).toEqual([]);
  });

  it.each([
    ["http", "http://www.koket.se/x"],
    ["an IPv4 address", "https://127.0.0.1/x"],
    ["an IPv4 address as a number", "https://2130706433/x"],
    ["an IPv6 address", "https://[::1]/x"],
    ["another port", "https://www.koket.se:8443/x"],
    ["a user name", "https://pontus@www.koket.se/x"],
    ["a password", "https://a:b@www.koket.se/x"],
    ["another scheme", "file:///etc/passwd"],
    ["text that is not an address", "kladdkaka"],
    ["an empty string", ""],
    ["an address over 2 048 characters", `https://www.koket.se/${"a".repeat(2_030)}`],
  ])("%s gives fetch_invalid_url", async (_name, url) => {
    expect(await get(url)).toEqual(fail("fetch_invalid_url"));
    expect(lookups).toEqual([]);
    expect(connected).toEqual([]);
  });
});

describe("addresses are checked in the connection's lookup", () => {
  it.each([
    "10.0.0.1",
    "172.16.5.4",
    "192.168.1.10",
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "::",
  ])("an approved domain that resolves to %s gives fetch_blocked", async (address) => {
    resolved["www.koket.se"] = [{ address, family: address.includes(":") ? 6 : 4 }];
    routes["https://www.koket.se/x"] = () => html();
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
    expect(lookups).toEqual(["www.koket.se"]);
    expect(connected).toEqual([]);
  });

  it("refuses a host with one public and one private address", async () => {
    resolved["www.koket.se"] = [publicV4, { address: "10.0.0.1", family: 4 }];
    routes["https://www.koket.se/x"] = () => html();
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
    expect(connected).toEqual([]);
  });

  it("refuses a host without addresses", async () => {
    resolved["www.koket.se"] = [];
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
  });

  it("allows public IPv6", async () => {
    resolved["www.koket.se"] = [{ address: "2a04:4e42::645", family: 6 }];
    routes["https://www.koket.se/x"] = () => html();
    expect((await get("https://www.koket.se/x")).ok).toBe(true);
  });

  it("gives fetch_blocked when the connection fails", async () => {
    const result = await safeFetch("https://www.koket.se/x", {
      allowedDomains,
      signal: new AbortController().signal,
      lookup,
      fetchImpl: async () => {
        throw new Error("ECONNRESET");
      },
    });
    expect(result).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
  });
});

describe("redirects", () => {
  it("follows a redirect within the approved domains, checking the new host", async () => {
    routes["https://koket.se/x"] = () => redirect("https://www.koket.se/x");
    routes["https://www.koket.se/x"] = () => html();
    const result = await get("https://koket.se/x");
    expect(result).toEqual({ ok: true, data: { url: "https://www.koket.se/x", html: page } });
    expect(lookups).toEqual(["koket.se", "www.koket.se"]);
  });

  it("follows a relative Location and every redirect status", async () => {
    routes["https://www.koket.se/a"] = () => redirect("/b", 302);
    routes["https://www.koket.se/b"] = () => redirect("c", 303);
    routes["https://www.koket.se/c"] = () => redirect("https://www.tasteline.com/d", 307);
    routes["https://www.tasteline.com/d"] = () => html();
    const result = await get("https://www.koket.se/a");
    expect(result.ok && result.data.url).toBe("https://www.tasteline.com/d");
  });

  it("gives fetch_domain_not_allowed for a redirect to another site, without connecting to it", async () => {
    routes["https://www.koket.se/x"] = () => redirect("https://evil.example/recept", 302);
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_domain_not_allowed", { domain: "evil.example" }));
    expect(lookups).toEqual(["www.koket.se"]);
  });

  it.each([
    ["http", "http://www.koket.se/x"],
    ["an IP address", "https://169.254.169.254/latest/meta-data"],
    ["an address over 2 048 characters", `https://www.koket.se/${"a".repeat(2_030)}`],
  ])("gives fetch_blocked for a redirect to %s", async (_name, location) => {
    routes["https://www.koket.se/x"] = () => redirect(location);
    expect(codeOf(await get("https://www.koket.se/x"))).toBe("fetch_blocked");
    expect(connected).toEqual(["https://www.koket.se/x"]);
  });

  it("gives fetch_blocked when a redirect's host resolves to a private address", async () => {
    resolved["koket.se"] = [{ address: "192.168.0.1", family: 4 }];
    routes["https://www.koket.se/x"] = () => redirect("https://koket.se/x");
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
    expect(connected).toEqual(["https://www.koket.se/x"]);
  });

  it("follows at most 3 redirects", async () => {
    for (let step = 0; step < 4; step++) routes[`https://www.koket.se/${step}`] = () => redirect(`/${step + 1}`);
    routes["https://www.koket.se/3"] = () => html();
    expect((await get("https://www.koket.se/0")).ok).toBe(true);

    routes["https://www.koket.se/3"] = () => redirect("/4");
    routes["https://www.koket.se/4"] = () => html();
    connected = [];
    expect(await get("https://www.koket.se/0")).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
    expect(connected).toHaveLength(4);
  });

  it("gives fetch_blocked for a redirect without Location", async () => {
    routes["https://www.koket.se/x"] = () => new Response(null, { status: 302 });
    expect(codeOf(await get("https://www.koket.se/x"))).toBe("fetch_blocked");
  });
});

describe("answers that are not a usable page", () => {
  it.each([403, 404, 429, 500, 503])("HTTP %i gives fetch_blocked", async (status) => {
    routes["https://www.koket.se/x"] = () => new Response("Nej", { status, headers: { "content-type": "text/html" } });
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
  });

  it.each(["application/json", "application/pdf", "image/jpeg", ""])("content type %j gives fetch_blocked", async (type) => {
    routes["https://www.koket.se/x"] = () => new Response("{}", { status: 200, headers: { "content-type": type } });
    expect(codeOf(await get("https://www.koket.se/x"))).toBe("fetch_blocked");
  });

  it("accepts XHTML", async () => {
    routes["https://www.koket.se/x"] = () => html(page, { "content-type": "application/xhtml+xml" });
    expect((await get("https://www.koket.se/x")).ok).toBe(true);
  });
});

describe("size", () => {
  it("gives fetch_too_large for a Content-Length over 3 MB, without reading", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    routes["https://www.koket.se/x"] = () => html(body, { "content-length": String(fetchLimits.maxBytes + 1) });
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_too_large", { domain: "koket.se" }));
    expect(pulled).toBe(false);
  });

  it("stops reading at 3 MB when the size is not given", async () => {
    const chunk = new Uint8Array(256 * 1024).fill(97);
    let sent = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    routes["https://www.koket.se/x"] = () => html(body);
    expect(await get("https://www.koket.se/x")).toEqual(fail("fetch_too_large", { domain: "koket.se" }));
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThanOrEqual(fetchLimits.maxBytes + 2 * chunk.byteLength);
  });

  it("reads a page of exactly 3 MB", async () => {
    routes["https://www.koket.se/x"] = () => html(new Uint8Array(fetchLimits.maxBytes).fill(97));
    const result = await get("https://www.koket.se/x");
    expect(result.ok && result.data.html.length).toBe(fetchLimits.maxBytes);
  });
});

describe("time", () => {
  /** A request that answers only when its signal aborts. */
  const hanging: FetchImpl = async (url, init) => {
    await init.lookup(url.hostname);
    return new Promise((_resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason);
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  };

  it("gives fetch_timeout after 10 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = safeFetch("https://www.koket.se/x", {
      allowedDomains,
      signal: new AbortController().signal,
      lookup,
      fetchImpl: hanging,
    });
    await vi.advanceTimersByTimeAsync(fetchLimits.timeoutMs - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(fail("fetch_timeout", { domain: "koket.se" }));
  });

  it("counts the body in the 10 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = safeFetch("https://www.koket.se/x", {
      allowedDomains,
      signal: new AbortController().signal,
      lookup,
      fetchImpl: async (_url, init) =>
        html(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<html>"));
              init.signal.addEventListener("abort", () => controller.error(init.signal.reason));
            },
          }),
        ),
    });
    await vi.advanceTimersByTimeAsync(fetchLimits.timeoutMs);
    expect(await pending).toEqual(fail("fetch_timeout", { domain: "koket.se" }));
  });

  it("gives fetch_aborted, not an error, when the caller aborts", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const controller = new AbortController();
    const pending = safeFetch("https://www.koket.se/x", {
      allowedDomains,
      signal: controller.signal,
      lookup,
      fetchImpl: hanging,
    });
    controller.abort();
    expect(await pending).toEqual(fail("fetch_aborted"));
    expect(console.error).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("fetch_aborted", { reason: "aborted" });
  });

  it("gives fetch_aborted when the caller aborts while the body is read", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const controller = new AbortController();
    const pending = safeFetch("https://www.koket.se/x", {
      allowedDomains,
      signal: controller.signal,
      lookup,
      fetchImpl: async (_url, init) =>
        html(
          new ReadableStream<Uint8Array>({
            start(stream) {
              init.signal.addEventListener("abort", () => stream.error(init.signal.reason));
              setTimeout(() => controller.abort(), 0);
            },
          }),
        ),
    });
    expect(await pending).toEqual(fail("fetch_aborted"));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not start when the caller has already aborted", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const controller = new AbortController();
    controller.abort();
    expect(codeOf(await get("https://www.koket.se/x", controller.signal))).toBe("fetch_aborted");
    expect(lookups).toEqual([]);
  });
});

describe("character sets", () => {
  const latin1 = new Uint8Array([0x3c, 0x70, 0x3e, 0x6b, 0xf6, 0x74, 0x74, 0x3c, 0x2f, 0x70, 0x3e]); // <p>kött</p>

  it("follows the charset in Content-Type", async () => {
    routes["https://www.koket.se/x"] = () => html(latin1, { "content-type": "text/html; charset=ISO-8859-1" });
    const result = await get("https://www.koket.se/x");
    expect(result.ok && result.data.html).toBe("<p>kött</p>");
  });

  it("follows a single-quoted charset in Content-Type", async () => {
    routes["https://www.koket.se/x"] = () => html(latin1, { "content-type": "text/html; charset='iso-8859-1'" });
    const result = await get("https://www.koket.se/x");
    expect(result.ok && result.data.html).toBe("<p>kött</p>");
  });

  it("ignores a <meta> that says UTF-16 and reads UTF-8", async () => {
    const bytes = new TextEncoder().encode("<meta charset='utf-16'><p>kött</p>");
    routes["https://www.koket.se/x"] = () => html(bytes, { "content-type": "text/html" });
    const result = await get("https://www.koket.se/x");
    expect(result.ok && result.data.html).toBe("<meta charset='utf-16'><p>kött</p>");
  });

  it("follows a <meta charset> when the header has none", async () => {
    const head = new TextEncoder().encode('<meta charset="windows-1252">');
    routes["https://www.koket.se/x"] = () => html(new Uint8Array([...head, ...latin1]), { "content-type": "text/html" });
    const result = await get("https://www.koket.se/x");
    expect(result.ok && result.data.html).toBe('<meta charset="windows-1252"><p>kött</p>');
  });

  it("reads UTF-8 otherwise, also with an unknown label", async () => {
    routes["https://www.koket.se/x"] = () =>
      html(new TextEncoder().encode("<p>kött</p>"), { "content-type": "text/html; charset=klingon" });
    const result = await get("https://www.koket.se/x");
    expect(result.ok && result.data.html).toBe("<p>kött</p>");
  });
});

describe("logging", () => {
  it("logs the code and a fixed reason, never the address", async () => {
    const log = vi.mocked(console.error);
    resolved["www.koket.se"] = [{ address: "10.0.0.1", family: 4 }];
    await get("https://www.koket.se/hemlig-sokvag");
    expect(log).toHaveBeenCalledWith("fetch_blocked", { reason: "address" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("hemlig");
  });
});

describe("checkLinkSyntax", () => {
  it.each(["https://www.koket.se/x", "https://example.com/recept"])("accepts %s, whatever the site", (url) => {
    expect(checkLinkSyntax(url)?.href).toBe(url);
  });

  it.each(["http://www.koket.se/x", "https://127.0.0.1/x", "https://[::1]/", "https://a:b@koket.se/", "https://koket.se:444/", "x", `https://koket.se/${"a".repeat(2_040)}`])(
    "refuses %s",
    (url) => {
      expect(checkLinkSyntax(url)).toBeNull();
    },
  );
});
