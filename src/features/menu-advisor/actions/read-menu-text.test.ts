import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

// readMenuText with a fake AI port: no call leaves the test.

const state = vi.hoisted(() => ({ signedIn: true }));
const readMenu = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", async () => {
  const { fail, ok } = await import("@/lib/errors");
  return { requireUser: async () => (state.signedIn ? ok({ id: "u" }) : fail("unauthorized")) };
});
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: async () => ({ readMenu }) }));

import { readMenuText } from "./read-menu-text";

const answer = { restaurang: "Krogen", sprak: "sv", valutasymbol_pa_menyn: "kr", ratter: [{ originalnamn: "Biff", grupp: "Varmrätt", forklaring: "Biff med sås.", huvudingredienser: [], kategori: "kott", allergener: [], kan_innehalla: [], pris: 245, valuta: "SEK" }], osakert: [] };

beforeEach(() => {
  state.signedIn = true;
  readMenu.mockReset().mockResolvedValue(ok({ menu: answer, quality: "standard", escalated: false }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readMenuText", () => {
  it("needs a signed-in user", async () => {
    state.signedIn = false;
    expect(await readMenuText({ text: "Biff 245 kr" })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(readMenu).not.toHaveBeenCalled();
  });

  it("refuses an empty text, or one that is only markup, before any call", async () => {
    expect(await readMenuText({ text: "   " })).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await readMenuText({ text: "<div></div>" })).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(readMenu).not.toHaveBeenCalled();
  });

  it("sends the cleaned, capped text with no images and answers the same reading as a photo", async () => {
    const result = await readMenuText({ text: `<p>Biff 245 kr</p>${"x".repeat(20_000)}` });
    const input = readMenu.mock.calls[0]![0];
    expect(input.images).toEqual([]);
    expect(input.text.startsWith("Biff 245 kr")).toBe(true);
    expect(input.text.length).toBeLessThanOrEqual(12_000);
    expect(input.text).not.toContain("<p>");
    expect(result).toMatchObject({ ok: true, data: { quality: "standard", escalated: false, model: "Haiku 5.5", effort: "låg", menu: { restaurang: "Krogen", ratter: [{ originalnamn: "Biff", valuta: "SEK" }] } } });
  });

  it("passes a careful request on and names Sonnet", async () => {
    readMenu.mockResolvedValue(ok({ menu: answer, quality: "careful", escalated: false }));
    const result = await readMenuText({ text: "Biff 245 kr", quality: "careful" });
    expect(readMenu.mock.calls[0]![0].quality).toBe("careful");
    expect(result).toMatchObject({ ok: true, data: { model: "Sonnet 5.5", effort: "medel" } });
  });

  it("answers the port's failures as they are, and ai_unavailable when it throws", async () => {
    readMenu.mockResolvedValue(fail("ai_cap_reached"));
    expect(await readMenuText({ text: "Biff" })).toMatchObject({ ok: false, error: { code: "ai_cap_reached" } });
    readMenu.mockRejectedValue(new Error("boom"));
    expect(await readMenuText({ text: "Biff" })).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
  });
});
