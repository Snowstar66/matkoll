import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";

// Fota en lista: the Route Handler that reads a photo of a shopping list through the AI port, with the user check and
// the port stubbed: the request checks, that the call goes through getAiServiceForUser (the gate and the usage are
// its), and the status for each result.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type Input = { image: { data: Uint8Array; mediaType: string } };
const readShoppingList = vi.fn<(input: Input, signal: AbortSignal, options?: { deadline?: number }) => Promise<Result<unknown>>>();
const getAiServiceForUser = vi.fn(async () => ({ readShoppingList }));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: () => getAiServiceForUser() }));
vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST } = await import("./route");

const url = "http://localhost:3100/api/shopping/read-list";
const png = new Uint8Array(readFileSync(new URL("../../../../../tests/fixtures/ai/kyl.png", import.meta.url)));

function request(options: { body?: FormData | string; headers?: Record<string, string> } = {}) {
  const form = new FormData();
  form.append("image", new Blob([png as BlobPart], { type: "image/png" }), "list.png");
  return new Request(url, { method: "POST", body: options.body ?? form, headers: options.headers });
}

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ response: null });
  readShoppingList.mockReset().mockResolvedValue(ok({ items: [{ name: "Mjölk", amount: 2, unit: "l" }] }));
  getAiServiceForUser.mockClear();
});

describe("POST /api/shopping/read-list", () => {
  it("reads the photo through the user's AI service and answers its items", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { items: [{ name: "Mjölk", amount: 2, unit: "l" }] } });
    expect(getAiServiceForUser).toHaveBeenCalledTimes(1);
    const [input, , options] = readShoppingList.mock.calls[0]!;
    expect(input.image.mediaType).toBe("image/png");
    expect(input.image.data.byteLength).toBe(png.byteLength);
    expect(options?.deadline).toBeGreaterThan(Date.now());
  });

  it("answers 429 with the cap's code when the daily cap is reached", async () => {
    readShoppingList.mockResolvedValue(fail("ai_cap_reached"));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
  });

  it("answers 503 when the AI is away, also when the service throws", async () => {
    readShoppingList.mockResolvedValue(fail("ai_unavailable"));
    expect((await POST(request())).status).toBe(503);
    readShoppingList.mockRejectedValue(new Error("boom"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
  });

  it("refuses another site, a missing user, a body that is not a form and a form without a photo, without asking the AI", async () => {
    expect((await POST(request({ headers: { origin: "https://evil.example" } }))).status).toBe(403);
    requireUserForRoute.mockResolvedValueOnce({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ body: "{}", headers: { "content-type": "application/json" } }))).status).toBe(415);
    expect((await POST(request({ body: new FormData() }))).status).toBe(400);
    expect(readShoppingList).not.toHaveBeenCalled();
  });
});
