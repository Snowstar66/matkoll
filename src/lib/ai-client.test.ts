import { afterEach, describe, expect, it, vi } from "vitest";
import { postAi, postAiForm, warmAi, warmAiIntervalMs, warmAiKey } from "./ai-client";
import { errorMessages, fail } from "./errors";

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

describe("postAi with a fetch error", () => {
  it("keeps the site's domain from a link import", async () => {
    mockFetch(async () =>
      json({ ok: false, error: { code: "fetch_domain_not_allowed", message: "", fields: { domain: "ica.se" } } }, 422),
    );
    const result = await postAi("/api/ai/import", { kind: "url", url: "https://www.ica.se/x" }, new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: { code: "fetch_domain_not_allowed", message: errorMessages.fetch_domain_not_allowed, fields: { domain: "ica.se" } },
    });
  });
});

describe("postAiForm", () => {
  it("posts the form data without its own content type, with the signal, and returns the data", async () => {
    const fetchMock = mockFetch(async () => json({ ok: true, data: { title: "Ugnspannkaka" } }));
    const controller = new AbortController();
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "photo.jpg");
    const result = await postAiForm("/api/ai/import/photo", form, controller.signal);

    expect(result).toEqual({ ok: true, data: { title: "Ugnspannkaka" } });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/ai/import/photo");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(form);
    // The browser sets multipart/form-data with its boundary.
    expect(new Headers(init?.headers).get("content-type")).toBeNull();
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    expect(init?.signal).toBe(controller.signal);
  });

  it("returns image_too_large with its Swedish text", async () => {
    mockFetch(async () => json({ ok: false, error: { code: "image_too_large", message: "" } }, 413));
    const result = await postAiForm("/api/ai/import/photo", new FormData(), new AbortController().signal);
    expect(result).toEqual({ ok: false, error: { code: "image_too_large", message: errorMessages.image_too_large } });
  });

  it("gives ai_unavailable for a network error and aborted for an abort", async () => {
    mockFetch(async () => Promise.reject(new TypeError("Failed to fetch")));
    expect(await postAiForm("/api/ai/import/photo", new FormData(), new AbortController().signal)).toEqual(
      fail("ai_unavailable"),
    );
    const controller = new AbortController();
    controller.abort();
    expect(await postAiForm("/api/ai/import/photo", new FormData(), controller.signal)).toEqual({
      ok: false,
      aborted: true,
    });
  });
});

describe("warmAi (Story 12.2)", () => {
  /** A sessionStorage of its own per test, as a browser tab has. */
  function stubStorage() {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    vi.stubGlobal("window", { sessionStorage: storage });
    return values;
  }

  const accepted = async () => new Response(null, { status: 202 });
  const now = Date.parse("2026-10-28T12:00:00Z");

  it("posts the kind as JSON to /api/ai/warm and remembers when, after a 202", async () => {
    const values = stubStorage();
    const fetchMock = mockFetch(accepted);
    await warmAi("image", now);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/ai/warm");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ kind: "image" }));
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(values.get(warmAiKey("image"))).toBe(String(now));
  });

  it("asks at most once per kind in three minutes, each kind on its own", async () => {
    stubStorage();
    const fetchMock = mockFetch(accepted);
    expect(warmAiIntervalMs).toBe(3 * 60_000);
    await warmAi("image", now);
    await warmAi("image", now + 60_000);
    await warmAi("image", now + warmAiIntervalMs - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await warmAi("text", now + 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await warmAi("image", now + warmAiIntervalMs);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends once while a request for the kind is on its way, and stamps only when it is answered", async () => {
    const values = stubStorage();
    let answer: (response: Response) => void = () => {};
    const fetchMock = mockFetch(() => new Promise<Response>((resolve) => (answer = resolve)));
    const first = warmAi("image", now);
    const second = warmAi("image", now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(values.has(warmAiKey("image"))).toBe(false);

    answer(new Response(null, { status: 202 }));
    await Promise.all([first, second]);
    expect(values.get(warmAiKey("image"))).toBe(String(now));
  });

  it.each([
    ["a network error", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["an answer that is not 202", async () => new Response("down", { status: 503 })],
    ["a 401", async () => new Response(null, { status: 401 })],
  ])("asks again after %s, without throwing", async (_name, reply) => {
    const values = stubStorage();
    const fetchMock = mockFetch(reply);
    await expect(warmAi("text", now)).resolves.toBeUndefined();
    expect(values.has(warmAiKey("text"))).toBe(false);
    await warmAi("text", now + 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again when the time remembered is in the future (a clock set back) or not a time", async () => {
    const values = stubStorage();
    const fetchMock = mockFetch(accepted);
    values.set(warmAiKey("text"), String(now + 60_000));
    await warmAi("text", now);
    values.set(warmAiKey("image"), "nonsense");
    await warmAi("image", now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still asks without storage", async () => {
    vi.stubGlobal("window", {
      get sessionStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    const fetchMock = mockFetch(accepted);
    await expect(warmAi("image", now)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when fetch throws before sending", async () => {
    stubStorage();
    vi.stubGlobal("fetch", () => {
      throw new TypeError("blocked");
    });
    await expect(warmAi("text", now)).resolves.toBeUndefined();
  });
});
