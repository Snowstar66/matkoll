import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";

// Menyrådgivare: the Route Handler that reads a photo of a menu through the AI port, with the user check and the
// port stubbed: the request checks, that the call goes through getAiServiceForUser, that the currency symbol on the
// menu is applied to the answer, and the status for each result.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type Input = { images: { data: Uint8Array; mediaType: string }[]; quality?: string };
const readMenu = vi.fn<(input: Input, signal: AbortSignal, options?: { deadline?: number }) => Promise<Result<unknown>>>();
const getAiServiceForUser = vi.fn(async () => ({ readMenu }));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: () => getAiServiceForUser() }));
vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST } = await import("./route");

const url = "http://localhost:3100/api/menu/read";
const png = new Uint8Array(readFileSync(new URL("../../../../../tests/fixtures/ai/kyl.png", import.meta.url)));

const dish = { originalnamn: "Pulpo", grupp: "Förrätt", forklaring: "Bläckfisk.", huvudingredienser: [], kategori: "skaldjur", allergener: [], kan_innehalla: [], pris: 17.95, valuta: "SEK" };
const answer = { menu: { restaurang: null, sprak: "en", valutasymbol_pa_menyn: "€", ratter: [dish], osakert: [] }, quality: "standard", escalated: false };

function request(options: { body?: FormData | string; headers?: Record<string, string>; fields?: Record<string, string> } = {}) {
  const form = new FormData();
  form.append("image", new Blob([png as BlobPart], { type: "image/png" }), "menu.png");
  for (const [key, value] of Object.entries(options.fields ?? {})) form.append(key, value);
  return new Request(url, { method: "POST", body: options.body ?? form, headers: options.headers });
}

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ response: null });
  readMenu.mockReset().mockResolvedValue(ok(answer));
  getAiServiceForUser.mockClear();
});

describe("POST /api/menu/read", () => {
  it("reads the photo through the user's AI service and answers the menu with the symbol's currency", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: true; data: { menu: { ratter: { valuta: string }[] }; quality: string; escalated: boolean } };
    expect(body.data.menu.ratter[0]!.valuta).toBe("EUR");
    expect(body.data).toMatchObject({ quality: "standard", escalated: false });
    const [input, , options] = readMenu.mock.calls[0]!;
    expect(input.images).toHaveLength(1);
    expect(input.images[0]!.mediaType).toBe("image/png");
    expect(input.quality).toBeUndefined();
    expect(options?.deadline).toBeGreaterThan(Date.now());
  });

  it("passes quality careful on, and refuses another value", async () => {
    await POST(request({ fields: { quality: "careful" } }));
    expect(readMenu.mock.calls[0]![0].quality).toBe("careful");
    expect((await POST(request({ fields: { quality: "ultra" } }))).status).toBe(400);
    expect(readMenu).toHaveBeenCalledTimes(1);
  });

  it("answers 429 when the daily cap is reached", async () => {
    readMenu.mockResolvedValue(fail("ai_cap_reached"));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
  });

  it("answers 502 for an invalid reading and 503 when the AI is away, also when the service throws", async () => {
    readMenu.mockResolvedValue(fail("ai_invalid"));
    expect((await POST(request())).status).toBe(502);
    readMenu.mockResolvedValue(fail("ai_unavailable"));
    expect((await POST(request())).status).toBe(503);
    readMenu.mockRejectedValue(new Error("boom"));
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
    expect(readMenu).not.toHaveBeenCalled();
  });
});
