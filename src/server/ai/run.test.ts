import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLmStudioTarget } from "./adapters/lmstudio";
import { createOpenAiTarget } from "./adapters/openai";
import { runStructured, schemaFeedback, type Limits, type ModelTarget } from "./run";
import { aiRecipe } from "./schemas";
import { createModelAiService } from "./service";
import {
  abortReason,
  chatCompletion,
  connectionRefused,
  fakeModel,
  fakeServer,
  hangingModel,
  testModelId,
  untilAborted,
  validRecipe,
} from "./test-support";

// The I/O matrix of Story 1.4, against fake models and a fake LM Studio server.
// No test here reaches a real model. Budgets are proven by the abort reason
// (TimeoutError vs AbortError) and by which budget is small enough to end the
// test before Vitest's own timeout, never by measuring elapsed time.

/** Budgets so large that only the one a test lowers can end it. */
const limits: Limits = { healthMs: 30_000, attemptMs: 30_000, totalMs: 60_000, maxAttempts: 3 };
const request = {
  schema: aiRecipe,
  system: "Tolka receptet.",
  messages: [{ role: "user" as const, content: "Pannkakor: 3 dl mjölk, salt." }],
};
const valid = JSON.stringify(validRecipe);
const invalid = JSON.stringify({ ...validRecipe, servings: 0 });
const signal = () => new AbortController().signal;

function lmStudio(server: ReturnType<typeof fakeServer>, cfAccess?: { clientId: string; clientSecret: string }) {
  return createLmStudioTarget({ baseURL: "http://localhost:1234/v1/", model: testModelId, cfAccess, fetch: server.fetch });
}

