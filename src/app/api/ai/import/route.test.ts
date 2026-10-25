import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";

// The Route Handler with the user check and importRecipe stubbed: request
// checks, the status for each result, and the request's signal reaching the model.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type ImportInput = { kind: "text"; text: string } | { kind: "url"; url: string };
const importRecipe = vi.fn<(input: ImportInput, options: { signal: AbortSignal }) => Promise<Result<unknown>>>();
vi.mock("@/features/recipes/server", () => ({
  importRecipe: (input: ImportInput, options: { signal: AbortSignal }) => importRecipe(input, options),
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
    expect(input).toEqual({ kind: "text", text: "Soppa" });
    expect(options.signal).toBe(request.signal);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });

  it("passes a link, trimmed, to importRecipe", async () => {
    const response = await POST(post({ body: JSON.stringify({ kind: "url", url: " https://www.koket.se/x " }) }));
    expect(response.status).toBe(200);
    expect(importRecipe.mock.calls[0][0]).toEqual({ kind: "url", url: "https://www.koket.se/x" });
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
    ["an empty link", JSON.stringify({ kind: "url", url: "  " })],
    ["a link over 2 048 characters", JSON.stringify({ kind: "url", url: `https://www.koket.se/${"a".repeat(2_048)}` })],
    ["an unknown kind", JSON.stringify({ kind: "photo" })],
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
    ["settings_unavailable", 503],
    ["fetch_invalid_url", 422],
    ["fetch_domain_not_allowed", 422],
    ["fetch_blocked", 502],
    ["fetch_too_large", 502],
    ["fetch_timeout", 504],
  ] as const)("answers %s with %i", async (code, status) => {
    importRecipe.mockResolvedValue(fail(code));
    const response = await POST(post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fail(code));
  });

  it("sends the domain of a site that is not approved", async () => {
    importRecipe.mockResolvedValue(fail("fetch_domain_not_allowed", { domain: "ica.se" }));
    const response = await POST(post({ body: JSON.stringify({ kind: "url", url: "https://www.ica.se/recept/x" }) }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(fail("fetch_domain_not_allowed", { domain: "ica.se" }));
  });
});
