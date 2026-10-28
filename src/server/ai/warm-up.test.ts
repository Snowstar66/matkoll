import { inflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageSizeOf, imageTypeOf } from "@/lib/images";
import { parseEnv } from "@/server/env-schema";
import { prompts } from "./prompts";
import { runWarmUp, warmUpLimits } from "./run";
import { createAiService, createModelAiService, type WarmUpKind } from "./service";
import {
  abortReason,
  chatCompletion,
  connectionRefused,
  fakeModel,
  fakeServer,
  hangingModel,
  testModelId,
  type FakeServer,
} from "./test-support";
import { warmImage, warmImageSide } from "./warm-image";

// Story 12.2: warmUp per adapter. LM Studio gets one call with the flow's own
// system prompt, a minimal message and a single token, without a schema and
// without new attempts; every other adapter does nothing.

const signal = () => new AbortController().signal;
const lmStudioEnv = parseEnv({ AI_PROVIDER: "lmstudio", LMSTUDIO_BASE_URL: "http://localhost:1234/v1" });
const lmStudio = (server: FakeServer) => createAiService(lmStudioEnv, { fetch: server.fetch });

type ChatBody = {
  model: string;
  max_tokens: number;
  messages: { role: string; content: unknown }[];
  [key: string]: unknown;
};

function chatBody(server: FakeServer): ChatBody {
  const chat = server.requests.filter((request) => request.url.endsWith("/chat/completions"));
  expect(chat).toHaveLength(1);
  return JSON.parse(String(chat[0].init?.body)) as ChatBody;
}

