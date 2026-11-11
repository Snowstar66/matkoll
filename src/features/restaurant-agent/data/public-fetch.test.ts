import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The network is replaced: DNS answers and the https request are fakes, so a private address is refused at connect time
// without any real connection.
const dns = vi.hoisted(() => ({ addresses: [{ address: "93.184.216.34", family: 4 }] as { address: string; family: number }[] }));
const responses = vi.hoisted(() => ({ queue: [] as { status: number; headers: Record<string, string>; body?: string; huge?: boolean }[], calls: [] as string[] }));

vi.mock("node:dns", () => ({
  lookup: (_host: string, _options: unknown, callback: (error: Error | null, addresses: { address: string; family: number }[]) => void) => callback(null, dns.addresses),
}));
vi.mock("node:https", () => ({
  request: (url: string, options: { lookup: (host: string, o: { all: boolean }, cb: (e: Error | null, a?: unknown) => void) => void }, onResponse: (res: EventEmitter & { statusCode: number; headers: Record<string, string>; destroy: () => void }) => void) => {
    const req = Object.assign(new EventEmitter(), {
      setTimeout: () => undefined,
      destroy: (error?: Error) => error && req.emit("error", error),
      end: () => {
        responses.calls.push(url);
        // The socket's own lookup runs first, as in node: a blocked address ends the request with its error.
        options.lookup(new URL(url).hostname, { all: true }, (error) => {
          if (error) return req.emit("error", error);
          const next = responses.queue.shift();
          if (!next) return req.emit("error", new Error("no response"));
          const res = Object.assign(new EventEmitter(), { statusCode: next.status, headers: next.headers, destroy: () => undefined });
          onResponse(res);
          if (next.huge) res.emit("data", Buffer.alloc(500_000, 97));
          else if (next.body !== undefined) res.emit("data", Buffer.from(next.body));
          res.emit("end");
        });
      },
    });
    return req;
  },
}));

const { fetchPublicPage } = await import("./public-fetch");
const html = { "content-type": "text/html; charset=utf-8" };

describe("fetchPublicPage", () => {
  it("fetches an https page and returns its html", async () => {
    dns.addresses = [{ address: "93.184.216.34", family: 4 }];
    responses.queue = [{ status: 200, headers: html, body: "<h1>Meny</h1>" }];
    expect(await fetchPublicPage("https://trattoria.example/meny#x")).toEqual({ ok: true, url: "https://trattoria.example/meny", html: "<h1>Meny</h1>" });
  });
  it("refuses a host that resolves to a private, loopback or metadata address, before any request is answered", async () => {
    for (const address of ["127.0.0.1", "10.0.0.7", "169.254.169.254", "192.168.1.1", "::1"]) {
      dns.addresses = [{ address, family: address.includes(":") ? 6 : 4 }];
      responses.queue = [{ status: 200, headers: html, body: "secret" }];
      expect(await fetchPublicPage("https://sneaky.example/"), address).toEqual({ ok: false, reason: "blocked" });
      expect(responses.queue).toHaveLength(1);
    }
  });
  it("refuses a host with one public and one private address", async () => {
    dns.addresses = [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }];
    expect(await fetchPublicPage("https://mixed.example/")).toEqual({ ok: false, reason: "blocked" });
  });
  it("refuses http, credentials, IP literals and ports without connecting", async () => {
    responses.calls = [];
    for (const url of ["http://trattoria.example/", "https://u:p@trattoria.example/", "https://1.2.3.4/", "https://trattoria.example:8443/"]) expect(await fetchPublicPage(url), url).toMatchObject({ ok: false });
    expect(responses.calls).toEqual([]);
  });
  it("follows a redirect by hand and checks it as strictly: a redirect to http or to a loopback address is refused", async () => {
    dns.addresses = [{ address: "93.184.216.34", family: 4 }];
    responses.queue = [{ status: 302, headers: { location: "/meny" } }, { status: 200, headers: html, body: "ok" }];
    expect(await fetchPublicPage("https://trattoria.example/")).toEqual({ ok: true, url: "https://trattoria.example/meny", html: "ok" });
    responses.queue = [{ status: 302, headers: { location: "http://trattoria.example/meny" } }];
    expect(await fetchPublicPage("https://trattoria.example/")).toEqual({ ok: false, reason: "blocked" });
    responses.queue = [{ status: 301, headers: { location: "https://127.0.0.1/admin" } }];
    expect(await fetchPublicPage("https://trattoria.example/")).toEqual({ ok: false, reason: "blocked" });
  });
  it("says a PDF or an image is not text, and an error status is unreachable", async () => {
    responses.queue = [{ status: 200, headers: { "content-type": "application/pdf" } }];
    expect(await fetchPublicPage("https://trattoria.example/meny.pdf")).toEqual({ ok: false, reason: "not_text" });
    responses.queue = [{ status: 200, headers: { "content-type": "image/jpeg" } }];
    expect(await fetchPublicPage("https://trattoria.example/meny.jpg")).toEqual({ ok: false, reason: "not_text" });
    responses.queue = [{ status: 404, headers: html, body: "nej" }];
    expect(await fetchPublicPage("https://trattoria.example/x")).toEqual({ ok: false, reason: "unreachable" });
  });
  it("cuts a page that is too large instead of reading it all (400 KB)", async () => {
    responses.queue = [{ status: 200, headers: html, huge: true }];
    const result = await fetchPublicPage("https://trattoria.example/stor");
    expect(result).toMatchObject({ ok: true });
  });
});
