import { describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { pickWithAi } from "./ai-pick";
import { buildLlmInput } from "./domain/llm-input";
import { defaultRestaurantSettings, type MenuSource } from "./domain/types";

const prices = { standard: { usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 }, careful: { usdPerMTokIn: 2, usdPerMTokOut: 10 } };
const sources: MenuSource[] = [
  { placeId: "p1", url: "https://a.se/meny", text: "Pizza", via: "fetch" },
  { placeId: "p2", url: "https://b.se/", text: "Pasta", via: "fetch" },
];
const input = buildLlmInput(defaultRestaurantSettings, { people: [] }, ["p1", "p2"], sources);
const good = { placeId: "p1", menuStatus: "found", why: [{ text: "Pizza", sourceUrl: "https://a.se/meny" }], warnings: [] };
const bad = { placeId: "ghost", menuStatus: "found", why: [{ text: "x", sourceUrl: "https://a.se/meny" }], warnings: [] };
const answer = (suggestions: unknown[], quality: "standard" | "careful" = "standard") => ok({ suggestions, quality }) as never;
const budget = { spentSek: 0, dayRemainingSek: 10 };
const run = (ai: { pickRestaurants: ReturnType<typeof vi.fn> }, b = budget) => pickWithAi(ai as never, input, sources, prices, b, new AbortController().signal);

describe("pickWithAi", () => {
  it("accepts a clean Haiku answer and never asks Sonnet", async () => {
    const ai = { pickRestaurants: vi.fn().mockResolvedValue(answer([good])) };
    const outcome = await run(ai);
    expect(outcome).toMatchObject({ status: "ok", model: "haiku-5.5", rejected: 0 });
    expect(ai.pickRestaurants).toHaveBeenCalledTimes(1);
    expect(ai.pickRestaurants.mock.calls[0]?.[0]).toMatchObject({ quality: "standard" });
  });

  it("asks Sonnet 5.5 once when the guard rejects something, and takes its cleaner answer", async () => {
    const ai = { pickRestaurants: vi.fn().mockResolvedValueOnce(answer([bad])).mockResolvedValueOnce(answer([good], "careful")) };
    const outcome = await run(ai);
    expect(outcome).toMatchObject({ status: "ok", model: "sonnet-5.5" });
    expect(ai.pickRestaurants.mock.calls[1]?.[0]).toMatchObject({ quality: "careful" });
  });

  it("keeps Haiku's valid picks when Sonnet is no better", async () => {
    const ai = { pickRestaurants: vi.fn().mockResolvedValueOnce(answer([good, bad])).mockResolvedValueOnce(answer([bad], "careful")) };
    expect(await run(ai)).toMatchObject({ status: "ok", model: "haiku-5.5", picks: [{ placeId: "p1" }], rejected: 1 });
  });

  it("does not retry when the day has no room for the dearer call", async () => {
    const ai = { pickRestaurants: vi.fn().mockResolvedValue(answer([bad])) };
    expect(await run(ai, { spentSek: 0, dayRemainingSek: 0.02 })).toMatchObject({ status: "failed" });
    expect(ai.pickRestaurants).toHaveBeenCalledTimes(1);
  });

  it("stops before the first call when the cap leaves no room, and when the port says ai_cap_reached", async () => {
    const none = { pickRestaurants: vi.fn() };
    expect(await run(none, { spentSek: 0, dayRemainingSek: 0 })).toMatchObject({ status: "cap_reached", cap: "day" });
    expect(await run(none, { spentSek: 1.999, dayRemainingSek: 10 })).toMatchObject({ status: "cap_reached", cap: "run" });
    expect(none.pickRestaurants).not.toHaveBeenCalled();
    const gated = { pickRestaurants: vi.fn().mockResolvedValue(fail("ai_cap_reached")) };
    expect(await run(gated)).toMatchObject({ status: "cap_reached", cap: "day" });
  });

  it("does not spend a second call on an unavailable model, but does on an invalid answer", async () => {
    const down = { pickRestaurants: vi.fn().mockResolvedValue(fail("ai_unavailable")) };
    expect(await run(down)).toMatchObject({ status: "failed", code: "ai_unavailable" });
    expect(down.pickRestaurants).toHaveBeenCalledTimes(1);
    const invalid = { pickRestaurants: vi.fn().mockResolvedValueOnce(fail("ai_invalid")).mockResolvedValueOnce(answer([good], "careful")) };
    expect(await run(invalid)).toMatchObject({ status: "ok", model: "sonnet-5.5" });
  });
});
