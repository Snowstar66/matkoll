import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { estimateInputTokens, imageTokens, maxImageTokens } from "./estimate";
import { runStructured, type Limits } from "./run";
import { aiRecipe } from "./schemas";
import { createModelAiService } from "./service";
import { fakeModel, textAnswer, untilAborted, validRecipe } from "./test-support";
import { withUsageSink, type AiUsage, type AiUsageHold, type AiUsageReserver } from "./usage";
import type { WebSearchRunner, WebSearchUsed } from "./web-search";

// Tak för AI-kostnad, security review S-01 and S-02: a run is counted also when it is aborted, times
// out or fails (at an estimate of what it sent and wrote), and with a reserver every run reserves its
// worst case before the model is asked, refused at the cap or when the cap cannot be checked.

const limits: Limits = { healthMs: 30_000, attemptMs: 30_000, totalMs: 60_000, maxAttempts: 3, minRetryMs: 0 };
const request = {
  schema: aiRecipe,
  system: "Tolka receptet.",
  messages: [{ role: "user" as const, content: "Pannkakor: 3 dl mjölk, salt." }],
};
const sent = estimateInputTokens(request.system, request.messages, request.schema);
const signal = () => new AbortController().signal;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Runs `run` with a sink that collects the usage, and (optionally) a reserver. */
async function metered<T>(run: () => Promise<T>, reserve?: AiUsageReserver): Promise<{ result: T; seen: AiUsage[] }> {
  const seen: AiUsage[] = [];
  const result = await withUsageSink((usage) => void seen.push(usage), run, reserve);
  return { result, seen };
}

function apiError(statusCode: number) {
  return new APICallError({ message: "provider error", url: "https://api.example/v1", requestBodyValues: {}, statusCode, isRetryable: false });
}

/** A model that streams `pieces` of its answer and then waits until its call is aborted. */
function streamThenHang(pieces: string[]) {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue({ type: "text-start", id: "t" });
          for (const delta of pieces) controller.enqueue({ type: "text-delta", id: "t", delta });
          await untilAborted(abortSignal).catch((error: unknown) => controller.error(error));
        },
      });
      return { stream: stream as never };
    },
  });
}

describe("S-01: a run is counted when it does not end with the provider's usage", () => {
  it("counts an attempt the caller aborted at what it sent", async () => {
    const caller = new AbortController();
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) => {
        caller.abort();
        return untilAborted(abortSignal);
      },
    });
    const { result, seen } = await metered(() => runStructured({ model }, request, caller.signal, limits));
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(sent).toBeGreaterThan(0);
    expect(seen).toEqual([{ model: "mock-model-id", inputTokens: sent, outputTokens: 0 }]);
  });

  it("counts an attempt that timed out at what it sent", async () => {
    const model = new MockLanguageModelV4({ doGenerate: ({ abortSignal }) => untilAborted(abortSignal) });
    const { result, seen } = await metered(() => runStructured({ model }, request, signal(), { ...limits, attemptMs: 20, totalMs: 40, maxAttempts: 1 }));
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(seen).toEqual([{ model: "mock-model-id", inputTokens: sent, outputTokens: 0 }]);
  });

  it("counts a broken connection or a 5xx at what it sent, and a 4xx refusal not at all", async () => {
    for (const error of [apiError(529), apiError(500), new Error("socket hang up")]) {
      const model = new MockLanguageModelV4({ doGenerate: () => Promise.reject(error) });
      const { seen } = await metered(() => runStructured({ model }, request, signal(), limits));
      expect(seen).toEqual([{ model: "mock-model-id", inputTokens: sent, outputTokens: 0 }]);
    }
    const refused = new MockLanguageModelV4({ doGenerate: () => Promise.reject(apiError(400)) });
    const { result, seen } = await metered(() => runStructured({ model: refused }, request, signal(), limits));
    expect(result).toMatchObject({ ok: false, error: { code: "ai_rejected" } });
    expect(seen).toEqual([]);
  });

  it("adds an aborted attempt's estimate to the earlier attempts' real usage", async () => {
    const caller = new AbortController();
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) => {
        if (call++ === 0) return Promise.resolve(textAnswer("inte json"));
        caller.abort();
        return untilAborted(abortSignal);
      },
    });
    const { seen } = await metered(() => runStructured({ model }, request, caller.signal, limits));
    // The second attempt also sends the feedback about the first answer, so it sends more.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.inputTokens).toBeGreaterThan(10 + sent);
    expect(seen[0]!.outputTokens).toBe(20);
  });

  it("counts a streamed answer cut off by the caller at what it sent and what it wrote so far", async () => {
    const caller = new AbortController();
    const written = JSON.stringify(validRecipe);
    const model = streamThenHang([written.slice(0, 40), written.slice(40, 120)]);
    const stream = {
      onPartial: () => {
        setTimeout(() => caller.abort(), 0);
      },
      read: () => undefined,
    };
    const { result, seen } = await metered(() => runStructured({ model, streaming: true }, { ...request, stream }, caller.signal, limits));
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.inputTokens).toBe(sent);
    expect(seen[0]!.outputTokens).toBeGreaterThan(0);
  });
});

