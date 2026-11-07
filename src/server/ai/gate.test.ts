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
