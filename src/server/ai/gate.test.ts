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

  it("answers the gate's refusal when the cap could not be checked (fails closed)", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue("ai_cap_check_failed"));
    expect(await service.parseRecipe(input, AbortSignal.timeout(5_000))).toMatchObject({ ok: false, error: { code: "ai_cap_check_failed" } });
    expect(sink).not.toHaveBeenCalled();
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

describe("readMenu (Menyrådgivare) goes through the gate and the usage sink", () => {
  const images = [{ data: new Uint8Array([1, 2, 3]), mediaType: "image/png" as const }];

  it("answers ai_cap_reached without reaching the model when the gate says no", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue(false));
    expect(await service.readMenu({ images }, AbortSignal.timeout(5_000))).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(sink).not.toHaveBeenCalled();
  });

  it("reads the menu and counts the call when the gate says yes", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue(true));
    const answer = await service.readMenu({ images }, AbortSignal.timeout(5_000));
    expect(answer.ok && answer.data.menu.ratter.map((dish) => dish.originalnamn)).toEqual(["Pulpo a la gallega", "Croquetas de jamón", "Paella del chef", "Cerveza"]);
    expect(sink).toHaveBeenCalledTimes(1);
  });
});

describe("planWeek (Veckoagenten) goes through the gate and the usage sink", () => {
  const recipe = { id: "a", title: "Pasta", ingredients: ["400 g pasta"], minutes: 30, vegetarian: true, offers: [], useSoon: [] };
  const input = { weekStart: "2026-11-16", openDays: [1], recipes: [recipe], fixedDays: [], vegetarianDays: [], leftoverDays: [], skipDays: [], budget: "normal" as const, quickWeekdays: false, useSoonFirst: true, favourOffers: true, likes: [], dislikes: [], recent: [] };

  it("answers ai_cap_reached without reaching the model when the gate says no", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue(false));
    expect(await service.planWeek(input, AbortSignal.timeout(5_000))).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(sink).not.toHaveBeenCalled();
  });

  it("reports one usage record when the gate lets it through", async () => {
    const sink = vi.fn();
    const service = getAiServiceFor(null, sink, vi.fn().mockResolvedValue(true));
    expect(await service.planWeek(input, AbortSignal.timeout(5_000))).toMatchObject({ ok: true });
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
