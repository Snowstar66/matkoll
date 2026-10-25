import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";

// The Route Handler with the user check and importRecipe stubbed: request
// checks, the status for each result, and the request's signal reaching the model.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const importRecipe = vi.fn<(input: { text: string }, options: { signal: AbortSignal }) => Promise<Result<unknown>>>();
vi.mock("@/features/recipes/server", () => ({
  importRecipe: (input: { text: string }, options: { signal: AbortSignal }) => importRecipe(input, options),
}));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST } = await import("./route");

const url = "http://localhost:3100/api/ai/import";
const body = JSON.stringify({ kind: "text", text: "Soppa" });

function post(init: { body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  return new Request(url, {
    method: "POST",
    body: init.body ?? body,
    headers: { "content-type": "application/json", ...init.headers },
    signal: init.signal,
  });
}

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  importRecipe.mockReset().mockResolvedValue(ok({ draft: {}, ingredientNames: {} }));
});

describe("POST /api/ai/import", () => {
  it("passes the trimmed text and the request's signal to importRecipe", async () => {
    const controller = new AbortController();
    const request = post({ body: JSON.stringify({ kind: "text", text: "  Soppa " }), signal: controller.signal });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { draft: {}, ingredientNames: {} } });
    const [input, options] = importRecipe.mock.calls[0];
    expect(input).toEqual({ text: "Soppa" });
    expect(options.signal).toBe(request.signal);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });

  it("answers the 401 from requireUserForRoute without importing", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await POST(post());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(fail("unauthorized"));
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a same-site fetch from another subdomain", { "sec-fetch-site": "same-site" }],
  ])("refuses %s with 403", async (_name, headers) => {
    const response = await POST(post({ headers }));
    expect(response.status).toBe(403);
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("accepts the app's own origin", async () => {
    const response = await POST(post({ headers: { origin: "http://localhost:3100", "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(200);
  });

  it("refuses a body that is not JSON by content type with 415", async () => {
    const response = await POST(post({ headers: { "content-type": "text/plain" } }));
    expect(response.status).toBe(415);
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it("refuses a body over 64 kB with 413", async () => {
    const big = JSON.stringify({ kind: "text", text: "a".repeat(64 * 1024) });
    const response = await POST(post({ body: big }));
    expect(response.status).toBe(413);
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["text that is not JSON", "{"],
    ["an invalid request", JSON.stringify({ kind: "text", text: " " })],
  ])("answers validation with 400 for %s", async (_name, raw) => {
    const response = await POST(post({ body: raw }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: "validation", message: errorMessages.validation } });
    expect(importRecipe).not.toHaveBeenCalled();
  });

  it.each([
    ["import_no_recipe", 422],
    ["ai_invalid", 502],
    ["ai_rejected", 502],
    ["ai_unavailable", 503],
    ["catalog_unavailable", 503],
  ] as const)("answers %s with %i", async (code, status) => {
    importRecipe.mockResolvedValue(fail(code));
    const response = await POST(post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fail(code));
  });
});
