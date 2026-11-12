import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkImageUrl, fetchImageBytes, imageFetchLimits } from "./image-fetch";
import type { FetchImpl, Lookup, ResolvedAddress } from "./safe-fetch";

// fetchImageBytes with a fake resolver and a fake request: no network. The fake
// request does what a real connection does first, it resolves the host through
// the checked lookup it was given, and records which addresses it "connected" to.

const publicV4: ResolvedAddress = { address: "151.101.1.1", family: 4 };
const bytes = new Uint8Array([1, 2, 3, 4]);

type Route = (url: URL) => Response | Promise<Response>;

let resolved: Record<string, readonly ResolvedAddress[]>;
let routes: Record<string, Route>;
let connected: string[];
let seenHeaders: Readonly<Record<string, string>> | undefined;

const lookup: Lookup = async (hostname) => resolved[hostname] ?? [publicV4];

const fetchImpl: FetchImpl = async (url, init) => {
  await init.lookup(url.hostname);
  connected.push(url.href);
  seenHeaders = init.headers;
  const route = routes[url.href];
  return route ? route(url) : new Response("Not found", { status: 404, headers: { "content-type": "text/html" } });
};

const image = (body: BodyInit = bytes, type = "image/jpeg", extra: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": type, ...extra } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

const get = (url: string, signal?: AbortSignal) => fetchImageBytes(url, { signal, lookup, fetchImpl });

beforeEach(() => {
  resolved = {};
  routes = {};
  connected = [];
  seenHeaders = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("checkImageUrl", () => {
  it("takes an https address on a host name", () => {
    expect(checkImageUrl("https://img.koket.se/a/b.jpg?w=800#x")?.href).toBe("https://img.koket.se/a/b.jpg?w=800");
  });

  it.each([
    ["http", "http://img.koket.se/a.jpg"],
    ["a user name", "https://user:pw@img.koket.se/a.jpg"],
    ["a port", "https://img.koket.se:8443/a.jpg"],
    ["an IPv4 address", "https://151.101.1.1/a.jpg"],
    ["a private IPv4 address", "https://10.0.0.1/a.jpg"],
    ["an IPv6 address", "https://[2001:4860:4860::8888]/a.jpg"],
    ["a decimal IP address", "https://2130706433/a.jpg"],
    ["a data address", "data:image/png;base64,AAAA"],
    ["a file address", "file:///etc/passwd"],
    ["not an address", "not a url"],
    ["more than 2 048 characters", `https://img.koket.se/${"a".repeat(2100)}`],
  ])("refuses %s", (_name, address) => {
    expect(checkImageUrl(address)).toBeNull();
  });
});

describe("fetchImageBytes", () => {
  it("gives the bytes of a picture, asking for pictures with no cookie or referrer", async () => {
    routes["https://img.koket.se/a.jpg"] = () => image();
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: true, bytes });
    expect(connected).toEqual(["https://img.koket.se/a.jpg"]);
    expect(Object.keys(seenHeaders ?? {}).sort()).toEqual(["accept", "user-agent"]);
    expect(seenHeaders?.["user-agent"]).toContain("Matkoll");
  });

  it("takes a picture from any public host, not only the approved recipe sites", async () => {
    routes["https://cdn.example-images.net/x.webp"] = () => image(bytes, "image/webp");
    expect(await get("https://cdn.example-images.net/x.webp")).toEqual({ ok: true, bytes });
  });

  it("refuses an address that is not fetchable before connecting", async () => {
    expect(await get("http://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "invalid_url" });
    expect(await get("https://10.0.0.1/a.jpg")).toEqual({ ok: false, reason: "invalid_url" });
    expect(connected).toEqual([]);
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["private 10/8", "10.1.2.3"],
    ["private 192.168/16", "192.168.1.10"],
    ["private 172.16/12", "172.20.0.5"],
    ["link-local / cloud metadata", "169.254.169.254"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["unspecified", "0.0.0.0"],
  ])("blocks a host that resolves to a %s address, after the DNS lookup", async (_name, address) => {
    resolved["evil.example"] = [{ address, family: 4 }];
    routes["https://evil.example/a.jpg"] = () => image();
    expect(await get("https://evil.example/a.jpg")).toEqual({ ok: false, reason: "blocked_address" });
    expect(connected).toEqual([]);
  });

  it.each(["::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2002:7f00:1::"])("blocks a host that resolves to the IPv6 address %s", async (address) => {
    resolved["evil.example"] = [{ address, family: 6 }];
    expect(await get("https://evil.example/a.jpg")).toEqual({ ok: false, reason: "blocked_address" });
    expect(connected).toEqual([]);
  });

  it("blocks a host with one public and one private address (DNS rebinding with two answers)", async () => {
    resolved["evil.example"] = [publicV4, { address: "10.0.0.1", family: 4 }];
    expect(await get("https://evil.example/a.jpg")).toEqual({ ok: false, reason: "blocked_address" });
  });

  it("follows a redirect and checks the new host's addresses too", async () => {
    resolved["internal.example"] = [{ address: "10.0.0.7", family: 4 }];
    routes["https://img.koket.se/a.jpg"] = () => redirect("https://internal.example/secret.jpg");
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "blocked_address" });
    expect(connected).toEqual(["https://img.koket.se/a.jpg"]);
  });

  it("follows relative redirects to the picture", async () => {
    routes["https://img.koket.se/a.jpg"] = () => redirect("/b.jpg", 301);
    routes["https://img.koket.se/b.jpg"] = () => image();
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: true, bytes });
  });

  it.each(["http://img.koket.se/b.jpg", "https://127.0.0.1/b.jpg", "https://user:pw@img.koket.se/b.jpg", "https://img.koket.se:444/b.jpg", "file:///etc/passwd"])(
    "refuses a redirect to %s",
    async (location) => {
      routes["https://img.koket.se/a.jpg"] = () => redirect(location);
      expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "redirect" });
    },
  );

  it("stops after 3 redirects", async () => {
    for (let step = 0; step < 6; step++) routes[`https://img.koket.se/${step}.jpg`] = () => redirect(`/${step + 1}.jpg`);
    expect(await get("https://img.koket.se/0.jpg")).toEqual({ ok: false, reason: "redirect" });
    expect(connected).toHaveLength(imageFetchLimits.maxRedirects + 1);
  });

  it("refuses a redirect without a Location", async () => {
    routes["https://img.koket.se/a.jpg"] = () => new Response(null, { status: 302 });
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "redirect" });
  });

  it.each([403, 404, 429, 500])("gives status for HTTP %s", async (status) => {
    routes["https://img.koket.se/a.jpg"] = () => new Response("no", { status, headers: { "content-type": "image/jpeg" } });
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "status" });
  });

  it.each(["text/html; charset=utf-8", "application/json", "image/svg+xml", "application/octet-stream", ""])(
    "refuses Content-Type %j",
    async (type) => {
      routes["https://img.koket.se/a.jpg"] = () => image("<svg/>", type);
      expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "not_image" });
    },
  );

  it("refuses a body that says it is over 5 MB without reading it", async () => {
    routes["https://img.koket.se/a.jpg"] = () => image(bytes, "image/jpeg", { "content-length": String(imageFetchLimits.maxBytes + 1) });
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "too_large" });
  });

  it("stops reading a body without a length at 5 MB", async () => {
    let sent = 0;
    const chunk = new Uint8Array(256 * 1024);
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          sent += chunk.byteLength;
          controller.enqueue(chunk);
        },
      },
      { highWaterMark: 0 },
    );
    routes["https://img.koket.se/a.jpg"] = () => image(body);
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "too_large" });
    expect(sent).toBeLessThanOrEqual(imageFetchLimits.maxBytes + 2 * chunk.byteLength);
  });

  it("gives connection when the request fails", async () => {
    routes["https://img.koket.se/a.jpg"] = () => {
      throw new Error("ECONNRESET to 151.101.1.1");
    };
    expect(await get("https://img.koket.se/a.jpg")).toEqual({ ok: false, reason: "connection" });
  });

  it("gives timeout after 8 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routes["https://img.koket.se/a.jpg"] = (): Promise<Response> => new Promise(() => {});
    const impl: FetchImpl = (url, init) =>
      new Promise<Response>((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    const pending = fetchImageBytes("https://img.koket.se/a.jpg", { lookup, fetchImpl: impl });
    await vi.advanceTimersByTimeAsync(imageFetchLimits.timeoutMs - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(imageFetchLimits.timeoutMs).toBe(8_000);
  });

  it("gives aborted when the caller stops it", async () => {
    const controller = new AbortController();
    controller.abort();
    routes["https://img.koket.se/a.jpg"] = () => image();
    expect(await get("https://img.koket.se/a.jpg", controller.signal)).toEqual({ ok: false, reason: "aborted" });
  });

  it("never puts the address or what the server sent in a failure", async () => {
    routes["https://img.koket.se/secret-path.jpg"] = () => image("hello", "text/html");
    const result = await get("https://img.koket.se/secret-path.jpg");
    expect(JSON.stringify(result)).not.toMatch(/secret|koket|hello/);
  });
});
