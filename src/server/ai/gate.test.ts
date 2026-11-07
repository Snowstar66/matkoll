import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", NODE_ENV: "test" } }));

const { getAiServiceFor } = await import("./index");

const input = { text: "Pannkakor: 3 dl mjölk" };

describe("the cost cap gate (Tak för AI-kostnad)", () => {
  it("answers ai_cap_reached without reaching the model or the usage sink when the gate says no", async () => {
    const sink = vi.fn();
    const gate = vi.fn().mockResolvedValue(false);
    const service = getAiServiceFor(null, sink, gate);
    const answer = await service.parseRecipe(input, AbortSignal.timeout(5_000));
    expect(answer).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(gate).toHaveBeenCalledTimes(1);
    expect(sink).not.toHaveBeenCalled();
  });

  it("asks before every call and lets a call through when the gate says yes", async () => {
    const gate = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const service = getAiServiceFor(null, undefined, gate);
    const first = await service.parseRecipe(input, AbortSignal.timeout(5_000));
    expect(first.ok || first.error.code !== "ai_cap_reached").toBe(true);
    const second = await service.parseRecipe(input, AbortSignal.timeout(5_000));
    expect(second).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(gate).toHaveBeenCalledTimes(2);
  });

  it("leaves warmUp alone: it is local and not counted", async () => {
    const gate = vi.fn().mockResolvedValue(false);
    const service = getAiServiceFor(null, undefined, gate);
    await service.warmUp("text", AbortSignal.timeout(5_000)).catch(() => undefined);
    expect(gate).not.toHaveBeenCalled();
  });

  it("is not in the way without a gate", async () => {
    const service = getAiServiceFor(null);
    const answer = await service.parseRecipe(input, AbortSignal.timeout(5_000));
    expect(answer.ok || answer.error.code !== "ai_cap_reached").toBe(true);
  });
});

describe("readShoppingList (Fota en lista) goes through the gate and the usage sink", () => {
  const image = { data: new Uint8Array([1, 2, 3]), mediaType: "image/png" as const };

  it("answers ai_cap_reached without reaching the model when the gate says no", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue(false));
    const answer = await service.readShoppingList({ image }, AbortSignal.timeout(5_000));
    expect(answer).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(sink).not.toHaveBeenCalled();
  });

  it("reads the list and counts the call when the gate says yes", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue(true));
    const answer = await service.readShoppingList({ image }, AbortSignal.timeout(5_000));
    expect(answer.ok && answer.data.items.map((item) => item.name)).toEqual(["Mjölk", "Bananer", "Hushållspapper", "Kaffe", "Skogsbärsyoghurt"]);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("is gated like every other method of the port: all but warmUp and warmUpKey ask the gate", async () => {
    const methods = Object.keys(getAiServiceFor(null)).filter((name) => name !== "warmUp" && name !== "warmUpKey");
    expect(methods).toContain("readShoppingList");
    const gate = vi.fn().mockResolvedValue(false);
    const service = getAiServiceFor(null, undefined, gate);
    for (const name of methods) {
      const call = service[name as keyof typeof service] as unknown as (...args: unknown[]) => Promise<unknown>;
      expect(await call({}, AbortSignal.timeout(5_000)), name).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    }
    expect(gate).toHaveBeenCalledTimes(methods.length);
  });
});
