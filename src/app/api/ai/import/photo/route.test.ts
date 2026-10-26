import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { jpegHeader, pngHeader, webpVp8lHeader, webpVp8xHeader } from "../../../../../../tests/support/image-headers";

// The photo Route Handler with the user check and importRecipe stubbed:
// request checks, the size and type checks on the bytes, the status for each
// result, and the request's signal reaching the model.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type PhotoInput = { kind: "photo"; image: { data: Uint8Array; mediaType: string } };
const importRecipe = vi.fn<(input: PhotoInput, options: { signal: AbortSignal }) => Promise<Result<unknown>>>();
vi.mock("@/features/recipes/server", () => ({
  importRecipe: (input: PhotoInput, options: { signal: AbortSignal }) => importRecipe(input, options),
}));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST, maxDuration } = await import("./route");

const url = "http://localhost:3100/api/ai/import/photo";
const png = new Uint8Array(readFileSync(new URL("../../../../../../tests/fixtures/ai/ugnspannkaka.png", import.meta.url)));
/** A JPEG header of 1200 × 1600 px, padded to `size` bytes. */
const jpeg = (size = 64) => jpegHeader(1200, 1600, { size });

function form(data: Uint8Array | string, type = "image/jpeg", field = "image"): FormData {
  const body = new FormData();
  body.append(field, new Blob([data as BlobPart], { type }), "photo.jpg");
  return body;
}

/**
 * The request as a browser sends it. A FormData body is encoded up front, so
 * the handler reads plain bytes (as from a real connection) and stopping
 * early does not race undici's own form encoder.
 */
async function post(init: { body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  let body = init.body ?? form(png, "image/png");
  const headers = new Headers(init.headers);
  if (body instanceof FormData) {
    const encoded = new Response(body);
    if (!headers.has("content-type")) headers.set("content-type", encoded.headers.get("content-type") ?? "");
    body = new Uint8Array(await encoded.arrayBuffer());
  }
  return new Request(url, { method: "POST", body, headers, signal: init.signal });
}

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  importRecipe.mockReset().mockResolvedValue(ok({ draft: {}, ingredientNames: {} }));
});