let errors: ReturnType<typeof vi.spyOn>;
let infos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  infos = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("runStructured with a fake model", () => {
  it("returns the answer when it matches the schema", async () => {
    const model = fakeModel(valid);
    const result = await runStructured({ model }, request, signal(), limits);
    expect(result).toEqual({ ok: true, data: validRecipe });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("tries again after an invalid answer and returns the next valid one", async () => {
    const model = fakeModel(invalid, "inte json", valid);
    const result = await runStructured({ model }, request, signal(), limits);
    expect(result).toEqual({ ok: true, data: validRecipe });
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it("tells the model what was wrong before the next attempt, without values", async () => {
    const model = fakeModel(invalid, valid);
    await runStructured({ model }, request, signal(), limits);
    const [first, second] = model.doGenerateCalls.map((call) => call.prompt);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(3);
    expect(second.slice(0, 2)).toEqual(first);
    const followUp = second[2];
    expect(followUp.role).toBe("user");
    const text = JSON.stringify(followUp.content);
    expect(text).toContain("servings");
    expect(text).toContain("Ditt förra svar följde inte schemat");
    expect(text).not.toContain("Pannkakor");
  });

  it("asks for JSON again when the answer was not JSON at all", () => {
    expect(schemaFeedback(new Error("no issues here"))).toContain("inte giltig JSON");
  });

  it("gives ai_invalid after three invalid answers, with at most three model calls", async () => {
    const model = fakeModel(invalid);
    const result = await runStructured({ model }, request, signal(), limits);
    expect(result).toEqual({
      ok: false,
      error: { code: "ai_invalid", message: "Det gick inte att tolka svaret. Försök igen." },
    });
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(errors).toHaveBeenCalledWith("ai_invalid", { reason: "invalid" });
  });

  it("treats a vague line with an amount as invalid", async () => {
    const vagueWithAmount = {
      ...validRecipe,
      ingredients: [{ ...validRecipe.ingredients[1], amount: 1, unit: "nypa" }],
    };
    const model = fakeModel(JSON.stringify(vagueWithAmount));
    const result = await runStructured({ model }, request, signal(), limits);
    expect(result.ok).toBe(false);
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it("sends the schema, the output token limit and an abort signal to the model", async () => {
    const model = fakeModel(valid);
    await runStructured({ model }, { ...request, maxOutputTokens: 3_000 }, signal(), limits);
    const call = model.doGenerateCalls[0];
    expect(call.responseFormat).toMatchObject({ type: "json", schema: expect.objectContaining({ type: "object" }) });
    expect(call.maxOutputTokens).toBe(3_000);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("aborts an attempt that uses up the attempt budget", async () => {
    const { model, signals } = hangingModel();
    const result = await runStructured({ model }, request, signal(), { ...limits, attemptMs: 20 });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(signals).toHaveLength(1);
    expect(abortReason(signals[0])).toBe("TimeoutError");
    expect(errors).toHaveBeenCalledWith("ai_unavailable", { reason: "timeout" });
  });

  it("stops when the total budget is used up, even between invalid answers", async () => {
    // The first answer is invalid; the second attempt hangs until the total budget ends.
    const { model, signals } = hangingModel(invalid);
    const result = await runStructured({ model }, request, signal(), { ...limits, totalMs: 50 });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(abortReason(signals[0])).toBe("TimeoutError");
  });

  it("aborts the model call when the caller's signal is aborted, and logs it as info", async () => {
    const { model, signals } = hangingModel();
    const controller = new AbortController();
    const pending = runStructured({ model }, request, controller.signal, limits);
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(signals[0].aborted).toBe(true);
    expect(abortReason(signals[0])).toBe("AbortError");
    expect(infos).toHaveBeenCalledWith("ai_unavailable", { reason: "aborted" });
    expect(errors).not.toHaveBeenCalled();
  });

  it("does not call the model when the signal is already aborted", async () => {
    const model = fakeModel(valid);
    const controller = new AbortController();
    controller.abort();
    const result = await runStructured({ model }, request, controller.signal, limits);
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("LM Studio adapter against a fake server", () => {
  it("returns the answer from /chat/completions", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(valid))] });
    const result = await runStructured(lmStudio(server), request, signal(), limits);
    expect(result).toEqual({ ok: true, data: validRecipe });
    expect(server.requests.map((r) => r.url)).toEqual([
      "http://localhost:1234/v1/models",
      "http://localhost:1234/v1/chat/completions",
    ]);
  });

  it("asks for structured output with the schema and without thinking", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(valid))] });
    await runStructured(lmStudio(server), request, signal(), limits);
    const body = JSON.parse(String(server.requests[1].init?.body));
    expect(body.model).toBe(testModelId);
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(body.response_format.json_schema.schema.properties).toHaveProperty("ingredients");
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    // LM Studio only turns thinking off with reasoning_effort "none" (smoke test, Story 1.4).
    expect(body.reasoning_effort).toBe("none");
  });

  it("sends the Cloudflare Access headers when they are set", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(valid))] });
    await runStructured(lmStudio(server, { clientId: "id-1", clientSecret: "secret-1" }), request, signal(), limits);
    for (const { init } of server.requests) {
      const headers = new Headers(init?.headers);
      expect(headers.get("CF-Access-Client-Id")).toBe("id-1");
      expect(headers.get("CF-Access-Client-Secret")).toBe("secret-1");
    }
  });

  it("retries an invalid answer twice, then gives ai_invalid", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(invalid))] });
    const result = await runStructured(lmStudio(server), request, signal(), limits);
    expect(result).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
    expect(server.chatCalls()).toBe(3);
  });

  it.each([
    ["the server refuses the connection", connectionRefused(), "health"],
    ["the health check gets an HTML page", new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } }), "health"],
    ["the health check gets HTTP 502", new Response("Bad gateway", { status: 502 }), "health"],
    ["the model is not loaded", Response.json({ object: "list", data: [{ id: "other/model" }] }), "model_not_loaded"],
  ])("gives ai_unavailable without calling the model when %s", async (_name, models, reason) => {
    const server = fakeServer({ models, chat: [Response.json(chatCompletion(valid))] });
    const result = await runStructured(lmStudio(server), request, signal(), limits);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ai_unavailable", message: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" },
    });
    expect(server.chatCalls()).toBe(0);
    expect(errors).toHaveBeenCalledWith("ai_unavailable", { reason });
  });

  it("gives ai_unavailable when the health check uses up its own budget", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(valid))] });
    const seen: AbortSignal[] = [];
    const hanging: typeof fetch = (input, init) => {
      if (!String(input).endsWith("/models")) return server.fetch(input, init);
      seen.push(init!.signal!);
      return untilAborted(init?.signal ?? undefined);
    };
    const target = createLmStudioTarget({ baseURL: "http://localhost:1234/v1", model: testModelId, fetch: hanging });
    const result = await runStructured(target, request, signal(), { ...limits, healthMs: 20 });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(abortReason(seen[0])).toBe("TimeoutError");
    expect(server.chatCalls()).toBe(0);
    expect(errors).toHaveBeenCalledWith("ai_unavailable", { reason: "health" });
  });

  it("logs reason timeout when the total budget ends during the health check", async () => {
    const hanging: typeof fetch = (_input, init) => untilAborted(init?.signal ?? undefined);
    const target = createLmStudioTarget({ baseURL: "http://localhost:1234/v1", model: testModelId, fetch: hanging });
    const result = await runStructured(target, request, signal(), { ...limits, totalMs: 20 });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(errors).toHaveBeenCalledWith("ai_unavailable", { reason: "timeout" });
  });

  it.each([
    ["a network error", connectionRefused(), undefined],
    ["HTTP 500", new Response(JSON.stringify({ error: { message: "Model crashed" } }), { status: 500 }), 500],
    ["HTTP 503", new Response("Service unavailable", { status: 503 }), 503],
    [
      "an HTML error page with status 200",
      new Response("<!doctype html><title>Error</title>", { headers: { "content-type": "text/html" } }),
      200,
    ],
  ])("gives ai_unavailable at once, without new attempts, on %s", async (_name, reply, statusCode) => {
    const server = fakeServer({ chat: [reply] });
    // The attempt budget is above the SDK's first retry delay (2 s), so an SDK retry would show up.
    const result = await runStructured(lmStudio(server), request, signal(), { ...limits, attemptMs: 5_000 });
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    // One call proves that neither the port nor the SDK (maxRetries: 0) retried.
    expect(server.chatCalls()).toBe(1);
    expect(errors).toHaveBeenCalledWith(
      "ai_unavailable",
      statusCode === undefined ? { reason: "connection" } : { reason: "connection", statusCode },
    );
  }, 10_000);

  it.each([
    ["a bad key", 401],
    ["a rate limit", 429],
    ["a request that is too long", 400],
    ["an unknown model", 404],
  ])("gives ai_rejected at once on %s (HTTP 4xx), logging only code and status", async (_name, status) => {
    const server = fakeServer({
      chat: [new Response(JSON.stringify({ error: { message: "secret detail from provider" } }), { status })],
    });
    const result = await runStructured(lmStudio(server), request, signal(), { ...limits, attemptMs: 5_000 });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "ai_rejected",
        message: "AI-tjänsten tog inte emot förfrågan. Prova med en kortare text eller försök igen senare.",
      },
    });
    expect(server.chatCalls()).toBe(1);
    expect(errors).toHaveBeenCalledWith("ai_rejected", { reason: "rejected", statusCode: status });
  }, 10_000);

  it("aborts the HTTP request when the caller's signal is aborted", async () => {
    const seen: AbortSignal[] = [];
    const server = fakeServer({ chat: [Response.json(chatCompletion(valid))] });
    const hangingChat: typeof fetch = (input, init) => {
      if (!String(input).endsWith("/chat/completions")) return server.fetch(input, init);
      seen.push(init!.signal!);
      return untilAborted(init?.signal ?? undefined);
    };
    const target = createLmStudioTarget({ baseURL: "http://localhost:1234/v1", model: testModelId, fetch: hangingChat });
    const controller = new AbortController();
    const pending = runStructured(target, request, controller.signal, limits);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(seen[0].aborted).toBe(true);
    expect(abortReason(seen[0])).toBe("AbortError");
  });
});

