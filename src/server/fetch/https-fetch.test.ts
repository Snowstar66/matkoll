import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";
import { toFetchResponse, toNodeLookup } from "./https-fetch";
import { fetchLimits, safeFetch, type FetchImpl, type Lookup } from "./safe-fetch";

// The default request's lookup, without the internet: node connects to the
// address the lookup gives, so the checked address is the connected one, and
// a refused address means no connection at all.

const page = "<p>Kladdkaka med grädde</p>";

/** The local server's answers, by path. */
function answer(req: IncomingMessage, res: ServerResponse) {
  const send = (body: Buffer, encoding?: string) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(body.byteLength),
      ...(encoding ? { "content-encoding": encoding } : {}),
    });
    res.end(body);
  };
  switch (req.url) {
    case "/gzip":
      return send(gzipSync(page), "gzip");
    case "/deflate":
      return send(deflateSync(page), "deflate");
    case "/br":
      return send(brotliCompressSync(page), "br");
    case "/unknown":
      return send(Buffer.from(page), "compress");
    case "/empty":
      res.writeHead(204, { "x-test": "1" });
      return res.end();
    case "/bomb":
      // A few kB compressed, more than 3 MB unpacked.
      return send(gzipSync(Buffer.alloc(fetchLimits.maxBytes + 1024 * 1024, 32)), "gzip");
    default:
      res.end("hej");
  }
}

/** A request to the local server, read with toFetchResponse like httpsFetch does. */
const localFetch =
  (port: number): FetchImpl =>
  (url, init) =>
    new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: url.pathname, agent: false, signal: init.signal }, (res) => {
        try {
          resolve(toFetchResponse(res));
        } catch (error) {
          reject(error);
        }
      });
      req.on("error", reject);
      req.end();
    });

let server: Server;
let port: number;
let connections: number;

beforeEach(async () => {
  connections = 0;
  server = createServer(answer);
  server.on("connection", () => connections++);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("toNodeLookup", () => {
  it("makes node connect to the address the lookup gives, for any host name", async () => {
    const lookup = vi.fn<Lookup>(async () => [{ address: "127.0.0.1", family: 4 }]);
    const body = await new Promise<string>((resolve, reject) => {
      const req = request(
        { host: "recept.matkoll.invalid", port, path: "/", agent: false, lookup: toNodeLookup(lookup) },
        (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => resolve(text));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(body).toBe("hej");
    expect(lookup).toHaveBeenCalledWith("recept.matkoll.invalid");
    expect(connections).toBe(1);
  });

  it("answers both one address and all addresses, filtered by family", async () => {
    const lookup = toNodeLookup(async () => [
      { address: "2a04:4e42::645", family: 6 },
      { address: "151.101.1.1", family: 4 },
    ]);
    const one = await new Promise((resolve) => lookup("x", { family: 4 }, (...args) => resolve(args)));
    expect(one).toEqual([null, "151.101.1.1", 4]);
    const all = await new Promise((resolve) => lookup("x", { all: true }, (...args) => resolve(args)));
    expect(all).toEqual([
      null,
      [
        { address: "2a04:4e42::645", family: 6 },
        { address: "151.101.1.1", family: 4 },
      ],
    ]);
    const none = await new Promise<unknown[]>((resolve) =>
      toNodeLookup(async () => [{ address: "151.101.1.1", family: 4 }])("x", { family: 6 }, (...args) => resolve(args)),
    );
    expect((none[0] as NodeJS.ErrnoException).code).toBe("ENOTFOUND");
  });
});

describe("httpsFetch inside safeFetch", () => {
  it.each(["127.0.0.1", "10.0.0.1", "::1"])("never connects when the host resolves to %s", async (address) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lookup = vi.fn<Lookup>(async () => [{ address, family: address.includes(":") ? 6 : 4 }]);
    const result = await safeFetch("https://www.koket.se/recept", {
      allowedDomains: ["koket.se"],
      signal: new AbortController().signal,
      lookup,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "fetch_blocked", message: expect.any(String), fields: { domain: "koket.se" } },
    });
    // node:https asked the checked lookup when it connected, and got no address.
    expect(lookup).toHaveBeenCalledWith("www.koket.se");
    expect(connections).toBe(0);
  });
});

describe("toFetchResponse", () => {
  const get = (path: string) =>
    localFetch(port)(new URL(`https://www.koket.se${path}`), {
      signal: new AbortController().signal,
      headers: {},
      lookup: async () => [],
    });

  it.each(["/gzip", "/deflate", "/br"])("decompresses %s and drops Content-Encoding and Content-Length", async (path) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(page);
  });

  it("keeps an uncompressed body and its length", async () => {
    const response = await get("/plain");
    expect(response.headers.get("content-length")).toBe("3");
    expect(await response.text()).toBe("hej");
  });

  it("gives 204 an empty body and keeps its headers", async () => {
    const response = await get("/empty");
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers.get("x-test")).toBe("1");
  });

  it("refuses an encoding it cannot read", async () => {
    await expect(get("/unknown")).rejects.toThrow("Unsupported content encoding");
  });

  it("makes safeFetch answer fetch_blocked for an unknown encoding", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await safeFetch("https://www.koket.se/unknown", {
      allowedDomains: ["koket.se"],
      signal: new AbortController().signal,
      lookup: async () => [{ address: "151.101.1.1", family: 4 }],
      fetchImpl: localFetch(port),
    });
    expect(result).toEqual(fail("fetch_blocked", { domain: "koket.se" }));
  });

  it("makes safeFetch stop a compressed body that unpacks past 3 MB", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await safeFetch("https://www.koket.se/bomb", {
      allowedDomains: ["koket.se"],
      signal: new AbortController().signal,
      lookup: async () => [{ address: "151.101.1.1", family: 4 }],
      fetchImpl: localFetch(port),
    });
    expect(result).toEqual(fail("fetch_too_large", { domain: "koket.se" }));
  });
});
