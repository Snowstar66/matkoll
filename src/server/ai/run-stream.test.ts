import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLmStudioTarget } from "./adapters/lmstudio";
import { runElementStream, type ElementStreamRequest, type Limits } from "./run";
import { compactDish, type CompactDish } from "./schemas";
import { createModelAiService } from "./service";
import { chatStream, elementPieces, fakeServer, testModelId, validCompactDish } from "./test-support";

// Story 12.7: runElementStream and suggestDishesStream against a fake LM Studio
// that streams its answer (server-sent events). No test reaches a real model.

const limits: Limits = { healthMs: 30_000, attemptMs: 30_000, totalMs: 60_000, maxAttempts: 3, minRetryMs: 0 };
const dish = (title: string, extra: Partial<CompactDish> = {}): CompactDish => ({ ...validCompactDish, title, ...extra });
const badDish = (title: string) => ({ ...validCompactDish, title, servings: 0 });
const signal = () => new AbortController().signal;

function target(server: ReturnType<typeof fakeServer>) {
  return createLmStudioTarget({ baseURL: "http://localhost:1234/v1/", model: testModelId, fetch: server.fetch });
}

const baseRequest = {
  element: compactDish,
  maxItems: 3,
  system: "Föreslå rätter.",
  messages: [{ role: "user" as const, content: "Lagret: mjölk" }],
  skippedFeedback: "Svara igen med nya rätter.",
};

