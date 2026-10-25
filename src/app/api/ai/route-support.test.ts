import { afterEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";

// The body reader shared by the AI Route Handlers: its limit, a client that
// goes away mid-upload, and a broken body.

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { readCapped, respond, unreadBody } = await import("./route-support");

/** A request-like object, so the test can set Content-Length freely and count what is read. */
function fakeRequest({
  contentLength,
  pull,
  signal = new AbortController().signal,
}: {
  contentLength?: string;
  pull: (controller: ReadableStreamDefaultController<Uint8Array>) => void;
  signal?: AbortSignal;
}): Request {
  const headers = new Headers(contentLength === undefined ? {} : { "content-length": contentLength });
  // highWaterMark 0: nothing is pulled until the reader asks.
  const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
  return { headers, body, signal } as unknown as Request;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readCapped", () => {
  it("refuses a Content-Length over the limit without reading anything", async () => {
    let pulled = 0;
    const request = fakeRequest({
      contentLength: String(50 * 1024 * 1024),
      pull: (controller) => {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    expect(await readCapped(request, 2 * 1024 * 1024)).toEqual({ ok: false, reason: "too_large" });
    expect(pulled).toBe(0);
  });

  it("reads a body within the limit", async () => {
    let sent = false;
    const request = fakeRequest({
      contentLength: "3",
      pull: (controller) => {
        if (sent) return controller.close();
        sent = true;
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
    });
    const result = await readCapped(request, 3);
    expect(result.ok && [...result.bytes]).toEqual([1, 2, 3]);
  });

  it("stops at the limit when the body is longer than its Content-Length says", async () => {
    let pulled = 0;
    const request = fakeRequest({
      contentLength: "10",
      pull: (controller) => {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    expect(await readCapped(request, 2048)).toEqual({ ok: false, reason: "too_large" });
    expect(pulled).toBeLessThan(5);
  });

  it("gives aborted when the client goes away mid-upload", async () => {
    const controller = new AbortController();
    const request = fakeRequest({
      signal: controller.signal,
      pull: (stream) => {
        controller.abort();
        stream.error(new DOMException("aborted", "AbortError"));
      },
    });
    expect(await readCapped(request, 1024)).toEqual({ ok: false, reason: "aborted" });
  });

  it("gives broken when the body fails without an abort", async () => {
    const request = fakeRequest({ pull: (stream) => stream.error(new TypeError("terminated")) });
    expect(await readCapped(request, 1024)).toEqual({ ok: false, reason: "broken" });
  });
});

describe("unreadBody", () => {
  it("answers an aborted upload with 499 and an info log, not an error", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = unreadBody("aborted");
    expect(response.status).toBe(499);
    expect(info).toHaveBeenCalledWith("request_aborted");
    expect(error).not.toHaveBeenCalled();
  });

  it("answers a broken body with 400 validation", async () => {
    const response = unreadBody("broken");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(fail("validation"));
  });
});

describe("respond", () => {
  it.each([
    ["image_too_large", 413],
    ["image_unsupported", 415],
  ] as const)("answers %s with %i", (code, status) => {
    expect(respond(fail(code)).status).toBe(status);
  });
});
