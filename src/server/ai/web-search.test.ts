import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createAnthropicWebSearch, parseJsonAnswer } = await import("./web-search");
const { findRestaurantsWebAnswer } = await import("./schemas");

const request = { model: "claude-haiku-5-5", effort: "low" as const, system: "s", user: "Plats: Uppsala", city: "Uppsala", maxSearches: 2, maxOutputTokens: 6000, timeoutMs: 5000 };
const signal = () => new AbortController().signal;
const message = (content: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 } }, ...extra }), { status: 200, headers: { "content-type": "application/json" } });
const searchBlocks = [
  { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "restaurang Uppsala" } },
  { type: "web_search_tool_result", tool_use_id: "srv_1", content: [{ type: "web_search_result", url: "https://a.example/meny", title: "A", encrypted_content: "x", page_age: null }] },
];

describe("createAnthropicWebSearch", () => {
  it("sends the web_search tool with max_uses, a user_location from the typed city and the effort, and collects the returned urls, text, searches and tokens", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => message([...searchBlocks, { type: "text", text: '{"suggestions":[]}', citations: null }]));
    const run = createAnthropicWebSearch({ apiKey: "k", fetch: fetchMock as never });
    const result = await run(request, signal());
    expect(result).toEqual({ ok: true, data: { text: '{"suggestions":[]}', sourceUrls: ["https://a.example/meny"], searches: 2, inputTokens: 1000, outputTokens: 200 } });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 2, user_location: { type: "approximate", country: "SE", city: "Uppsala" } }]);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.temperature).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/\blat\b|longitude|coords/);
  });
  it("leaves the city out for a postcode", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => message([{ type: "text", text: "{}", citations: null }]));
    await createAnthropicWebSearch({ apiKey: "k", fetch: fetchMock as never })({ ...request, city: null }, signal());
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).tools[0].user_location).toEqual({ type: "approximate", country: "SE" });
  });
  it("resumes a paused turn and adds up searches and tokens", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => (fetchMock.mock.calls.length === 1 ? message(searchBlocks, { stop_reason: "pause_turn", usage: { input_tokens: 500, output_tokens: 50, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } }) : message([{ type: "text", text: "{}", citations: null }], { usage: { input_tokens: 700, output_tokens: 80, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } })));
    const result = await createAnthropicWebSearch({ apiKey: "k", fetch: fetchMock as never })(request, signal());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, data: { searches: 2, inputTokens: 1200, outputTokens: 130, sourceUrls: ["https://a.example/meny"] } });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)).messages.at(-1).role).toBe("assistant");
  });
  it("reports the earlier requests' tokens and searches when a later request fails (S-01)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = (status: number) => {
      const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
        fetchMock.mock.calls.length === 1
          ? message(searchBlocks, { stop_reason: "pause_turn", usage: { input_tokens: 500, output_tokens: 50, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } })
          : new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "x" } }), { status, headers: { "content-type": "application/json" } }),
      );
      return fetchMock;
    };
    const used = vi.fn();
    expect(await createAnthropicWebSearch({ apiKey: "k", fetch: failing(529) as never })(request, signal(), used)).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(used).toHaveBeenCalledExactlyOnceWith({ inputTokens: 500, outputTokens: 50, searches: 1, unanswered: true });
    // A 4xx is a refusal: nothing more was generated.
    const refused = vi.fn();
    expect(await createAnthropicWebSearch({ apiKey: "k", fetch: failing(400) as never })(request, signal(), refused)).toMatchObject({ ok: false, error: { code: "ai_rejected" } });
    expect(refused).toHaveBeenCalledExactlyOnceWith({ inputTokens: 500, outputTokens: 50, searches: 1, unanswered: false });
    // An abort reports what came before it too.
    const controller = new AbortController();
    const aborting = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (aborting.mock.calls.length === 1) return message(searchBlocks, { stop_reason: "pause_turn" });
      controller.abort();
      throw init?.signal?.reason ?? new Error("aborted");
    });
    const abortedUse = vi.fn();
    expect(await createAnthropicWebSearch({ apiKey: "k", fetch: aborting as never })(request, controller.signal, abortedUse)).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(abortedUse).toHaveBeenCalledExactlyOnceWith({ inputTokens: 1000, outputTokens: 200, searches: 2, unanswered: true });
    log.mockRestore();
  });
  it("reports what a successful run used", async () => {
    const used = vi.fn();
    await createAnthropicWebSearch({ apiKey: "k", fetch: (async () => message([{ type: "text", text: "{}", citations: null }])) as never })(request, signal(), used);
    expect(used).toHaveBeenCalledExactlyOnceWith({ inputTokens: 1000, outputTokens: 200, searches: 2, unanswered: false });
  });
  it("maps a 4xx to ai_rejected and a 5xx to ai_unavailable, logging only the status", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = (code: number) => createAnthropicWebSearch({ apiKey: "k", fetch: (async () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Plats: Uppsala secret" } }), { status: code, headers: { "content-type": "application/json" } })) as never })(request, signal());
    expect(await status(400)).toMatchObject({ ok: false, error: { code: "ai_rejected" } });
    expect(await status(529)).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Uppsala");
    log.mockRestore();
  });
});

describe("parseJsonAnswer", () => {
  it("finds the JSON object in text with a word around it and checks the shape", () => {
    const text = 'Här är svaret: {"suggestions":[{"name":"A","why":[{"text":"x","sourceUrl":"https://a.example/"}]}]} Klart.';
    expect(parseJsonAnswer(text, findRestaurantsWebAnswer)?.suggestions[0]?.name).toBe("A");
    expect(parseJsonAnswer("inget json", findRestaurantsWebAnswer)).toBeNull();
    expect(parseJsonAnswer('{"suggestions":"nej"}', findRestaurantsWebAnswer)).toBeNull();
    expect(parseJsonAnswer("{ trasigt", findRestaurantsWebAnswer)).toBeNull();
  });
});
