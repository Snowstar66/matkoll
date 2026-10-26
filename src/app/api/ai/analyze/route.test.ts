import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { jpegHeader, pngHeader, webpVp8xHeader } from "../../../../../tests/support/image-headers";

// The analysis Route Handler with the user check and analyzePlace stubbed:
// request checks, the size and type checks on the bytes, the location field,
// the status for each result, the deadline, and the request's signal reaching
// the model.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type AnalyzeInput = { image: { data: Uint8Array; mediaType: string }; location: string; siteId?: string };
type AnalyzeOptions = { signal: AbortSignal; deadline?: number };
const analyzePlace = vi.fn<(input: AnalyzeInput, options: AnalyzeOptions) => Promise<Result<unknown>>>();
vi.mock("@/features/pantry/server", () => ({
  analyzePlace: (input: AnalyzeInput, options: AnalyzeOptions) => analyzePlace(input, options),
}));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST, maxDuration } = await import("./route");

const url = "http://localhost:3100/api/ai/analyze";
/** The place Hemma showed when the photo was taken (Story 8.4). */
const stugan = "55555555-5555-4555-8555-555555555555";
const png = new Uint8Array(readFileSync(new URL("../../../../../tests/fixtures/ai/kyl.png", import.meta.url)));

function form(
  data: Uint8Array | string | null,
  {
    type = "image/png",
    location = "Kyl" as string | null,
    site = stugan as string | null,
  }: { type?: string; location?: string | null; site?: string | null } = {},
): FormData {
  const body = new FormData();
  if (data !== null) body.append("image", new Blob([data as BlobPart], { type }), "photo");
  if (location !== null) body.append("location", location);
  if (site !== null) body.append("site", site);
  return body;
}

/** The request as a browser sends it, with the multipart body encoded up front. */
async function post(init: { body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  let body = init.body ?? form(png);
  const headers = new Headers(init.headers);
  if (body instanceof FormData) {
    const encoded = new Response(body);
    if (!headers.has("content-type")) headers.set("content-type", encoded.headers.get("content-type") ?? "");
    body = new Uint8Array(await encoded.arrayBuffer());
  }
  return new Request(url, { method: "POST", body, headers, signal: init.signal });
}

const answer = { location: "Kyl", suggestions: [], dropped: 0 };

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  analyzePlace.mockReset().mockResolvedValue(ok(answer));
});

