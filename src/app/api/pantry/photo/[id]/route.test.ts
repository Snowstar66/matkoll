import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";

// The Route Handler that sends a saved photo (Story 10.2, AD-26, NFR-11)
// with the user check and the read stubbed: the user is checked before
// anything is read, every photo that is not there gets the same 404 without
// a body, the answer is private and never cached, and nothing on its way
// imports the AI port.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const { PantryDataError } = vi.hoisted(() => ({
  PantryDataError: class extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
}));
const readPlacePhotoImage = vi.fn();
const hasPlacePhoto = vi.fn();
vi.mock("@/features/pantry/server", () => ({
  PantryDataError,
  hasPlacePhoto: (id: string) => hasPlacePhoto(id),
  readPlacePhotoImage: (id: string) => readPlacePhotoImage(id),
}));

const { GET, HEAD } = await import("./route");

const id = "66666666-6666-4666-8666-666666666666";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function get(photoId = id) {
  return GET(new Request(`http://localhost:3100/api/pantry/photo/${photoId}`), {
    params: Promise.resolve({ id: photoId }),
  });
}

function head(photoId = id) {
  return HEAD(new Request(`http://localhost:3100/api/pantry/photo/${photoId}`, { method: "HEAD" }), {
    params: Promise.resolve({ id: photoId }),
  });
}

/** Every answer is private, never stored, and nosniff. */
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  readPlacePhotoImage.mockReset().mockResolvedValue({ data: new Blob([jpeg], { type: "image/jpeg" }), mediaType: "image/jpeg" });
  hasPlacePhoto.mockReset().mockResolvedValue(true);
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/pantry/photo/[id]", () => {
  it("sends the photo with the row's type, private and never stored, and nosniff", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-length")).toBe(String(jpeg.length));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    expect(readPlacePhotoImage).toHaveBeenCalledWith(id);
  });

  it("sends a PNG as a PNG", async () => {
    readPlacePhotoImage.mockResolvedValue({ data: new Blob([new Uint8Array([0x89])]), mediaType: "image/png" });
    expect((await get()).headers.get("content-type")).toBe("image/png");
  });

  it("answers 401 without a session, before anything is read", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await get();
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).not.toMatch(/^image\//);
    expectPrivate(response);
    expect(readPlacePhotoImage).not.toHaveBeenCalled();
  });

  it("answers the same 404 without a body for a photo that is gone, older or another user's", async () => {
    readPlacePhotoImage.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
  });

  it("answers 404, not 400, for an id that is not a uuid, without reading", async () => {
    for (const bad of ["abc", "../../etc", `${id}x`]) {
      const response = await get(bad);
      expect(response.status, bad).toBe(404);
      expect(await response.text()).toBe("");
    }
    expect(readPlacePhotoImage).not.toHaveBeenCalled();
  });

  it("answers 503 without a body when the photo cannot be read, and logs the reason only", async () => {
    readPlacePhotoImage.mockRejectedValue(new PantryDataError("download_failed 500"));
    const response = await get();
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledWith("pantry_photo_unavailable", { reason: "download_failed 500" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(id);
  });

  it("answers 500 without a body for a bug, private, logging the error's name only", async () => {
    readPlacePhotoImage.mockRejectedValue(new TypeError(`user/site/kyl/${id}.jpg`));
    const response = await get();
    expect(response.status).toBe(500);
    expectPrivate(response);
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledWith("pantry_photo_unavailable", { reason: "unexpected TypeError" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(id);
  });

  it("HEAD checks the row and the file without downloading it, with the same statuses", async () => {
    let response = await head();
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(hasPlacePhoto).toHaveBeenCalledWith(id);
    hasPlacePhoto.mockResolvedValue(false);
    response = await head();
    expect(response.status).toBe(404);
    expectPrivate(response);
    expect((await head("abc")).status).toBe(404);
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    response = await head();
    expect(response.status).toBe(401);
    expectPrivate(response);
    expect(await response.text()).toBe("");
    expect(hasPlacePhoto).toHaveBeenCalledTimes(2);
    expect(readPlacePhotoImage).not.toHaveBeenCalled();
  });

  it("HEAD answers 503 when the photo cannot be checked", async () => {
    hasPlacePhoto.mockRejectedValue(new PantryDataError("exists_threw"));
    const response = await head();
    expect(response.status).toBe(503);
    expectPrivate(response);
  });

  it("never imports the AI port, and never makes a public or signed URL", () => {
    // The route reads through pantry/server, which also exports analyzePlace; follow
    // readPlacePhotoImage's own files (server.ts's photo read and data/photos.ts).
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(here, "../../../../../..");
    const files = ["src/app/api/pantry/photo/[id]/route.ts", "src/features/pantry/data/photos.ts"];
    for (const file of files) {
      const path = join(root, file);
      expect(existsSync(path), relative(root, path)).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source, file).not.toMatch(/@\/server\/ai/);
      expect(source, file).not.toMatch(/getPublicUrl|createSignedUrl/);
    }
  });
});