function request(onElement: ElementStreamRequest<CompactDish>["onElement"]): ElementStreamRequest<CompactDish> {
  return { ...baseRequest, onElement };
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The messages of the nth chat request, as text. */
function sentMessages(server: ReturnType<typeof fakeServer>, n: number): string {
  const chats = server.requests.filter((r) => r.url.endsWith("/chat/completions"));
  return String(chats[n].init?.body);
}

describe("runElementStream", () => {
  it("gives each dish as soon as it has come, before the answer is complete", async () => {
    let firstSeen!: () => void;
    const seen = new Promise<void>((resolve) => (firstSeen = resolve));
    const pieces = elementPieces(dish("A"), dish("B"), dish("C"));
    const open = pieces[0];
    const close = pieces[pieces.length - 1];
    const server = fakeServer({
      chat: [
        () =>
          chatStream([
            open,
            // A dish is given once the next one has begun: its closing is then certain.
            JSON.stringify(dish("A")) + ",{",
            // The rest of the answer waits for the first dish to have been given.
            () => seen,
            JSON.stringify(dish("B")).slice(1) + ",",
            JSON.stringify(dish("C")),
            close,
          ]),
      ],
    });
    const titles: string[] = [];
    const result = await runElementStream(
      target(server),
      request((element) => {
        titles.push(element.title);
        if (titles.length === 1) firstSeen();
        return true;
      }),
      signal(),
      limits,
    );
    expect(result).toEqual({ ok: true, data: 3 });
    expect(titles).toEqual(["A", "B", "C"]);
    // The prompt is not logged anywhere.
    expect(errors).not.toHaveBeenCalled();
  });

  it("stops after the third dish when the model goes on", async () => {
    const server = fakeServer({ chat: [() => chatStream(elementPieces(dish("A"), dish("B"), dish("C"), dish("D"), dish("E")))] });
    const titles: string[] = [];
    const result = await runElementStream(
      target(server),
      request((element) => (titles.push(element.title), true)),
      signal(),
      limits,
    );
    expect(result).toEqual({ ok: true, data: 3 });
    expect(titles).toEqual(["A", "B", "C"]);
    expect(server.chatCalls()).toBe(1);
  });

  it("skips a dish that does not match the schema and keeps the others", async () => {
    const server = fakeServer({ chat: [() => chatStream(elementPieces(dish("A"), badDish("B"), dish("C")))] });
    const titles: string[] = [];
    const result = await runElementStream(
      target(server),
      request((element) => (titles.push(element.title), true)),
      signal(),
      limits,
    );
    expect(result).toEqual({ ok: true, data: 2 });
    expect(titles).toEqual(["A", "C"]);
  });

  it("makes a new attempt, told what was wrong, when no dish matches the schema", async () => {
    const server = fakeServer({
      chat: [
        () => chatStream(elementPieces(badDish("A"), badDish("B"), badDish("C"))),
        () => chatStream(elementPieces(dish("A"), dish("B"), dish("C"))),
      ],
    });
    const result = await runElementStream(target(server), request(() => true), signal(), limits);
    expect(result).toEqual({ ok: true, data: 3 });
    expect(server.chatCalls()).toBe(2);
    expect(sentMessages(server, 1)).toContain("Ditt förra svar följde inte schemat");
  });

  it("makes a new attempt when the caller keeps none of the dishes", async () => {
    const server = fakeServer({
      chat: [() => chatStream(elementPieces(dish("A"))), () => chatStream(elementPieces(dish("B")))],
    });
    const result = await runElementStream(target(server), request((element) => element.title === "B"), signal(), limits);
    expect(result).toEqual({ ok: true, data: 1 });
    expect(sentMessages(server, 1)).toContain("Svara igen med nya rätter.");
  });

  it("does not make a new attempt when at least one dish is kept", async () => {
    const server = fakeServer({ chat: [() => chatStream(elementPieces(dish("A"), badDish("B"), badDish("C")))] });
    const result = await runElementStream(target(server), request(() => true), signal(), limits);
    expect(result).toEqual({ ok: true, data: 1 });
    expect(server.chatCalls()).toBe(1);
  });

  it("is ai_invalid after three attempts without a dish", async () => {
    const server = fakeServer({ chat: [() => chatStream(elementPieces(badDish("A")))] });
    const result = await runElementStream(target(server), request(() => true), signal(), limits);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_invalid" }) });
    expect(server.chatCalls()).toBe(3);
  });

  it("is ai_unavailable when Avbryt is pressed after the first dish", async () => {
    const controller = new AbortController();
    const server = fakeServer({ chat: [() => chatStream(elementPieces(dish("A"), dish("B"), dish("C")))] });
    const titles: string[] = [];
    const result = await runElementStream(
      target(server),
      request((element) => {
        titles.push(element.title);
        controller.abort();
        return true;
      }),
      controller.signal,
      limits,
    );
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_unavailable" }) });
    expect(titles).toEqual(["A"]);
  });

  it("is done with the dishes that came when the time runs out", async () => {
    const server = fakeServer({
      chat: [() => chatStream(['{"elements":[', JSON.stringify(dish("A")) + ",{", () => new Promise<void>(() => {})])],
    });
    const result = await runElementStream(target(server), request(() => true), signal(), { ...limits, attemptMs: 200 });
    expect(result).toEqual({ ok: true, data: 1 });
  });

  it("is ai_unavailable when the time runs out before the first dish", async () => {
    const server = fakeServer({ chat: [() => chatStream(['{"elements":[', () => new Promise<void>(() => {})])] });
    const result = await runElementStream(target(server), request(() => true), signal(), { ...limits, attemptMs: 200 });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_unavailable" }) });
  });

  it("is ai_unavailable at once when the model is not loaded, and ai_rejected for an HTTP 4xx", async () => {
    const notLoaded = fakeServer({
      models: Response.json({ object: "list", data: [{ id: "other", object: "model" }] }),
      chat: [() => chatStream(elementPieces(dish("A")))],
    });
    const first = await runElementStream(target(notLoaded), request(() => true), signal(), limits);
    expect(first).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_unavailable" }) });
    expect(notLoaded.chatCalls()).toBe(0);

    const refused = fakeServer({ chat: [new Response("{}", { status: 400 })] });
    const second = await runElementStream(target(refused), request(() => true), signal(), limits);
    expect(second).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_rejected" }) });

    const broken = fakeServer({ chat: [new Response("oops", { status: 500 })] });
    const third = await runElementStream(target(broken), request(() => true), signal(), limits);
    expect(third).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_unavailable" }) });
    expect(broken.chatCalls()).toBe(1);
  });
});

describe("suggestDishesStream", () => {
  const input = { pantry: [{ name: "mjölk", amount: 1, unit: "l" }], avoidTitles: ["Pannkakor"] };

  it("skips a title to avoid and a title that came before, and logs the index", async () => {
    const server = fakeServer({
      chat: [() => chatStream(elementPieces(dish("Pannkakor"), dish("Gröt"), dish("gröt")))],
    });
    const service = createModelAiService(target(server), limits);
    const titles: string[] = [];
    const result = await service.suggestDishesStream(input, signal(), {
      onDish: (recipe, index) => (titles.push(`${index}:${recipe.title}`), true),
    });
    expect(result).toEqual({ ok: true, data: 1 });
    expect(titles).toEqual(["1:Gröt"]);
    expect(errors).toHaveBeenCalledWith("ai_invalid", { reason: "title", index: 0 });
    expect(errors).toHaveBeenCalledWith("ai_invalid", { reason: "title", index: 2 });
  });

  it("gives the dishes as AiRecipe and asks for an array in the prompt", async () => {
    const server = fakeServer({ chat: [() => chatStream(elementPieces(dish("Gröt")))] });
    const service = createModelAiService(target(server), limits);
    const recipes: string[] = [];
    await service.suggestDishesStream(input, signal(), {
      onDish: (recipe) => (recipes.push(`${recipe.title}:${recipe.ingredients[0].originalText}`), true),
    });
    expect(recipes).toEqual(["Gröt:3 dl mjölk"]);
    expect(sentMessages(server, 0)).toContain('{ \\"elements\\": [');
  });

  it("is ai_unavailable when the deadline leaves too little time", async () => {
    const server = fakeServer({ chat: [() => chatStream(elementPieces(dish("Gröt")))] });
    const service = createModelAiService(target(server), limits);
    const result = await service.suggestDishesStream(input, signal(), { deadline: Date.now() + 1_000, onDish: () => true });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "ai_unavailable" }) });
    expect(server.chatCalls()).toBe(0);
  });
});
