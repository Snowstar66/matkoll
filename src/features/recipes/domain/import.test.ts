import { describe, expect, it } from "vitest";
import { errorMessages, fail } from "@/lib/errors";
import { importErrorMessage, importRequestSchema, maxImportTextChars, maxImportUrlChars } from "./import";

describe("importErrorMessage", () => {
  it("suggests pasting the text after an invalid AI answer (EXPERIENCE.md)", () => {
    expect(importErrorMessage({ code: "ai_invalid", message: errorMessages.ai_invalid })).toBe(
      "Det gick inte att tolka svaret. Försök igen eller klistra in texten.",
    );
  });

  it.each([
    ["fetch_domain_not_allowed", "ica.se är inte en godkänd receptsajt."],
    ["fetch_blocked", "ica.se släppte inte in oss."],
    ["fetch_timeout", "ica.se svarade inte i tid."],
  ] as const)("names the site for %s", (code, message) => {
    expect(importErrorMessage(fail(code, { domain: "ica.se" }).error, "url")).toBe(message);
  });

  it("falls back to the general text without a domain", () => {
    expect(importErrorMessage(fail("fetch_blocked").error, "url")).toBe(errorMessages.fetch_blocked);
  });

  it("says the page had no recipe for a link, and the text for pasted text", () => {
    expect(importErrorMessage(fail("import_no_recipe").error, "url")).toBe("Det gick inte att hitta något recept på sidan.");
    expect(importErrorMessage(fail("import_no_recipe").error, "text")).toBe(errorMessages.import_no_recipe);
  });

  it("keeps other messages as they are", () => {
    expect(importErrorMessage({ code: "ai_unavailable", message: errorMessages.ai_unavailable })).toBe(
      "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
    );
  });
});

describe("importRequestSchema", () => {
  it("takes a link, trimmed; whether it is usable is the fetch port's answer", () => {
    expect(importRequestSchema.parse({ kind: "url", url: " https://www.koket.se/x " })).toEqual({
      kind: "url",
      url: "https://www.koket.se/x",
    });
    expect(importRequestSchema.parse({ kind: "url", url: "kladdkaka" })).toEqual({ kind: "url", url: "kladdkaka" });
  });

  it("takes text, trimmed", () => {
    expect(importRequestSchema.parse({ kind: "text", text: "  Soppa  " })).toEqual({ kind: "text", text: "Soppa" });
  });

  it.each([
    ["empty text", { kind: "text", text: "   " }],
    ["too long text", { kind: "text", text: "a".repeat(maxImportTextChars + 1) }],
    ["an empty link", { kind: "url", url: "   " }],
    ["a too long link", { kind: "url", url: `https://koket.se/${"a".repeat(maxImportUrlChars)}` }],
    ["another kind", { kind: "photo" }],
    ["no body", null],
  ])("rejects %s", (_name, body) => {
    expect(importRequestSchema.safeParse(body).success).toBe(false);
  });
});
