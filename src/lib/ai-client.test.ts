import { afterEach, describe, expect, it, vi } from "vitest";
import { postAi } from "./ai-client";
import { errorMessages } from "./errors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postAi", () => {
  it("posts the body as JSON with the signal and returns the data", async () => {
    const fetchMock = mockFetch(async () => json({ ok: true, data: { title: "Soppa" } }));
    const controller = new AbortController();
    const result = await postAi("/api/ai/import", { kind: "text", text: "x" }, controller.signal);

    expect(result).toEqual({ ok: true, data: { title: "Soppa" } });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/ai/import");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ kind: "text", text: "x" }));
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.signal).toBe(controller.signal);
  });

  it("returns the handler's error with the Swedish text for its code, whatever the status", async () => {
    mockFetch(async () => json({ ok: false, error: { code: "ai_invalid", message: "anything" } }, 502));
    const result = await postAi("/api/ai/import", {}, new AbortController().signal);
    expect(result).toEqual({ ok: false, error: { code: "ai_invalid", message: errorMessages.ai_invalid } });
  });

  it("keeps per-field messages", async () => {
    mockFetch(async () => json({ ok: false, error: { code: "validation", message: "", fields: { text: "Fyll i" } } }, 400));
    const result = await postAi("/api/ai/import", {}, new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { code: "validation", message: errorMessages.validation, fields: { text: "Fyll i" } },
    });
  });

  it("drops per-field messages that are not all text", async () => {
    mockFetch(async () => json({ ok: false, error: { code: "validation", fields: { text: 1, title: "x" } } }, 400));
    const result = await postAi("/api/ai/import", {}, new AbortController().signal);
    expect(result).toEqual({ ok: false, error: { code: "validation", message: errorMessages.validation } });
  });

  it("returns unauthorized for a 401", async () => {
    mockFetch(async () => json({ ok: false, error: { code: "unauthorized", message: "Du behöver logga in." } }, 401));
    const result = await postAi("/api/ai/import", {}, new AbortController().signal);
    expect(result.ok === false && result.error?.code).toBe("unauthorized");
  });

  it.each([
    ["a network error", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["an HTML error page", async () => new Response("<html>Bad gateway</html>", { status: 504 })],
    ["an unknown error code", async () => json({ ok: false, error: { code: "teapot" } }, 418)],
    ["an answer without the Result shape", async () => json({ title: "Soppa" })],
  ])("gives ai_unavailable for %s", async (_name, implementation) => {
    mockFetch(implementation);
    const result = await postAi("/api/ai/import", {}, new AbortController().signal);
    expect(result).toEqual({ ok: false, error: { code: "ai_unavailable", message: errorMessages.ai_unavailable } });
  });

  it("reports an abort as aborted, not as an error", async () => {
    const controller = new AbortController();
    mockFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const pending = postAi("/api/ai/import", {}, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ ok: false, aborted: true });
  });
});