describe("estimates", () => {
  it("reads an image's size for its tokens, and takes the most when it cannot", () => {
    // A PNG header of 1000 × 750 pixels: 1000 tokens.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x02, 0xee, 8, 2, 0, 0, 0]);
    expect(imageTokens(png)).toBe(1000);
    expect(imageTokens(new Uint8Array([1, 2, 3]))).toBe(maxImageTokens);
    const withImage = estimateInputTokens("", [{ role: "user", content: [{ type: "file", data: png, mediaType: "image/png" }] }]);
    expect(withImage).toBeGreaterThanOrEqual(1000);
  });
});

describe("S-02: a run reserves its worst case before the model is asked", () => {
  function reserverWith(answer: Awaited<ReturnType<AiUsageReserver>>) {
    return vi.fn<AiUsageReserver>(async () => answer);
  }

  it("reserves every attempt's send and limit, then settles the reservation with what the run used", async () => {
    const settle = vi.fn<AiUsageHold["settle"]>(async () => {});
    const reserve = reserverWith({ ok: true, hold: { settle } });
    const { result, seen } = await metered(() => runStructured({ model: fakeModel(JSON.stringify(validRecipe)) }, { ...request, maxOutputTokens: 1000 }, signal(), limits), reserve);
    expect(result).toEqual({ ok: true, data: validRecipe });
    expect(reserve).toHaveBeenCalledWith([{ model: "mock-model-id", inputTokens: sent * 3, outputTokens: 1000 * 3 }]);
    expect(settle).toHaveBeenCalledExactlyOnceWith([{ model: "mock-model-id", inputTokens: 10, outputTokens: 20 }]);
    // With a reservation, the sink is not used: the settlement is the record.
    expect(seen).toEqual([]);
  });

  it("adds the thinking room to the reserved output", async () => {
    const reserve = reserverWith({ ok: true, hold: { settle: async () => {} } });
    await metered(() => runStructured({ model: fakeModel(JSON.stringify(validRecipe)), extraOutputTokens: 8000 }, { ...request, maxOutputTokens: 1000 }, signal(), { ...limits, maxAttempts: 2 }), reserve);
    expect(reserve.mock.calls[0]![0][0]!.outputTokens).toBe((1000 + 8000) * 2);
  });

  it("settles an aborted run at its estimate", async () => {
    const caller = new AbortController();
    const settle = vi.fn<AiUsageHold["settle"]>(async () => {});
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) => {
        caller.abort();
        return untilAborted(abortSignal);
      },
    });
    await metered(() => runStructured({ model }, request, caller.signal, limits), reserverWith({ ok: true, hold: { settle } }));
    expect(settle).toHaveBeenCalledExactlyOnceWith([{ model: "mock-model-id", inputTokens: sent, outputTokens: 0 }]);
  });

  it("never asks the model when the reservation is refused at the cap or cannot be checked", async () => {
    for (const code of ["ai_cap_reached", "ai_cap_check_failed"] as const) {
      const model = fakeModel(JSON.stringify(validRecipe));
      const { result, seen } = await metered(() => runStructured({ model }, request, signal(), limits), reserverWith({ ok: false, code }));
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(seen).toEqual([]);
    }
  });

  it("fails closed when the reserver throws or hangs", async () => {
    const model = fakeModel(JSON.stringify(validRecipe));
    const throwing = vi.fn<AiUsageReserver>(async () => {
      throw new Error("database down");
    });
    expect((await metered(() => runStructured({ model }, request, signal(), limits), throwing)).result).toMatchObject({ ok: false, error: { code: "ai_cap_check_failed" } });
    vi.useFakeTimers();
    const hung = vi.fn<AiUsageReserver>(() => new Promise(() => {}));
    const pending = metered(() => runStructured({ model }, request, signal(), limits), hung);
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await pending).result).toMatchObject({ ok: false, error: { code: "ai_cap_check_failed" } });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("does not reserve when the model's server does not answer the health check", async () => {
    const reserve = reserverWith({ ok: true, hold: { settle: async () => {} } });
    const target = { model: fakeModel(JSON.stringify(validRecipe)), healthCheck: async () => "unreachable" as const };
    await metered(() => runStructured(target, request, signal(), limits), reserve);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("never fails the answer when the settlement fails", async () => {
    const reserve = reserverWith({ ok: true, hold: { settle: async () => Promise.reject(new Error("database down")) } });
    const { result } = await metered(() => runStructured({ model: fakeModel(JSON.stringify(validRecipe)) }, request, signal(), limits), reserve);
    expect(result).toEqual({ ok: true, data: validRecipe });
  });
});

