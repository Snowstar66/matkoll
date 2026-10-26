import { afterEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";
import { jpegHeader, pngHeader } from "../../../../tests/support/image-headers";

// The body reader shared by the AI Route Handlers: its limit, a client that
// goes away mid-upload, and a broken body.

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { maxImageBodyBytes, readCapped, readImageForm, respond, unreadBody } = await import("./route-support");

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
    ["suggest_empty_pantry", 422],
    ["pantry_unavailable", 503],
  ] as const)("answers %s with %i", (code, status) => {
    expect(respond(fail(code)).status).toBe(status);
  });
});

describe("readImageForm", () => {
  /** A multipart request as a browser sends it, encoded up front. */
  async function formRequest(fields: Record<string, Blob | string>): Promise<Request> {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (value instanceof Blob) body.append(name, value, "photo");
      else body.append(name, value);
    }
    const encoded = new Response(body);
    return new Request("http://localhost:3100/api/ai/analyze", {
      method: "POST",
      body: new Uint8Array(await encoded.arrayBuffer()),
      headers: { "content-type": encoded.headers.get("content-type") ?? "" },
    });
  }
  const jpeg = () => new Blob([jpegHeader(1200, 1600) as BlobPart], { type: "image/jpeg" });

  it("allows 2 MB for the whole request", () => {
    expect(maxImageBodyBytes).toBe(2 * 1024 * 1024);
  });

  it("gives the image with its type from the bytes, and the asked fields as text", async () => {
    const png = new Blob([pngHeader(720, 900) as BlobPart], { type: "application/octet-stream" });
    const read = await readImageForm(await formRequest({ image: png, location: "Kyl", other: "x" }), ["location", "missing"]);
    if (!read.ok) throw new Error(String(read.response.status));
    expect(read.image.mediaType).toBe("image/png");
    expect(read.image.data.byteLength).toBe(png.size);
    expect(read.fields).toEqual({ location: "Kyl", missing: null });
  });

  it("gives null for a field that is a file instead of text", async () => {
    const read = await readImageForm(await formRequest({ image: jpeg(), location: jpeg() }), ["location"]);
    expect(read.ok && read.fields).toEqual({ location: null });
  });

  it.each([
    ["no image", () => ({ location: "Kyl" }), 400, "validation"],
    ["an image that is text", () => ({ image: new Blob(["mjölk"], { type: "image/jpeg" }) }), 415, "image_unsupported"],
    ["an image over 1600 px", () => ({ image: new Blob([pngHeader(2000, 900) as BlobPart]) }), 413, "image_too_large"],
  ] as const)("answers %s with %i %s", async (_name, fields, status, code) => {
    const read = await readImageForm(await formRequest(fields()), ["location"]);
    if (read.ok) throw new Error("expected a response");
    expect(read.response.status).toBe(status);
    expect(await read.response.json()).toEqual(fail(code));
  });

  it("checks the side against maxSide when given: a photo of a place may be 2048 px (Story 6.5)", async () => {
    const at = (width: number) => formRequest({ image: new Blob([pngHeader(width, 900) as BlobPart]) });
    expect((await readImageForm(await at(2048), [], { maxSide: 2048 })).ok).toBe(true);
    expect((await readImageForm(await at(2048), [])).ok).toBe(false);
    const over = await readImageForm(await at(2100), [], { maxSide: 2048 });
    if (over.ok) throw new Error("expected a response");
    expect(over.response.status).toBe(413);
  });
});
