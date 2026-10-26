import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FetchImpl, Lookup } from "./safe-fetch";

// Recipe sites from saved pages, for AI_PROVIDER=mock on a local server
// (tests, E2E and CI; see index.ts): nothing leaves the machine, but every
// request still goes through safeFetch and its checks.
// tests/fixtures/sites/manifest.json lists the pages by address; an address
// that is not listed answers 404 (fetch_blocked). The lookup answers a fixed
// public address for every host, and the fake request calls it the way a
// real connection does.

type Page =
  | { url: string; file: string }
  | { url: string; status: number }
  | { url: string; redirect: string; status?: number }
  /** Never answers: the request ends only when safeFetch's 10 s run out. */
  | { url: string; hang: true }
  /** An HTML page of this many bytes, without Content-Length. */
  | { url: string; bytes: number };

type Manifest = { pages: Page[] };

/** A public address (not in any blocked range) that the fixtures' hosts "resolve" to. */
export const fixtureAddress = "151.101.1.1";

/**
 * A file in tests/fixtures/sites. The folder is found at run time and left out
 * of the server build's file tracing, so the test pages never ship with it.
 */
const read = (file: string) =>
  readFileSync(join(/* turbopackIgnore: true */ process.cwd(), "tests", "fixtures", "sites", file), "utf8");

/** A body of `size` bytes that is produced as it is read. */
function largeBody(size: number): ReadableStream<Uint8Array> {
  const chunk = new TextEncoder().encode(`<p>${"x".repeat(64 * 1024 - 7)}</p>`);
  let sent = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (sent >= size) return controller.close();
        const part = chunk.subarray(0, Math.min(chunk.byteLength, size - sent));
        sent += part.byteLength;
        controller.enqueue(part);
      },
    },
    { highWaterMark: 0 },
  );
}

export function fixtureSites(): { lookup: Lookup; fetchImpl: FetchImpl } {
  let manifest: Manifest | undefined;
  const pages = () => {
    manifest ??= JSON.parse(read("manifest.json")) as Manifest;
    return manifest.pages;
  };

  const lookup: Lookup = async () => [{ address: fixtureAddress, family: 4 }];

  const fetchImpl: FetchImpl = async (url, init) => {
    init.signal.throwIfAborted();
    await init.lookup(url.hostname);
    const page = pages().find((candidate) => candidate.url === url.href);
    if (!page) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    if ("redirect" in page) {
      return new Response(null, { status: page.status ?? 301, headers: { location: page.redirect } });
    }
    if ("hang" in page) {
      return new Promise<Response>((_resolve, reject) => {
        if (init.signal.aborted) reject(init.signal.reason);
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    }
    if ("bytes" in page) {
      return new Response(largeBody(page.bytes), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if ("status" in page) return new Response("Blocked", { status: page.status, headers: { "content-type": "text/html" } });
    return new Response(read(page.file), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  return { lookup, fetchImpl };
}
