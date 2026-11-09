import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";

// Menyrådgivare: the Route Handler that reads a photo of a menu through the AI port, with the user check and the
// port stubbed: the request checks, that the call goes through getAiServiceForUser, that the currency symbol on the
// menu is applied to the answer, and the status for each result.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

type Input = { images: { data: Uint8Array; mediaType: string }[]; quality?: string };
const readMenu = vi.fn<(input: Input, signal: AbortSignal, options?: { deadline?: number; onMenu?: (progress: unknown) => void }) => Promise<Result<unknown>>>();
const getAiServiceForUser = vi.fn(async () => ({ readMenu }));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: () => getAiServiceForUser() }));
vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST } = await import("./route");
const { menuModels } = await import("@/server/ai/service");
const { menuReaderOf } = await import("@/features/menu-advisor");

const url = "http://localhost:3100/api/menu/read";
const png = new Uint8Array(readFileSync(new URL("../../../../../tests/fixtures/ai/kyl.png", import.meta.url)));

const dish = { originalnamn: "Pulpo", grupp: "Förrätt", forklaring: "Bläckfisk.", huvudingredienser: [], kategori: "skaldjur", allergener: [], kan_innehalla: [], pris: 17.95, valuta: "SEK" };
const answer = { menu: { restaurang: null, sprak: "en", valutasymbol_pa_menyn: "€", ratter: [dish], osakert: [] }, quality: "standard", escalated: false };

function request(options: { body?: FormData | string; headers?: Record<string, string>; fields?: Record<string, string>; stream?: boolean } = {}) {
  const form = new FormData();
  form.append("image", new Blob([png as BlobPart], { type: "image/png" }), "menu.png");
  for (const [key, value] of Object.entries(options.fields ?? {})) form.append(key, value);
  return new Request(options.stream ? `${url}?stream=1` : url, { method: "POST", body: options.body ?? form, headers: options.headers });
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
    expect(body.data).toMatchObject({ quality: "standard", escalated: false, model: "Haiku 5.5", effort: "låg" });
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

async function lines(response: Response): Promise<{ type: string; [key: string]: unknown }[]> {
  return (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

describe("POST /api/menu/read?stream=1", () => {
  it("sends the reading, the language, each dish as it comes and the finished menu, one JSON per line", async () => {
    const second = { ...dish, originalnamn: "Gambas", pris: 12 };
    readMenu.mockImplementation(async (_input, _signal, options) => {
      options?.onMenu?.({ stage: "reading", quality: "standard", escalated: false });
      options?.onMenu?.({ stage: "language", sprak: "es", symbol: "€" });
      options?.onMenu?.({ stage: "dishes", dishes: [dish], sprak: "es", symbol: "€" });
      options?.onMenu?.({ stage: "dishes", dishes: [dish, second], sprak: "es", symbol: "€" });
      return ok({ menu: { ...answer.menu, ratter: [dish, second] }, quality: "standard", escalated: false });
    });
    const response = await POST(request({ stream: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await lines(response);
    expect(events.map((event) => event.type)).toEqual(["reading", "language", "dish", "dish", "done"]);
    expect(events[0]).toMatchObject({ quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" });
    expect(events[1]).toMatchObject({ sprak: "es" });
    expect(events[2]).toMatchObject({ index: 0, dish: { originalnamn: "Pulpo", valuta: "EUR" } });
    expect(events[3]).toMatchObject({ index: 1, dish: { originalnamn: "Gambas", valuta: "EUR" } });
    expect(events[4]).toMatchObject({ quality: "standard", escalated: false, model: "Haiku 5.5", effort: "låg", menu: { ratter: [{ valuta: "EUR" }, { valuta: "EUR" }] } });
    expect(readMenu.mock.calls[0]![2]?.deadline).toBeGreaterThan(Date.now());
  });

  it("starts over with restart when the reading is redone as careful, and names Sonnet", async () => {
    readMenu.mockImplementation(async (_input, _signal, options) => {
      options?.onMenu?.({ stage: "reading", quality: "standard", escalated: false });
      options?.onMenu?.({ stage: "reading", quality: "careful", escalated: true });
      options?.onMenu?.({ stage: "dishes", dishes: [dish], sprak: "es", symbol: "€" });
      return ok({ menu: answer.menu, quality: "careful", escalated: true });
    });
    const events = await lines(await POST(request({ stream: true })));
    expect(events.map((event) => event.type)).toEqual(["reading", "reading", "dish", "done"]);
    expect(events[1]).toMatchObject({ restart: true, model: "Sonnet 5.5", effort: "medel" });
    expect(events[2]).toMatchObject({ index: 0 });
    expect(events[3]).toMatchObject({ escalated: true, model: "Sonnet 5.5" });
  });

  it("is a plain JSON answer with its status when the reading fails before anything is sent (the cap, an invalid reading)", async () => {
    readMenu.mockResolvedValue(fail("ai_cap_reached"));
    const capped = await POST(request({ stream: true }));
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    readMenu.mockRejectedValue(new Error("boom"));
    expect((await POST(request({ stream: true }))).status).toBe(503);
  });

  it("ends with an error line when the reading fails after it has started", async () => {
    readMenu.mockImplementation(async (_input, _signal, options) => {
      options?.onMenu?.({ stage: "reading", quality: "standard", escalated: false });
      return fail("ai_invalid");
    });
    const response = await POST(request({ stream: true }));
    expect(response.status).toBe(200);
    expect(await lines(response)).toEqual([expect.objectContaining({ type: "reading" }), { type: "error", code: "ai_invalid" }]);
  });

  it("makes the same checks as the plain route, without asking the AI", async () => {
    expect((await POST(request({ stream: true, headers: { origin: "https://evil.example" } }))).status).toBe(403);
    requireUserForRoute.mockResolvedValueOnce({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    expect((await POST(request({ stream: true }))).status).toBe(401);
    expect((await POST(request({ stream: true, fields: { quality: "ultra" } }))).status).toBe(400);
    expect(readMenu).not.toHaveBeenCalled();
  });
});

describe("who read the menu", () => {
  it("names the models the server uses", () => {
    expect(menuModels.standard).toMatchObject({ model: "claude-haiku-5-5", effort: "low" });
    expect(menuModels.careful).toMatchObject({ model: "claude-sonnet-5-5", effort: "medium" });
    expect(menuReaderOf("standard")).toEqual({ model: "Haiku 5.5", effort: "låg" });
    expect(menuReaderOf("careful")).toEqual({ model: "Sonnet 5.5", effort: "medel" });
  });
});
