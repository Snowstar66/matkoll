import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { jpegHeader, pngHeader, webpVp8xHeader } from "../../../../../tests/support/image-headers";

// The Route Handler that saves the latest photo of a place (Story 10.1,
// AD-2, AD-26) with the user check and savePlacePhoto stubbed: the request
// checks, the photo's size and type on its bytes, Zod for every field, the
// status for each result, and that nothing on its way imports the AI port.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type SaveInput = {
  image: { data: Uint8Array; mediaType: string };
  siteId: string;
  location: string;
  takenAt: Date;
  reading: string[];
  points: { n: number; x: number; y: number }[] | null;
};
const savePlacePhoto = vi.fn<(input: SaveInput) => Promise<Result<unknown>>>();
vi.mock("@/features/pantry/server", () => ({ savePlacePhoto: (input: SaveInput) => savePlacePhoto(input) }));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST } = await import("./route");

const url = "http://localhost:3100/api/pantry/photo";
const png = new Uint8Array(readFileSync(new URL("../../../../../tests/fixtures/ai/kyl.png", import.meta.url)));
const site = "22222222-2222-4222-8222-222222222222";
const reading = ["Mellanmjölk 1,5 %", "Vispgrädde 3 dl", "Smör 500 g", "Ägg", "Gurka", "Ketchup"];

type Fields = Partial<Record<"site" | "location" | "takenAt" | "reading" | "points", string | null>>;

function form(data: Uint8Array | null, overrides: Fields = {}): FormData {
  const fields: Fields = {
    site,
    location: "Kyl",
    takenAt: "2026-10-26T15:42:00.000Z",
    reading: JSON.stringify(reading),
    ...overrides,
  };
  const body = new FormData();
  if (data !== null) body.append("image", new Blob([data as BlobPart], { type: "image/png" }), "photo");
  for (const [name, value] of Object.entries(fields)) if (value !== null && value !== undefined) body.append(name, value);
  return body;
}

/**
 * The request as a browser sends it, with the multipart body encoded up front
 * and its Content-Length, unless `length` is given (`null`: none).
 */
async function post(init: { body?: BodyInit; headers?: Record<string, string>; length?: string | null } = {}) {
  let body = init.body ?? form(png);
  const headers = new Headers(init.headers);
  if (body instanceof FormData) {
    const encoded = new Response(body);
    if (!headers.has("content-type")) headers.set("content-type", encoded.headers.get("content-type") ?? "");
    body = new Uint8Array(await encoded.arrayBuffer());
  }
  const size = typeof body === "string" ? new TextEncoder().encode(body).length : (body as Uint8Array).byteLength;
  const length = init.length === undefined ? String(size) : init.length;
  if (length !== null) headers.set("content-length", length);
  return new Request(url, { method: "POST", body, headers });
}

const photoId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  savePlacePhoto.mockReset().mockResolvedValue(ok({ id: photoId }));
});

