import { afterEach, describe, expect, it, vi } from "vitest";
import { errorMessages } from "@/lib/errors";
import { photoPostTimeoutMs, postPlacePhoto } from "./photo-post";

// The photo's POST (Story 10.1): its own 60 s and nothing else that stops it,
// and which answers allow one more try.

const photoId = "33333333-3333-4333-8333-333333333333";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postPlacePhoto", () => {
  it("posts the form to /api/pantry/photo with a timeout of 60 s, and gives the id", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetch = vi.fn(async () => json(200, { ok: true, data: { id: photoId } }));
    vi.stubGlobal("fetch", fetch);
    const form = new FormData();
    expect(await postPlacePhoto(form)).toEqual({ kind: "saved", id: photoId });
    expect(timeout).toHaveBeenCalledWith(photoPostTimeoutMs);
    expect(photoPostTimeoutMs).toBe(60_000);
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/pantry/photo");
    expect(init).toMatchObject({ method: "POST", body: form });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it.each([
    ["no connection or the 60 s are up", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a 500", async () => json(500, { ok: false, error: { code: "pantry_photo_failed", message: errorMessages.pantry_photo_failed } })],
    ["a 503 page that is not JSON", async () => new Response("<html>", { status: 503 })],
  ])("allows one more try after %s", async (_name, answer) => {
    vi.stubGlobal("fetch", vi.fn(answer));
    expect(await postPlacePhoto(new FormData())).toEqual({ kind: "retry" });
  });

  it.each([
    ["validation (400)", 400, { ok: false, error: { code: "validation", message: "" } }],
    ["a WebP (415)", 415, { ok: false, error: { code: "validation", message: "" } }],
    ["unauthorized (401)", 401, { ok: false, error: { code: "unauthorized", message: "" } }],
    ["pantry_site_gone (409)", 409, { ok: false, error: { code: "pantry_site_gone", message: "" } }],
    ["an ok answer without an id", 200, { ok: true, data: {} }],
  ])("gives a final answer for %s", async (_name, status, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(status, body)));
    expect(await postPlacePhoto(new FormData())).toEqual({ kind: "final" });
  });
});
