import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoItem } from "./schemas";
import { createModelAiService, type AiService } from "./service";
import { defaultLimits, runStructured, type ModelTarget } from "./run";
import { streamingModel, fakeModel } from "./test-support";
import { analyzeImageAnswer } from "./schemas";

// Kylfoto C: the fridge photo's items are read while the model writes them
// (streamText with partial output), each checked on its own, and a new
// attempt is made only when none of them could be read. Against a fake model;
// no call leaves the test.

const kyl = {
  data: new Uint8Array(readFileSync(new URL("../../../tests/fixtures/ai/kyl.png", import.meta.url))),
  mediaType: "image/png",
};
const signal = () => new AbortController().signal;

const milk = { l: "Mjölk 1 l", n: "mjölk", q: 1, u: "förp", s: "Mejeri", p: [200, 300], a: null };
const butter = { l: "Smör", n: "smör", q: null, u: null, s: "Mejeri", p: [500, 400], a: null };
const eggs = { l: "Ägg", n: "ägg", q: 12, u: "st", s: "Mejeri", p: [700, 600], a: null };
const json = (items: unknown[]) => JSON.stringify({ i: items });

/** The answer cut in pieces of `size` characters, so items are written a bit at a time. */
function pieces(text: string, size = 25): string[] {
  const out: string[] = [];
  for (let at = 0; at < text.length; at += size) out.push(text.slice(at, at + size));
  return out;
}

const limits = { ...defaultLimits, minRetryMs: 0 };
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function serviceOf(target: ModelTarget): AiService {
  return createModelAiService(target, limits);
}

describe("analyzeImage that streams", () => {
  it("hands out each item as it has been written, and ends with all of them", async () => {
    const seen: string[][] = [];
    const model = streamingModel([pieces(json([milk, butter, eggs]))]);
    const result = await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), {
      onItems: (items: PhotoItem[]) => seen.push(items.map((item) => item.label)),
    });
    expect(result.ok && result.data.items.map((item) => item.label)).toEqual(["Mjölk 1 l", "Smör", "Ägg"]);
    // Every list has the items before it as its start, and it only grows.
    expect(seen.length).toBeGreaterThan(1);
    for (let index = 1; index < seen.length; index++) {
      expect(seen[index].length).toBeGreaterThan(seen[index - 1].length);
      expect(seen[index].slice(0, seen[index - 1].length)).toEqual(seen[index - 1]);
    }
    // The first item is out before the last has been written.
    expect(seen[0]).toEqual(["Mjölk 1 l"]);
  });

  it("has read the first item before the model has written the whole answer", async () => {
    const text = json([milk, butter, eggs]);
    const all = pieces(text);
    const reported: number[] = [];
    let handedWhenFirst = -1;
    const model = streamingModel([all], (_answer, piece) => {
      if (reported.length > 0 && handedWhenFirst < 0) handedWhenFirst = piece;
    });
    await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), {
      onItems: (items) => reported.push(items.length),
    });
    expect(reported[0]).toBe(1);
    expect(handedWhenFirst).toBeGreaterThanOrEqual(0);
    expect(handedWhenFirst).toBeLessThan(all.length - 1);
  });

  it("leaves out an item that cannot be read and keeps the others, without a new attempt", async () => {
    const broken = { ...butter, l: 5 };
    const model = streamingModel([pieces(json([milk, broken, eggs]))]);
    const result = await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), {
      onItems: () => {},
    });
    expect(result.ok && result.data.items.map((item) => item.label)).toEqual(["Mjölk 1 l", "Ägg"]);
    expect(result.ok && result.data.invalid).toBe(1);
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("asks again only when no item could be read, and then tells the model", async () => {
    const bad = { l: 5 };
    const model = streamingModel([pieces(json([bad, bad])), pieces(json([milk]))]);
    const result = await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), {
      onItems: () => {},
    });
    expect(result.ok && result.data.items.map((item) => item.label)).toEqual(["Mjölk 1 l"]);
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it("gives ai_invalid when no attempt gives an item that can be read", async () => {
    const bad = { l: 5 };
    const model = streamingModel([pieces(json([bad]))]);
    const result = await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), {
      onItems: () => {},
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
    expect(model.doStreamCalls).toHaveLength(3);
    expect(errors).toHaveBeenCalled();
  });

  it("takes an empty list as a true answer", async () => {
    const model = streamingModel([pieces(json([]))]);
    const result = await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), {
      onItems: () => {},
    });
    expect(result).toEqual({ ok: true, data: { items: [], invalid: 0, repeated: 0 } });
  });

  it("reads nothing more once the run is stopped", async () => {
    const controller = new AbortController();
    const reported: number[] = [];
    const model = streamingModel([pieces(json([milk, butter, eggs]))], (_answer, piece) => {
      if (piece === 6) controller.abort();
    });
    const result = await serviceOf({ model, streaming: true }).analyzeImage({ image: kyl, place: "Kyl" }, controller.signal, {
      onItems: (items) => {
        reported.push(items.length);
      },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(reported.at(-1) ?? 0).toBeLessThan(3);
  });

  it("answers as one when the model cannot stream, with the same items", async () => {
    const model = fakeModel(json([milk, butter]));
    const onItems = vi.fn();
    const result = await serviceOf({ model }).analyzeImage({ image: kyl, place: "Kyl" }, signal(), { onItems });
    expect(result.ok && result.data.items.map((item) => item.label)).toEqual(["Mjölk 1 l", "Smör"]);
    expect(onItems).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});

describe("runStructured with a stream request", () => {
  it("is an ordinary request on a target that does not stream", async () => {
    const model = fakeModel(json([milk]));
    const onPartial = vi.fn();
    const result = await runStructured(
      { model },
      {
        schema: analyzeImageAnswer,
        system: "x",
        messages: [{ role: "user", content: "x" }],
        stream: { onPartial, read: () => undefined },
      },
      signal(),
      limits,
    );
    expect(result.ok).toBe(true);
    expect(onPartial).not.toHaveBeenCalled();
  });
});
