// Helpers for the AI port's tests: a fake model (MockLanguageModelV4) and a
// fake LM Studio server behind a fetch function. Never imported by the app.
import { MockLanguageModelV4 } from "ai/test";
import type { AiRecipe, CompactDish } from "./schemas";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

export const validRecipe: AiRecipe = {
  title: "Pannkakor",
  servings: 4,
  totalMinutes: 30,
  ingredients: [
    {
      originalText: "3 dl mjölk",
      amount: 3,
      unit: "dl",
      isVague: false,
      hint: { name: "mjölk", section: "Mejeri", location: "Kyl", defaultUnit: "dl" },
      stepIndexes: [0],
    },
    {
      originalText: "salt",
      amount: null,
      unit: null,
      isVague: true,
      hint: { name: "salt", section: "Skafferi", location: "Skafferi", defaultUnit: "krm" },
      stepIndexes: [],
    },
  ],
  steps: ["Vispa ihop smeten.", "Stek pannkakorna."],
};

/**
 * Story 12.3: a dish as the model answers suggestDishes (compactDish): mjölk
 * from the pantry (no `new`) and salt, outside it, with its catalog entry.
 */
export const validCompactDish: CompactDish = {
  title: "Pannkakor",
  servings: 4,
  totalMinutes: 30,
  ingredients: [
    { text: "3 dl mjölk", amount: 3, unit: "dl", name: "mjölk", stepIndexes: [0], new: null },
    {
      text: "salt",
      amount: null,
      unit: null,
      name: "salt",
      stepIndexes: [],
      new: { section: "Skafferi", location: "Skafferi", defaultUnit: "krm" },
    },
  ],
  steps: ["Vispa ihop smeten.", "Stek pannkakorna."],
};

/** validCompactDish as the port returns it (fromCompactDish). */
export const validCompactDishRecipe: AiRecipe = {
  ...validRecipe,
  ingredients: [
    { ...validRecipe.ingredients[0], hint: { name: "mjölk", section: "Övrigt", location: "Skafferi", defaultUnit: "dl" } },
    validRecipe.ingredients[1],
  ],
};

/** The model's JSON for parseRecipe: the recipe wrapped as the answer schema says. */
export function recipeAnswer(recipe: unknown = validRecipe): string {
  return JSON.stringify({ noRecipe: false, recipe });
}

export const testModelId = "qwen/qwen3.6-35b-a3b";

export function textAnswer(text: string): GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: 20, reasoning: undefined },
    },
    warnings: [],
  };
}

/** A model that answers with the given texts in order (the last one repeats). */
export function fakeModel(...answers: string[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => textAnswer(answers[Math.min(call++, answers.length - 1)]),
  });
}

/** Resolves never; rejects with the signal's reason when it is aborted. */
export function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return reject(new Error("no abort signal"));
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/** A model that answers `answers` in order and then only finishes when its call is aborted. */
export function hangingModel(...answers: string[]) {
  const signals: AbortSignal[] = [];
  let call = 0;
  const model = new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) => {
      if (call < answers.length) return Promise.resolve(textAnswer(answers[call++]));
      if (abortSignal) signals.push(abortSignal);
      return untilAborted(abortSignal);
    },
  });
  return { model, signals };
}

/** Name of an AbortSignal's reason: "TimeoutError" for a budget, "AbortError" for the caller. */
export const abortReason = (signal: AbortSignal) => (signal.reason as { name?: string } | undefined)?.name;

export function chatCompletion(content: string) {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1_761_400_000,
    model: testModelId,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

type Reply = Response | (() => Response) | Error;

export type FakeServer = {
  fetch: typeof fetch;
  requests: { url: string; init?: RequestInit }[];
  chatCalls: () => number;
};

/**
 * A fake OpenAI-compatible server. `models` answers GET /models (the health
 * check), `chat` answers POST /chat/completions (the last reply repeats).
 */
export function fakeServer({ models, chat }: { models?: Reply; chat: Reply[] }): FakeServer {
  const requests: FakeServer["requests"] = [];
  let chatIndex = 0;
  const reply = (value: Reply) => {
    if (value instanceof Error) throw value;
    return typeof value === "function" ? value() : value.clone();
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, init });
    if (url.endsWith("/models")) {
      return reply(models ?? Response.json({ object: "list", data: [{ id: testModelId, object: "model" }] }));
    }
    if (url.endsWith("/chat/completions")) return reply(chat[Math.min(chatIndex++, chat.length - 1)]);
    return new Response("not found", { status: 404 });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    requests,
    chatCalls: () => requests.filter((request) => request.url.endsWith("/chat/completions")).length,
  };
}

export function connectionRefused(): Error {
  const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1234"), { code: "ECONNREFUSED" });
  return new TypeError("fetch failed", { cause });
}

/**
 * A streamed chat completion (server-sent events) with `pieces` of text, one
 * event each. A piece may be a function: it runs when the stream gets to it
 * (and may wait), so a test can see what happened before the rest came.
 */
export function chatStream(pieces: (string | (() => Promise<void> | void))[], finishReason = "stop"): Response {
  const encoder = new TextEncoder();
  const event = (delta: object, finish: string | null) =>
    encoder.encode(
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1_761_400_000,
        model: testModelId,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`,
    );
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(event({ role: "assistant", content: "" }, null));
      for (const piece of pieces) {
        if (typeof piece === "function") await piece();
        else controller.enqueue(event({ content: piece }, null));
      }
      controller.enqueue(event({}, finishReason));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

/** The pieces of a streamed answer `{"elements":[…]}`: the opening, each dish with its comma, and the closing. */
export function elementPieces(...dishes: unknown[]): string[] {
  return ['{"elements":[', ...dishes.map((dish, i) => JSON.stringify(dish) + (i < dishes.length - 1 ? "," : "")), "]}"];
}
