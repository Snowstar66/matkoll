import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultLimits } from "./run";
import { createModelAiService, type MenuProgress } from "./service";
import { fakeModel, streamingModel } from "./test-support";

// Menyrådgivare, live: the dishes of a menu are handed out while the model writes them, each checked on its own,
// against a fake model; no call leaves the test.

const image = { data: new Uint8Array([137, 80, 78, 71]), mediaType: "image/png" };
const signal = () => new AbortController().signal;
const limits = { ...defaultLimits, minRetryMs: 0 };

const dish = (name: string, pris: number | null = 10) => ({
  originalnamn: name,
  grupp: "Varmrätt",
  forklaring: "Bläckfisk i vitlök och persilja med inlagd lök och klyftpotatis",
  huvudingredienser: ["bläckfisk"],
  kategori: "skaldjur",
  allergener: ["skaldjur"],
  kan_innehalla: [],
  pris,
  valuta: pris === null ? null : "EUR",
});
const answer = (...dishes: unknown[]) => JSON.stringify({ restaurang: "Casa", sprak: "es", valutasymbol_pa_menyn: "€", ratter: dishes, osakert: [] });
const pieces = (text: string, size = 30) => Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function service(standard: ReturnType<typeof streamingModel> | ReturnType<typeof fakeModel>, careful = standard, streaming = true) {
  return createModelAiService({ model: standard, streaming }, limits, undefined, {
    standard: { model: standard, streaming },
    careful: { model: careful, streaming },
  });
}

describe("readMenu that streams", () => {
  it("hands out the dishes one at a time, in order, with the language first, and ends with the whole menu", async () => {
    const seen: MenuProgress[] = [];
    const model = streamingModel([pieces(answer(dish("Pulpo"), dish("Gambas"), dish("Paella")))]);
    const result = await service(model).readMenu({ images: [image] }, signal(), { onMenu: (progress) => seen.push(progress) });
    expect(result).toMatchObject({ ok: true, data: { quality: "standard", escalated: false } });
    expect(seen[0]).toEqual({ stage: "reading", quality: "standard", escalated: false });
    expect(seen[1]).toMatchObject({ stage: "language", sprak: "es", symbol: "€" });
    const lists = seen.flatMap((progress) => (progress.stage === "dishes" ? [progress.dishes.map((d) => d.originalnamn)] : []));
    expect(lists.length).toBeGreaterThan(1);
    expect(lists[0]).toEqual(["Pulpo"]);
    expect(lists.at(-1)).toEqual(["Pulpo", "Gambas", "Paella"]);
    for (let at = 1; at < lists.length; at++) {
      expect(lists[at]!.length).toBeGreaterThan(lists[at - 1]!.length);
      expect(lists[at]!.slice(0, lists[at - 1]!.length)).toEqual(lists[at - 1]);
    }
  });

  it("has the first dish before the model has written the whole answer", async () => {
    const all = pieces(answer(dish("Pulpo"), dish("Gambas"), dish("Paella")));
    let reportedAt = -1;
    let handed = -1;
    const model = streamingModel([all], (_answer, piece) => {
      handed = piece;
    });
    await service(model).readMenu({ images: [image] }, signal(), {
      onMenu: (progress) => {
        if (progress.stage === "dishes" && reportedAt < 0) reportedAt = handed;
      },
    });
    expect(reportedAt).toBeGreaterThanOrEqual(0);
    expect(reportedAt).toBeLessThan(all.length - 1);
  });

  it("leaves out a dish that cannot be read, without failing the reading when the whole answer is valid", async () => {
    const model = streamingModel([pieces(answer(dish("Pulpo"), dish("Gambas")))]);
    const lists: string[][] = [];
    await service(model).readMenu({ images: [image] }, signal(), { onMenu: (progress) => progress.stage === "dishes" && lists.push(progress.dishes.map((d) => d.originalnamn)) });
    expect(lists.at(-1)).toEqual(["Pulpo", "Gambas"]);
  });

  it("without streaming support sends the language and every dish once, when the reading is done", async () => {
    const seen: MenuProgress[] = [];
    const result = await service(fakeModel(answer(dish("Pulpo"), dish("Gambas"))), undefined, false).readMenu({ images: [image] }, signal(), { onMenu: (progress) => seen.push(progress) });
    expect(result.ok).toBe(true);
    expect(seen.map((progress) => progress.stage)).toEqual(["reading", "dishes"]);
    expect(seen[1]).toMatchObject({ stage: "dishes", dishes: [{ originalnamn: "Pulpo" }, { originalnamn: "Gambas" }] });
  });

  it("says when a standard reading is redone as careful, so the client can start over", async () => {
    const seen: MenuProgress[] = [];
    const standard = streamingModel([pieces(answer(dish("Pulpo", null)))]);
    const careful = streamingModel([pieces(answer(dish("Pulpo", 17.95), dish("Gambas", 12)))]);
    const result = await service(standard, careful).readMenu({ images: [image] }, signal(), { onMenu: (progress) => seen.push(progress) });
    expect(result).toMatchObject({ ok: true, data: { quality: "careful", escalated: true } });
    const readings = seen.filter((progress) => progress.stage === "reading");
    expect(readings).toEqual([
      { stage: "reading", quality: "standard", escalated: false },
      { stage: "reading", quality: "careful", escalated: true },
    ]);
    const last = seen.filter((progress) => progress.stage === "dishes").at(-1);
    expect(last).toMatchObject({ dishes: [{ originalnamn: "Pulpo", pris: 17.95 }, { originalnamn: "Gambas" }] });
  });

  it("works as before without a callback", async () => {
    const result = await service(fakeModel(answer(dish("Pulpo")))).readMenu({ images: [image] }, signal());
    expect(result).toMatchObject({ ok: true, data: { menu: { ratter: [{ originalnamn: "Pulpo" }] } } });
  });
});
