import { beforeEach, describe, expect, it, vi } from "vitest";

// Tak för AI-kostnad, as getAiServiceForUser wires it (security review S-02, S-03): the gate fails
// CLOSED except for an exempt household, and the reservation refuses a call when the household's day
// before it (other calls' open reservations included) is at the cap, releasing its placeholders.
// The database is a fake answering each function by name; the AI port is replaced so the test gets
// the closures it is handed.

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", NODE_ENV: "test", AI_SETTINGS_EMAILS: [] } }));

type Answer = { data?: unknown; error?: { code: string } | null };
let answers: Record<string, Answer | (() => Answer)>;
const rpc = vi.fn(async (name: string, _args?: unknown) => {
  const answer = answers[name];
  const value = typeof answer === "function" ? answer() : answer;
  return { data: value?.data ?? null, error: value?.error ?? null };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, auth: { getClaims: async () => ({ data: { claims: { sub: "u1", email: "a@b.se" } }, error: null }) } }),
}));

type Wired = {
  sink: (usage: { model: string; inputTokens: number; outputTokens: number }) => Promise<void>;
  gate: () => Promise<boolean | string>;
  reserve: (estimate: { model: string; inputTokens: number; outputTokens: number }[]) => Promise<
    { ok: true; hold: { settle: (usage: { model: string; inputTokens: number; outputTokens: number }[]) => Promise<void> } } | { ok: false; code: string }
  >;
};
vi.mock("@/server/ai", () => ({ getAiServiceFor: (_choice: unknown, sink: unknown, gate: unknown, reserve: unknown) => ({ sink, gate, reserve }) }));

const { getAiServiceForUser, isAiCapReached } = await import("./server");
const wired = async () => (await getAiServiceForUser()) as unknown as Wired;

const sonnet = "claude-sonnet-5-5";
/** Sonnet at 10 USD per million out and 10 kr per USD: 100 000 tokens out is 10 kr. */
const status = (outputTokens: number, exempt = false) => ({ data: [{ cap_sek: 10, exempt, model: sonnet, input_tokens: 0, output_tokens: outputTokens }] });
const reservation = (outputTokens: number, extra: Record<string, unknown> = {}) => ({
  data: { reservation: "r1", cap_sek: 10, exempt: false, too_many: false, usage: [{ model: sonnet, input_tokens: 0, output_tokens: outputTokens }], ...extra },
});
const broken = { error: { code: "57014" } };
const estimate = [{ model: sonnet, inputTokens: 1000, outputTokens: 2000 }];

beforeEach(() => {
  answers = {};
  rpc.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("the gate", () => {
  it("lets a household under the cap through and stops one at it", async () => {
    answers.ai_cap_status = status(99_999);
    expect(await (await wired()).gate()).toBe(true);
    answers.ai_cap_status = status(100_000);
    expect(await (await wired()).gate()).toBe("ai_cap_reached");
    answers.ai_cap_status = status(100_000, true);
    expect(await (await wired()).gate()).toBe(true);
  });

  it("fails closed when the day's sum cannot be read, except for an exempt household (S-03)", async () => {
    answers.ai_cap_status = broken;
    answers.ai_cap_exempt = { data: false };
    expect(await (await wired()).gate()).toBe("ai_cap_check_failed");
    expect(await isAiCapReached()).toBe(true);
    answers.ai_cap_exempt = broken;
    expect(await (await wired()).gate()).toBe("ai_cap_check_failed");
    answers.ai_cap_exempt = { data: true };
    expect(await (await wired()).gate()).toBe(true);
    expect(await isAiCapReached()).toBe(false);
  });
});

describe("the reservation", () => {
  it("goes on under the cap and settles with what the run used", async () => {
    answers.ai_usage_reserve = reservation(50_000);
    answers.ai_usage_settle = { data: true };
    const reserved = await (await wired()).reserve(estimate);
    expect(rpc).toHaveBeenCalledWith("ai_usage_reserve", { usage: [{ model: sonnet, input_tokens: 1000, output_tokens: 2000 }] });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    await reserved.hold.settle([{ model: sonnet, inputTokens: 10, outputTokens: 20 }]);
    expect(rpc).toHaveBeenLastCalledWith("ai_usage_settle", { reservation: "r1", usage: [{ model: sonnet, input_tokens: 10, output_tokens: 20 }] });
  });

  it("is refused at the cap, counting other calls' open reservations, and releases its placeholders", async () => {
    answers.ai_usage_reserve = reservation(100_000);
    answers.ai_usage_settle = { data: true };
    expect(await (await wired()).reserve(estimate)).toEqual({ ok: false, code: "ai_cap_reached" });
    expect(rpc).toHaveBeenLastCalledWith("ai_usage_settle", { reservation: "r1", usage: [] });
  });

  it("goes on for an exempt household whatever it has used", async () => {
    answers.ai_usage_reserve = reservation(9_000_000, { exempt: true });
    expect((await (await wired()).reserve(estimate)).ok).toBe(true);
  });

  it("is refused as at the cap when the household has too many rows today", async () => {
    answers.ai_usage_reserve = reservation(0, { reservation: null, too_many: true });
    expect(await (await wired()).reserve(estimate)).toEqual({ ok: false, code: "ai_cap_reached" });
    expect(rpc).not.toHaveBeenCalledWith("ai_usage_settle", expect.anything());
  });

  it("fails closed when it cannot be made, except for an exempt household, whose usage is saved afterwards", async () => {
    answers.ai_usage_reserve = broken;
    answers.ai_cap_exempt = { data: false };
    expect(await (await wired()).reserve(estimate)).toEqual({ ok: false, code: "ai_cap_check_failed" });
    answers.ai_cap_exempt = { data: true };
    const reserved = await (await wired()).reserve(estimate);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    // Saved as a reservation settled at once; here the database still fails, which settle reports by throwing.
    await expect(reserved.hold.settle([{ model: sonnet, inputTokens: 10, outputTokens: 20 }])).rejects.toThrow();
  });
});

describe("the sink", () => {
  it("saves a usage row through a reservation settled at once (no client insert, S-03)", async () => {
    answers.ai_usage_reserve = reservation(0, { reservation: "r2" });
    answers.ai_usage_settle = { data: true };
    await (await wired()).sink({ model: "mock", inputTokens: 0, outputTokens: 0 });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["ai_usage_reserve", "ai_usage_settle"]);
    expect(rpc).toHaveBeenLastCalledWith("ai_usage_settle", { reservation: "r2", usage: [{ model: "mock", input_tokens: 0, output_tokens: 0 }] });
  });
});