describe("POST /api/pantry/photo", () => {
  it("passes the photo's bytes and type, the place, the location, the time, the reading and no points", async () => {
    const response = await POST(await post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: photoId } });
    const [input] = savePlacePhoto.mock.calls[0];
    expect(input.image.mediaType).toBe("image/png");
    expect(Buffer.from(input.image.data).equals(Buffer.from(png))).toBe(true);
    expect(input).toMatchObject({
      siteId: site,
      location: "Kyl",
      takenAt: new Date("2026-10-26T15:42:00.000Z"),
      reading,
      points: null,
    });
  });

  it("passes the points when they have come", async () => {
    const points = { positions: [{ n: 1, x: 193, y: 193 }, { n: 6, x: 800, y: 900 }] };
    await POST(await post({ body: form(png, { points: JSON.stringify(points) }) }));
    expect(savePlacePhoto.mock.calls[0][0].points).toEqual(points.positions);
  });

  it("takes a photo of 2048 px and a reading of 25 labels of 200 characters", async () => {
    const labels = Array.from({ length: 25 }, () => "x".repeat(200));
    const response = await POST(await post({ body: form(jpegHeader(1536, 2048), { reading: JSON.stringify(labels) }) }));
    expect(response.status).toBe(200);
  });

  it.each([
    ["a place that is not a uuid", { site: "Stugan" }],
    ["no place", { site: null }],
    ["a location outside Kyl, Frys and Skafferi", { location: "Källare" }],
    ["no time", { takenAt: null }],
    ["a time that is not one", { takenAt: "idag" }],
    ["26 labels", { reading: JSON.stringify(Array.from({ length: 26 }, (_, index) => `Vara ${index}`)) }],
    ["a reading that is not JSON", { reading: "Mjölk, Smör" }],
    ["a point outside 0–1000", { points: JSON.stringify({ positions: [{ n: 1, x: 1001, y: 40 }] }) }],
    ["a point for an item not in the reading", { points: JSON.stringify({ positions: [{ n: 7, x: 10, y: 40 }] }) }],
  ])("answers validation with 400 for %s, saving nothing", async (_name, overrides) => {
    const response = await POST(await post({ body: form(png, overrides) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(fail("validation"));
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["a PNG of 2100 px", pngHeader(2100, 900)],
    ["a JPEG over 1.5 MB", jpegHeader(1200, 1600, { size: 1.5 * 1024 * 1024 + 1 })],
  ])("refuses %s with 413 image_too_large", async (_name, data) => {
    const response = await POST(await post({ body: form(data) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(fail("image_too_large"));
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it("refuses a file that is not an image with 415, and answers 400 without one", async () => {
    expect((await POST(await post({ body: form(new TextEncoder().encode("mjölk")) }))).status).toBe(415);
    expect((await POST(await post({ body: form(null) }))).status).toBe(400);
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it("refuses a WebP with 415 validation, saving nothing: only a JPEG or PNG is kept", async () => {
    const response = await POST(await post({ body: form(webpVp8xHeader(1200, 900)) }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual(fail("validation"));
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["no Content-Length", null],
    ["a Content-Length over the photo and 64 KB", String(1.5 * 1024 * 1024 + 64 * 1024 + 1)],
    ["a Content-Length that is not a number", "lots"],
  ])("refuses %s with 413 before reading the body", async (_name, length) => {
    const response = await POST(await post({ length }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(fail("image_too_large"));
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it("refuses a reading or points field over 16 KB before parsing it", async () => {
    const long = JSON.stringify(["x".repeat(16 * 1024)]);
    expect((await POST(await post({ body: form(png, { reading: long }) }))).status).toBe(400);
    expect((await POST(await post({ body: form(png, { points: " ".repeat(16 * 1024 + 1) }) }))).status).toBe(400);
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it("answers pantry_photo_failed (500) for anything thrown, logging only its name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = new TypeError(`upload of user/site/kyl/${photoId}.png failed`);
    savePlacePhoto.mockRejectedValue(thrown);
    const response = await POST(await post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "pantry_photo_failed", message: errorMessages.pantry_photo_failed },
    });
    expect(log).toHaveBeenCalledWith("pantry_photo_failed", { code: "pantry_photo_failed", reason: "TypeError" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(photoId);
    log.mockRestore();
  });

  it("refuses a body that is not multipart/form-data with 415", async () => {
    const response = await POST(await post({ body: "{}", headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(415);
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it("answers the 401 from requireUserForRoute without reading the photo", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await POST(await post());
    expect(response.status).toBe(401);
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["a cross-site form", { "sec-fetch-site": "cross-site" }],
  ])("refuses %s with 403 before the user check", async (_name, headers) => {
    const response = await POST(await post({ headers }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(fail("unauthorized"));
    expect(requireUserForRoute).not.toHaveBeenCalled();
    expect(savePlacePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["pantry_photo_failed", 500],
    ["pantry_site_gone", 409],
    ["unauthorized", 401],
    ["validation", 400],
  ] as const)("answers %s with %i", async (code, status) => {
    savePlacePhoto.mockResolvedValue(fail(code));
    const response = await POST(await post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fail(code));
  });
});

// AD-26: a saved photo is never sent to the AI port. The route reaches
// savePlacePhoto through @/features/pantry/server (AD-1), whose other exports
// (analyzePlace, locatePlaceItems) use the port, so the walk follows only
// savePlacePhoto's own file there. Every other import on the way is followed.
describe("the save path's imports", () => {
  const root = fileURLToPath(new URL("../../../../../", import.meta.url));
  const src = join(root, "src");
  const routeFile = fileURLToPath(new URL("./route.ts", import.meta.url));
  const followedFor: Record<string, string> = {
    "@/features/pantry/server": join(src, "features/pantry/actions/save-place-photo.ts"),
  };

  function resolveImport(from: string, specifier: string): string | null {
    if (followedFor[specifier]) return followedFor[specifier];
    let base: string;
    if (specifier.startsWith("@/")) base = join(src, specifier.slice(2));
    else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
    else return null;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(candidate)) return candidate;
    return null;
  }

  function importsOf(file: string): string[] {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)].map((match) => match[1]);
  }

  function walk(): Set<string> {
    const seen = new Set<string>();
    const queue = [routeFile];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of importsOf(file)) {
        const next = resolveImport(file, specifier);
        if (next) queue.push(next);
      }
    }
    return seen;
  }

  it("never reaches src/server/ai", () => {
    const files = [...walk()].map((file) => relative(root, file));
    expect(files).toContain("src/features/pantry/actions/save-place-photo.ts");
    expect(files).toContain("src/features/pantry/data/photos.ts");
    expect(files.filter((file) => file.startsWith("src/server/ai"))).toEqual([]);
  });
});