describe("the web search (Restaurangagenten)", () => {
  const input = { place: "Uppsala", party: 2, radiusM: 2000, when: "evening" as const, wantedCuisines: [], priorities: [], household: { people: [] } };
  const serviceWith = (runner: WebSearchRunner) => createModelAiService({ model: fakeModel("{}") }, undefined, undefined, undefined, undefined, runner);

  it("counts the tokens of the earlier requests and the failed one's estimate when a later request throws (S-01)", async () => {
    const runner: WebSearchRunner = async (_request, _signal, onUsed) => {
      onUsed?.({ inputTokens: 500, outputTokens: 50, searches: 1, unanswered: true } satisfies WebSearchUsed);
      return fail("ai_unavailable");
    };
    const { result, seen } = await metered(() => serviceWith(runner).findRestaurantsWeb(input, signal()));
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(seen[0]).toMatchObject({ model: "claude-haiku-5-5", outputTokens: 50 });
    expect(seen[0]!.inputTokens).toBeGreaterThan(500);
    expect(seen[1]).toEqual({ model: "web-search", inputTokens: 1, outputTokens: 0 });
  });

  it("counts nothing for a refusal that generated nothing", async () => {
    const runner: WebSearchRunner = async (_request, _signal, onUsed) => {
      onUsed?.({ inputTokens: 0, outputTokens: 0, searches: 0, unanswered: false });
      return fail("ai_rejected");
    };
    expect((await metered(() => serviceWith(runner).findRestaurantsWeb(input, signal()))).seen).toEqual([]);
  });

  it("reserves the model's and the searches' worst case first, and settles both with what was used (S-02)", async () => {
    const settle = vi.fn<AiUsageHold["settle"]>(async () => {});
    const reserve = vi.fn<AiUsageReserver>(async () => ({ ok: true, hold: { settle } }));
    const runner: WebSearchRunner = async (_request, _signal, onUsed) => {
      onUsed?.({ inputTokens: 1000, outputTokens: 300, searches: 2, unanswered: false });
      return ok({ text: '{"suggestions":[]}', sourceUrls: [], searches: 2, inputTokens: 1000, outputTokens: 300 });
    };
    await metered(() => serviceWith(runner).findRestaurantsWeb(input, signal()), reserve);
    const [model, searches] = reserve.mock.calls[0]![0];
    expect(model).toMatchObject({ model: "claude-haiku-5-5" });
    expect(model!.inputTokens).toBeGreaterThan(2 * 15_000);
    expect(searches).toEqual({ model: "web-search", inputTokens: 2, outputTokens: 0 });
    expect(settle).toHaveBeenCalledExactlyOnceWith([
      { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 300 },
      { model: "web-search", inputTokens: 2, outputTokens: 0 },
    ]);
  });

  it("never searches when the reservation is refused", async () => {
    const runner = vi.fn<WebSearchRunner>();
    const { result } = await metered(() => serviceWith(runner).findRestaurantsWeb(input, signal()), async () => ({ ok: false, code: "ai_cap_reached" }));
    expect(result).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    expect(runner).not.toHaveBeenCalled();
  });
});