let infos: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  infos = vi.spyOn(console, "info").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("warmUp against LM Studio", () => {
  it("wakes the reading of a photo: health check, then the analyze-image prompt, a grey image and one token", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion("{"))] });
    expect(await lmStudio(server).warmUp("image", signal())).toBe("ok");

    expect(server.requests[0].url).toBe("http://localhost:1234/v1/models");
    const body = chatBody(server);
    expect(body.model).toBe(testModelId);
    expect(body.max_tokens).toBe(1);
    expect(body.messages[0]).toEqual({ role: "system", content: prompts.analyzeImage });
    const user = body.messages.find((message) => message.role === "user");
    expect(user?.content).toEqual([
      { type: "text", text: "Bilden visar kylen." },
      { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(warmImage.data).toString("base64")}` } },
    ]);
    // The same settings as a real reading (Story 6.5), with thinking off, and no schema.
    expect(body).toMatchObject({ temperature: 0, top_p: 0.8, top_k: 20, presence_penalty: 1.5, reasoning_effort: "none" });
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body).not.toHaveProperty("response_format");
  });

  it("wakes the text flows with the suggest-dishes prompt and a pantry of salt", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion("{"))] });
    expect(await lmStudio(server).warmUp("text", signal())).toBe("ok");

    const body = chatBody(server);
    expect(body.max_tokens).toBe(1);
    expect(body.messages).toEqual([
      { role: "system", content: prompts.suggestDishes },
      { role: "user", content: "Lagret:\nsalt: finns" },
    ]);
    expect(body).toMatchObject({ reasoning_effort: "none" });
    // AI-förslag keep LM Studio's sampling, so the warm-up does too.
    for (const key of ["temperature", "top_p", "top_k", "presence_penalty"]) expect(body).not.toHaveProperty(key);
    expect(body).not.toHaveProperty("response_format");
  });

  it.each<[string, () => Response]>([
    ["HTTP 500", () => new Response("boom", { status: 500 })],
    ["HTTP 400", () => Response.json({ error: { message: "too long" } }, { status: 400 })],
  ])("never tries again after %s, and is unavailable", async (_name, reply) => {
    const server = fakeServer({ chat: [reply()] });
    expect(await lmStudio(server).warmUp("text", signal())).toBe("unavailable");
    expect(server.chatCalls()).toBe(1);
  });

  it("is unavailable after a lost connection, with one call", async () => {
    const server = fakeServer({ chat: [connectionRefused()] });
    expect(await lmStudio(server).warmUp("image", signal())).toBe("unavailable");
    expect(server.chatCalls()).toBe(1);
  });

  it.each<[string, Response | Error]>([
    ["LM Studio is off", connectionRefused()],
    ["the server answers with an error", new Response("down", { status: 503 })],
    ["the model is not loaded", Response.json({ object: "list", data: [{ id: "another-model" }] })],
  ])("never calls the model when %s", async (_name, models) => {
    const server = fakeServer({ models, chat: [Response.json(chatCompletion("{"))] });
    expect(await lmStudio(server).warmUp("image", signal())).toBe("unavailable");
    expect(server.chatCalls()).toBe(0);
  });

  it("logs nothing itself: the route logs the outcome", async () => {
    await lmStudio(fakeServer({ chat: [connectionRefused()] })).warmUp("text", signal());
    expect(infos).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it("is skipped for a kind that is not image or text", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion("{"))] });
    expect(await lmStudio(server).warmUp("video" as WarmUpKind, signal())).toBe("skipped");
    expect(server.requests).toHaveLength(0);
  });
});

describe("warmUp on other providers", () => {
  it("does nothing on the mock", async () => {
    expect(await createAiService(parseEnv({ AI_PROVIDER: "mock" })).warmUp("image", signal())).toBe("skipped");
  });

  it.each([
    ["anthropic", { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "key", AI_MODEL: "claude-test" }],
    ["openai", { AI_PROVIDER: "openai", OPENAI_API_KEY: "key", AI_MODEL: "gpt-test" }],
  ])("never calls %s, which costs money and is never cold", async (_name, values) => {
    const fetchSpy = vi.fn(async () => new Response("unexpected", { status: 500 }));
    const service = createAiService(parseEnv(values), { fetch: fetchSpy as unknown as typeof fetch });
    expect(await service.warmUp("image", signal())).toBe("skipped");
    expect(await service.warmUp("text", signal())).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing on a model target that does not warm up", async () => {
    const model = fakeModel("{");
    expect(await createModelAiService({ model }).warmUp("text", signal())).toBe("skipped");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("runWarmUp", () => {
  const request = { system: "system", messages: [{ role: "user" as const, content: "Lagret:\nsalt: finns" }] };

  it("has at most 30 s in total, with the usual 5 s health check", () => {
    expect(warmUpLimits).toEqual({ healthMs: 5_000, totalMs: 30_000 });
  });

  it("asks the model once, for one token and without retries", async () => {
    const model = fakeModel("{");
    expect(await runWarmUp({ model, warmsUp: true }, request, signal())).toBe("ok");
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]).toMatchObject({ maxOutputTokens: 1 });
    // No schema: the answer is plain text.
    expect(model.doGenerateCalls[0].responseFormat?.type ?? "text").toBe("text");
  });

  it("stops the call when the total budget is used up", async () => {
    const { model, signals } = hangingModel();
    const result = await runWarmUp({ model }, request, signal(), { healthMs: 10, totalMs: 30 });
    expect(result).toBe("unavailable");
    expect(signals).toHaveLength(1);
    expect(abortReason(signals[0])).toBe("TimeoutError");
  });

  it("stops the health check after its own budget", async () => {
    const model = fakeModel("{");
    const healthCheck = vi.fn(
      (healthSignal: AbortSignal) =>
        new Promise<"ok">((_, reject) => healthSignal.addEventListener("abort", () => reject(healthSignal.reason))),
    );
    expect(await runWarmUp({ model, healthCheck }, request, signal(), { healthMs: 20, totalMs: 1_000 })).toBe("unavailable");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("does nothing when the signal is already aborted", async () => {
    const model = fakeModel("{");
    const controller = new AbortController();
    controller.abort();
    expect(await runWarmUp({ model }, request, controller.signal)).toBe("unavailable");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("warmImage", () => {
  it("is a grey PNG of 64 × 64 px, built in the code", () => {
    expect(warmImage.mediaType).toBe("image/png");
    expect(imageTypeOf(warmImage.data)).toBe("image/png");
    expect(imageSizeOf(warmImage.data)).toEqual({ width: warmImageSide, height: warmImageSide });
    expect(warmImageSide).toBe(64);
  });

  it("decodes to rows of grey RGB pixels", () => {
    const bytes = Buffer.from(warmImage.data);
    // The IDAT chunk follows the 8-byte signature and the 25-byte IHDR chunk.
    const idatLength = bytes.readUInt32BE(33);
    expect(bytes.toString("ascii", 37, 41)).toBe("IDAT");
    const pixels = inflateSync(bytes.subarray(41, 41 + idatLength));
    expect(pixels).toHaveLength(warmImageSide * (1 + warmImageSide * 3));
    const row = pixels.subarray(0, 1 + warmImageSide * 3);
    expect(row[0]).toBe(0);
    expect([...row.subarray(1)].every((value) => value === 128)).toBe(true);
    expect(bytes.toString("ascii", bytes.length - 8, bytes.length - 4)).toBe("IEND");
  });
});
