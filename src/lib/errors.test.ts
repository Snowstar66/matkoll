import { describe, expect, it } from "vitest";
import { errorMessages, fail, isErrorCode } from "./errors";

describe("the offers' error codes (Story 9.1, AD-13, AD-25)", () => {
  it.each([
    ["offers_link_missing", "Lägg in länken till butikens erbjudanden under Butik i Inställningar."],
    ["offers_link_unsupported", "Matkoll kan bara hämta erbjudanden från ica.se än så länge."],
    ["offers_fetched_recently", "Erbjudandena hämtades nyss. Försök igen om en stund."],
    ["offers_fetch_blocked", "ica.se släppte inte in Matkoll just nu. Öppna sidan och titta där, eller försök igen senare."],
    ["offers_fetch_failed", "Det gick inte att hämta erbjudandena. Försök igen senare."],
    ["offers_page_changed", "Sidan med erbjudanden ser inte ut som Matkoll väntar sig. Öppna sidan och titta där."],
    ["offers_page_old", "Sidan visar inte den här eller nästa veckas erbjudanden."],
    ["offers_none", "Hittade inga erbjudanden på mat."],
    ["offers_store_missing", "Välj en butik i inställningarna först."],
    ["offers_week_invalid", "Veckan är slut. Välj en annan vecka och spara igen."],
    ["offers_limit", "Du kan ha högst 300 erbjudanden per vecka. Ta bort några först."],
    ["offers_failed", "Det gick inte att spara erbjudandena. Försök igen."],
    ["offers_unavailable", "Det gick inte att läsa erbjudandena."],
  ] as const)("%s says %j", (code, text) => {
    expect(isErrorCode(code)).toBe(true);
    expect(errorMessages[code]).toBe(text);
    expect(fail(code)).toEqual({ ok: false, error: { code, message: text } });
  });

  it("never says cheap, bargain or save, and never shows a status code", () => {
    const offerTexts = Object.entries(errorMessages)
      .filter(([code]) => code.startsWith("offers_"))
      .map(([, text]) => text);
    for (const text of offerTexts) {
      expect(text).not.toMatch(/billig|fynd|\bspara pengar\b|\b4\d\d\b|\b5\d\d\b/i);
    }
  });
});