describe("POST /api/ai/import/photo", () => {
  it("allows the AI port's 115 s", () => {
    expect(maxDuration).toBe(120);
  });

  it("passes the image's bytes, its type and the request's signal to importRecipe", async () => {
    const controller = new AbortController();
    const request = await post({ signal: controller.signal });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { draft: {}, ingredientNames: {} } });
    const [input, options] = importRecipe.mock.calls[0];
    expect(input.kind).toBe("photo");
    expect(input.image.mediaType).toBe("image/png");
    expect(Buffer.from(input.image.data).equals(Buffer.from(png))).toBe(true);
    expect(options.signal).toBe(request.signal);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });

  it.each([
    ["JPEG", jpeg(), "image/jpeg"],
    ["WebP", webpVp8xHeader(1600, 900), "image/webp"],
  ])("reads %s from the first bytes, whatever the client says", async (_name, data, mediaType) => {
    const response = await POST(await post({ body: form(data, "application/octet-stream") }));
    expect(response.status).toBe(200);
    expect(importRecipe.mock.calls[0][0].image.mediaType).toBe(mediaType);
  });

  it("refuses a text file with 415 image_unsupported, even when it says it is an image", async () => {
    const response = await POST(await post({ body: form("Ugnspannkaka\n3 ägg\n", "image/jpeg") }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "image_unsupported", message: errorMessages.image_unsupported },
    });
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["HEIC, which the AI port does not take", new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])],
    ["a JPEG whose header cannot be read", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
  ])("refuses %s with 415 image_unsupported", async (_name, data) => {
    const response = await POST(await post({ body: form(data, "image/jpeg") }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual(fail("image_unsupported"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["a JPEG of 4000 × 3000", jpegHeader(4000, 3000)],
    ["a PNG of 1700 px", pngHeader(1700, 900)],
    ["a WebP of 3000 px", webpVp8lHeader(1000, 3000)],
  ])("refuses %s, larger than the client sends, with 413 image_too_large", async (_name, data) => {
    const response = await POST(await post({ body: form(data) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(fail("image_too_large"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("takes a side slightly over 1600 px, for rounding in other clients", async () => {
    const response = await POST(await post({ body: form(jpegHeader(1616, 1212)) }));
    expect(response.status).toBe(200);
  });

  it("refuses an image over 1.5 MB with 413 image_too_large", async () => {
    const response = await POST(await post({ body: form(jpeg(1.5 * 1024 * 1024 + 1)) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(fail("image_too_large"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("takes an image of exactly 1.5 MB", async () => {
    const response = await POST(await post({ body: form(jpeg(1.5 * 1024 * 1024)) }));
    expect(response.status).toBe(200);
  });

  it("refuses a request over 2 MB with 413 image_too_large, before reading it all", async () => {
    const response = await POST(await post({ body: form(jpeg(2 * 1024 * 1024)) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(fail("image_too_large"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("stops reading a streamed body at 2 MB when there is no Content-Length", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(256 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        if (pulled > 8 * 1024 * 1024) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const request = new Request(url, {
      method: "POST",
      body: stream,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      // @ts-expect-error -- Node needs duplex for a streamed body.
      duplex: "half",
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThan(4 * 1024 * 1024);
  });

  it("answers 499 without an error when the client goes away mid-upload", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      pull(stream) {
        controller.abort();
        stream.error(new DOMException("aborted", "AbortError"));
      },
    });
    const request = new Request(url, {
      method: "POST",
      body: stream,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      signal: controller.signal,
      // @ts-expect-error -- Node needs duplex for a streamed body.
      duplex: "half",
    });
    const response = await POST(request);
    expect(response.status).toBe(499);
    expect(info).toHaveBeenCalledWith("request_aborted");
    expect(error).not.toHaveBeenCalled();
    expect(importRecipe).not.toHaveBeenCalled();
    info.mockRestore();
    error.mockRestore();
  });

  it("refuses a body that is not multipart/form-data with 415", async () => {
    const response = await POST(await post({ body: png as BlobPart as BodyInit, headers: { "content-type": "image/png" } }));
    expect(response.status).toBe(415);
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["no image field", () => form(png, "image/png", "photo")],
    ["an empty image", () => form(new Uint8Array(0))],
    ["a text field instead of a file", () => {
      const body = new FormData();
      body.append("image", "not a file");
      return body;
    }],
  ])("answers validation with 400 for %s", async (_name, body) => {
    const response = await POST(await post({ body: body() }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(fail("validation"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("answers validation with 400 for a broken multipart body", async () => {
    const response = await POST(
      await post({ body: "not multipart at all", headers: { "content-type": "multipart/form-data; boundary=abc" } }),
    );
    expect(response.status).toBe(400);
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("answers the 401 from requireUserForRoute without reading the image", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await POST(await post());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(fail("unauthorized"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["a cross-site form", { "sec-fetch-site": "cross-site" }],
    ["a same-site fetch from another subdomain", { "sec-fetch-site": "same-site" }],
  ])("refuses %s with 403 before the user check", async (_name, headers) => {
    const response = await POST(await post({ headers }));
    expect(response.status).toBe(403);
    expect(requireUserForRoute).not.toHaveBeenCalled();
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("accepts the app's own origin", async () => {
    const response = await POST(await post({ headers: { origin: "http://localhost:3100", "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(200);
  });

  it.each([
    ["import_no_recipe", 422],
    ["ai_invalid", 502],
    ["ai_rejected", 502],
    ["ai_unavailable", 503],
    ["catalog_unavailable", 503],
    ["validation", 400],
    ["image_too_large", 413],
    ["image_unsupported", 415],
  ] as const)("answers %s with %i", async (code, status) => {
    importRecipe.mockResolvedValue(fail(code));
    const response = await POST(await post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fail(code));
  });
});
