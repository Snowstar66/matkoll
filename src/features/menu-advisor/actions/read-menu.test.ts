import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMenuStreamLine, type MenuStreamEvent } from "../domain/reading";
import type { Menu } from "../domain/types";
import { readMenuPhotoLive } from "./read-menu";

const dish = { originalnamn: "Pulpo", grupp: "Varmrätt", forklaring: "Kokt bläckfisk", huvudingredienser: [], kategori: "skaldjur", allergener: [], kan_innehalla: [], pris: 10, valuta: "EUR" } as const;
const menu: Menu = { restaurang: null, sprak: "es", ratter: [{ ...dish, huvudingredienser: [], allergener: [], kan_innehalla: [] }], osakert: [] };
const photo = new Blob(["x"], { type: "image/jpeg" });

function streamOf(parts: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("readMenuPhotoLive", () => {
  it("hands every line to onEvent as it arrives and answers the finished reading", async () => {
    const lines = [
      formatMenuStreamLine({ type: "reading", quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" }),
      formatMenuStreamLine({ type: "dish", index: 0, dish: menu.ratter[0]! }),
      formatMenuStreamLine({ type: "done", menu, quality: "standard", escalated: false, model: "Haiku 5.5", effort: "låg" }),
    ];
    // Cut in the middle of a line.
    const fetchMock = vi.fn<typeof fetch>(async () => streamOf([lines[0]!, lines[1]!.slice(0, 15), lines[1]!.slice(15) + lines[2]!]));
    vi.stubGlobal("fetch", fetchMock);
    const seen: MenuStreamEvent[] = [];
    const result = await readMenuPhotoLive(photo, "standard", new AbortController().signal, (event) => seen.push(event));
    expect(seen.map((event) => event.type)).toEqual(["reading", "dish", "done"]);
    expect(result).toMatchObject({ ok: true, data: { quality: "standard", model: "Haiku 5.5", effort: "låg", menu: { ratter: [{ originalnamn: "Pulpo" }] } } });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/menu/read?stream=1");
  });

  it("fails with the code of an error line, and with ai_unavailable when the stream stops without an end", async () => {
    vi.stubGlobal("fetch", async () => streamOf([formatMenuStreamLine({ type: "error", code: "ai_invalid" })]));
    expect(await readMenuPhotoLive(photo, "standard", new AbortController().signal, () => {})).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
    vi.stubGlobal("fetch", async () => streamOf([formatMenuStreamLine({ type: "language", sprak: "es" })]));
    expect(await readMenuPhotoLive(photo, "standard", new AbortController().signal, () => {})).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
  });

  it("reads a plain JSON failure (the cap) as the usual result", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ok: false, error: { code: "ai_cap_reached", message: "x" } }, { status: 429 }));
    expect(await readMenuPhotoLive(photo, "careful", new AbortController().signal, () => {})).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
  });

  it("is aborted when the caller stops it", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    expect(await readMenuPhotoLive(photo, "standard", controller.signal, () => {})).toEqual({ ok: false, aborted: true });
  });
});
