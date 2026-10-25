import { describe, expect, it } from "vitest";
import { errorMessages, fail } from "@/lib/errors";
import {
  importErrorMessage,
  importRequestSchema,
  maxImportTextChars,
  maxImportUrlChars,
  isUnreadablePhoto,
  offersPasteTextInstead,
} from "./import";

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

  it.each(["ai_invalid", "import_no_recipe"] as const)("says the photo could not be read for %s", (code) => {
    expect(importErrorMessage(fail(code).error, "photo")).toBe(
      "Det gick inte att tolka bilden. Ta en ny bild, välj en annan eller klistra in texten.",
    );
  });

  it("talks about the image, not text, when a photo is not taken", () => {
    expect(importErrorMessage(fail("ai_rejected").error, "photo")).toBe(
      "AI-tjänsten tog inte emot bilden. Prova en tydligare bild eller försök igen senare.",
    );
    expect(importErrorMessage(fail("ai_rejected").error, "text")).toBe(errorMessages.ai_rejected);
  });

  it("gives the photo errors their own text", () => {
    expect(importErrorMessage(fail("image_unsupported").error, "photo")).toBe(
      "Bildformatet stöds inte. Välj en JPEG-, PNG- eller WebP-bild.",
    );
    expect(importErrorMessage(fail("image_too_large").error, "photo")).toBe(errorMessages.image_too_large);
    expect(importErrorMessage(fail("ai_unavailable").error, "photo")).toBe(errorMessages.ai_unavailable);
  });

  it("keeps other messages as they are", () => {
    expect(importErrorMessage({ code: "ai_unavailable", message: errorMessages.ai_unavailable })).toBe(
      "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
    );
  });
});

describe("offersPasteTextInstead", () => {
  it.each([
    ["url", "fetch_blocked", true],
    ["url", "import_no_recipe", true],
    ["url", "ai_unavailable", false],
    ["photo", "import_no_recipe", true],
    ["photo", "ai_invalid", true],
    ["photo", "ai_rejected", false],
    ["photo", "ai_unavailable", false],
    ["photo", "image_unsupported", false],
    ["text", "import_no_recipe", false],
    ["text", "ai_invalid", false],
  ] as const)("for a %s import with %s: %s", (kind, code, expected) => {
    expect(offersPasteTextInstead(code, kind)).toBe(expected);
  });
});

describe("isUnreadablePhoto", () => {
  it("is true only for a photo with ai_invalid or import_no_recipe", () => {
    expect(isUnreadablePhoto("ai_invalid", "photo")).toBe(true);
    expect(isUnreadablePhoto("import_no_recipe", "photo")).toBe(true);
    expect(isUnreadablePhoto("ai_unavailable", "photo")).toBe(false);
    expect(isUnreadablePhoto("ai_invalid", "text")).toBe(false);
    expect(isUnreadablePhoto("import_no_recipe", "url")).toBe(false);
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