describe("POST /api/ai/analyze", () => {
  it("allows the AI port's 115 s", () => {
    expect(maxDuration).toBe(120);
  });

  it("passes the image's bytes, its type, the place, the request's signal and a deadline 3 s before maxDuration", async () => {
    const controller = new AbortController();
    const before = Date.now();
    const request = await post({ signal: controller.signal });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: answer });
    const [input, options] = analyzePlace.mock.calls[0];
    expect(input.location).toBe("Kyl");
    expect(input.siteId).toBe(stugan);
    expect(input.image.mediaType).toBe("image/png");
    expect(Buffer.from(input.image.data).equals(Buffer.from(png))).toBe(true);
    expect(options.signal).toBe(request.signal);
    expect(options.deadline).toBeGreaterThanOrEqual(before + (maxDuration - 3) * 1000);
    expect(options.deadline).toBeLessThanOrEqual(Date.now() + (maxDuration - 3) * 1000);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });

  it.each(["Kyl", "Frys", "Skafferi"])("takes the place %s", async (location) => {
    const response = await POST(await post({ body: form(png, { location }) }));
    expect(response.status).toBe(200);
    expect(analyzePlace.mock.calls[0][0].location).toBe(location);
  });

  it.each([
    ["no location", null],
    ["an unknown location", "Källare"],
    ["a location in lower case", "kyl"],
    ["an empty location", ""],
  ])("answers validation with 400 for %s, without asking the AI", async (_name, location) => {
    const response = await POST(await post({ body: form(png, { location }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(fail("validation"));
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it.each([
    ["JPEG", jpegHeader(1200, 1600), "image/jpeg"],
    ["WebP", webpVp8xHeader(1600, 900), "image/webp"],
  ])("reads %s from the first bytes, whatever the client says", async (_name, data, mediaType) => {
    const response = await POST(await post({ body: form(data, { type: "application/octet-stream" }) }));
    expect(response.status).toBe(200);
    expect(analyzePlace.mock.calls[0][0].image.mediaType).toBe(mediaType);
  });

  it("refuses a file that is not an image with 415 image_unsupported", async () => {
    const response = await POST(await post({ body: form("mjölk, smör, ägg", { type: "image/jpeg" }) }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ ok: false, error: { code: "image_unsupported", message: errorMessages.image_unsupported } });
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it.each([
    ["a JPEG of 2048 px", jpegHeader(1536, 2048)],
    ["a PNG of 1700 px", pngHeader(1700, 900)],
  ])("takes %s: a photo of a place may be up to 2048 px (Story 6.5)", async (_name, data) => {
    const response = await POST(await post({ body: form(data) }));
    expect(response.status).toBe(200);
  });

  it.each([
    ["a PNG of 2100 px", pngHeader(2100, 900)],
    ["a JPEG over 1.5 MB", jpegHeader(1200, 1600, { size: 1.5 * 1024 * 1024 + 1 })],
    ["a request over 2 MB", jpegHeader(1200, 1600, { size: 2 * 1024 * 1024 })],
  ])("refuses %s with 413 image_too_large", async (_name, data) => {
    const response = await POST(await post({ body: form(data) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(fail("image_too_large"));
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it("answers validation with 400 for no image", async () => {
    const response = await POST(await post({ body: form(null) }));
    expect(response.status).toBe(400);
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it("refuses a body that is not multipart/form-data with 415", async () => {
    const response = await POST(await post({ body: png as BlobPart as BodyInit, headers: { "content-type": "image/png" } }));
    expect(response.status).toBe(415);
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it("answers the 401 from requireUserForRoute without reading the image", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await POST(await post());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(fail("unauthorized"));
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["a cross-site form", { "sec-fetch-site": "cross-site" }],
  ])("refuses %s with 403 before the user check", async (_name, headers) => {
    const response = await POST(await post({ headers }));
    expect(response.status).toBe(403);
    expect(requireUserForRoute).not.toHaveBeenCalled();
    expect(analyzePlace).not.toHaveBeenCalled();
  });

  it("answers 499 without an error when the client goes away mid-upload", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      pull(source) {
        controller.abort();
        source.error(new DOMException("aborted", "AbortError"));
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
    expect(analyzePlace).not.toHaveBeenCalled();
    info.mockRestore();
    error.mockRestore();
  });

  it.each([
    ["ai_invalid", 502],
    ["ai_rejected", 502],
    ["ai_unavailable", 503],
    ["ai_superseded", 409],
    ["catalog_unavailable", 503],
    ["pantry_unavailable", 503],
    ["pantry_site_gone", 409],
    ["validation", 400],
    ["unauthorized", 401],
  ] as const)("answers %s with %i", async (code, status) => {
    analyzePlace.mockResolvedValue(fail(code));
    const response = await POST(await post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fail(code));
  });

  it("passes no place without the field `site`: the selected one, for a 1.0 client (Story 8.4)", async () => {
    const response = await POST(await post({ body: form(png, { site: null }) }));
    expect(response.status).toBe(200);
    expect(analyzePlace.mock.calls[0][0]).not.toHaveProperty("siteId");
  });

  it.each([
    ["a place that is not a uuid", "stugan"],
    ["an empty place", ""],
  ])("answers validation with 400 for %s, without asking the AI (Story 8.4)", async (_name, site) => {
    const response = await POST(await post({ body: form(png, { site }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(fail("validation"));
    expect(analyzePlace).not.toHaveBeenCalled();
  });
});
