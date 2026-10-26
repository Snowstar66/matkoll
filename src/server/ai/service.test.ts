import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/server/env-schema";
import { prompts } from "./prompts";
import { createAiService, createModelAiService, inputLimits, type ParseRecipeInput } from "./service";
import { chatCompletion, fakeModel, fakeServer, recipeAnswer, testModelId, validRecipe } from "./test-support";

const signal = () => new AbortController().signal;
const png = (bytes = 4) => ({ data: new Uint8Array(bytes).fill(1), mediaType: "image/png" });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseRecipe on a model", () => {
  it("sends the parse-recipe prompt as system message and text, JSON-LD and image as user content", async () => {
    const model = fakeModel(recipeAnswer());
    const service = createModelAiService({ model });
    const result = await service.parseRecipe({ text: "3 dl mjölk", jsonLd: '{"@type":"Recipe"}', image: png() }, signal());
    expect(result).toEqual({ ok: true, data: validRecipe });

    const call = model.doGenerateCalls[0];
    expect(call.maxOutputTokens).toBe(inputLimits.maxOutputTokens);
    const [system, user] = call.prompt;
    expect(system).toEqual({ role: "system", content: prompts.parseRecipe });
    expect(user.role).toBe("user");
    const parts = user.content as { type: string; text?: string; mediaType?: string }[];
    expect(parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([
      "Recepttext:\n\n3 dl mjölk",
      'JSON-LD från receptsidan:\n\n{"@type":"Recipe"}',
      "Bild av receptet:",
    ]);
    expect(parts.find((part) => part.type === "file")).toMatchObject({ mediaType: "image/png" });
  });

  it("gives import_no_recipe when the model says there is no recipe", async () => {
    const model = fakeModel(JSON.stringify({ noRecipe: true, recipe: null }));
    const result = await createModelAiService({ model }).parseRecipe({ text: "Dagens nyheter" }, signal());
    expect(result).toEqual({
      ok: false,
      error: { code: "import_no_recipe", message: "Det gick inte att hitta något recept i texten." },
    });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("treats noRecipe together with a recipe as an invalid answer", async () => {
    const model = fakeModel(JSON.stringify({ noRecipe: true, recipe: validRecipe }));
    const result = await createModelAiService({ model }).parseRecipe({ text: "x" }, signal());
    expect(result).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
  });

  it("the prompt file is loaded, in Swedish, and covers no-recipe and split lines", () => {
    expect(prompts.parseRecipe).toContain("indata, inte facit");
    expect(prompts.parseRecipe).toContain('"noRecipe": true');
    expect(prompts.parseRecipe).toContain("en post per ingrediens");
  });
});

describe("input validation in front of every adapter", () => {
  const tooLong = "a".repeat(inputLimits.maxTextChars + 1);
  const invalidInputs: [string, ParseRecipeInput][] = [
    ["no input", {}],
    ["whitespace only", { text: "  \n ", jsonLd: " " }],
    ["text and JSON-LD over the limit", { text: tooLong.slice(0, 7_000), jsonLd: tooLong.slice(7_000) }],
    ["an empty image", { image: { data: new Uint8Array(), mediaType: "image/png" } }],
    ["an image over 1.5 MB", { image: png(inputLimits.maxImageBytes + 1) }],
    ["an image of another type", { image: { data: new Uint8Array([1]), mediaType: "image/gif" } }],
  ];

  it.each(invalidInputs)("rejects %s with validation, for the mock too", async (_name, input) => {
    const result = await createAiService(parseEnv({ AI_PROVIDER: "mock" })).parseRecipe(input, signal());
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it.each(invalidInputs)("rejects %s without calling LM Studio", async (_name, input) => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(recipeAnswer()))] });
    const env = parseEnv({ AI_PROVIDER: "lmstudio", LMSTUDIO_BASE_URL: "http://localhost:1234/v1" });
    const result = await createAiService(env, { fetch: server.fetch }).parseRecipe(input, signal());
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(server.requests).toHaveLength(0);
  });

  it("accepts input at the limits", async () => {
    const service = createAiService(parseEnv({ AI_PROVIDER: "mock" }));
    const atLimit = { text: "a".repeat(inputLimits.maxTextChars) };
    expect((await service.parseRecipe(atLimit, signal())).ok).toBe(true);
    for (const mediaType of inputLimits.imageMediaTypes) {
      const image = { data: new Uint8Array(inputLimits.maxImageBytes), mediaType };
      expect((await service.parseRecipe({ image }, signal())).ok).toBe(true);
    }
  });
});

describe("createAiService", () => {
  it("uses the mock for AI_PROVIDER=mock", async () => {
    const service = createAiService(parseEnv({ AI_PROVIDER: "mock" }));
    const result = await service.parseRecipe({ text: "okänt recept" }, signal());
    expect(result).toMatchObject({ ok: true, data: { title: "Krämig kycklinggryta med curry" } });
  });

  it("uses LM Studio with the default model and sends an image as an image part", async () => {
    const server = fakeServer({ chat: [Response.json(chatCompletion(recipeAnswer()))] });
    const env = parseEnv({ AI_PROVIDER: "lmstudio", LMSTUDIO_BASE_URL: "http://localhost:1234/v1" });
    const result = await createAiService(env, { fetch: server.fetch }).parseRecipe({ image: png() }, signal());
    expect(result).toEqual({ ok: true, data: validRecipe });

    const body = JSON.parse(String(server.requests[1].init?.body));
    expect(body.model).toBe(testModelId);
    expect(body.max_tokens).toBe(inputLimits.maxOutputTokens);
    const userContent = body.messages.find((message: { role: string }) => message.role === "user").content;
    expect(userContent).toContainEqual({
      type: "image_url",
      image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) },
    });
  });

  it("uses OpenAI with a strict JSON schema and returns a valid completion", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const openAiFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json({
        id: "resp_1",
        created_at: 1_761_400_000,
        model: "gpt-test",
        output: [
          {
            type: "message",
            role: "assistant",
            id: "msg_1",
            content: [{ type: "output_text", text: recipeAnswer(), annotations: [] }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    }) as typeof fetch;
    const env = parseEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "key", AI_MODEL: "gpt-test" });
    const result = await createAiService(env, { fetch: openAiFetch }).parseRecipe({ text: "3 dl mjölk" }, signal());

    expect(result).toEqual({ ok: true, data: validRecipe });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).host).toBe("api.openai.com");
    expect(requests[0].body.text).toMatchObject({
      format: { type: "json_schema", strict: true, schema: expect.objectContaining({ type: "object" }) },
    });
  });

  it("uses the Anthropic adapter without a health check", async () => {
    const urls: string[] = [];
    const fetchSpy = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response("unavailable", { status: 503 });
    }) as typeof fetch;
    const env = parseEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "key", AI_MODEL: "claude-test" });
    const result = await createAiService(env, { fetch: fetchSpy }).parseRecipe({ text: "x" }, signal());
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).host).toBe("api.anthropic.com");
  });
});