describe("logging", () => {
  it("never logs prompts, input, answers or keys", async () => {
    const logged: unknown[] = [];
    for (const method of ["error", "warn", "log", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      });
    }
    const secretInput = "Hemligt recept med saffran";
    const secretKey = "sk-test-do-not-log";
    const answerMarker = "Svar med kardemumma";
    const input = { text: secretInput };
    const tight = { ...limits, attemptMs: 50 };

    const scenarios: ModelTarget[] = [
      lmStudio(fakeServer({ chat: [Response.json(chatCompletion(JSON.stringify({ title: answerMarker })))] })),
      lmStudio(fakeServer({ chat: [new Response(`<html>${answerMarker}</html>`)] })),
      lmStudio(fakeServer({ chat: [new Response(answerMarker, { status: 400 })] })),
      lmStudio(fakeServer({ chat: [connectionRefused()] })),
      lmStudio(fakeServer({ models: new Response(answerMarker, { status: 500 }), chat: [] })),
      createOpenAiTarget({ apiKey: secretKey, model: "gpt-test", fetch: fakeServer({ chat: [] }).fetch }),
      { model: hangingModel().model },
    ];
    for (const target of scenarios) {
      const result = await createModelAiService(target, tight).parseRecipe(input, signal());
      expect(result.ok).toBe(false);
    }

    const text = logged.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n");
    expect(logged.length).toBeGreaterThan(0);
    for (const secret of [secretInput, secretKey, answerMarker, "Du tolkar recept", "Recepttext"]) {
      expect(text).not.toContain(secret);
    }
  });
});
