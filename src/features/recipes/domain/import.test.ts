import { describe, expect, it } from "vitest";
import { errorMessages } from "@/lib/errors";
import { importErrorMessage, importRequestSchema, maxImportTextChars } from "./import";

describe("importErrorMessage", () => {
  it("suggests pasting the text after an invalid AI answer (EXPERIENCE.md)", () => {
    expect(importErrorMessage({ code: "ai_invalid", message: errorMessages.ai_invalid })).toBe(
      "Det gick inte att tolka svaret. Försök igen eller klistra in texten.",
    );
  });

  it("keeps other messages as they are", () => {
    expect(importErrorMessage({ code: "ai_unavailable", message: errorMessages.ai_unavailable })).toBe(
      "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?",
    );
  });
});

describe("importRequestSchema", () => {
  it("takes text, trimmed", () => {
    expect(importRequestSchema.parse({ kind: "text", text: "  Soppa  " })).toEqual({ kind: "text", text: "Soppa" });
  });

  it.each([
    ["empty text", { kind: "text", text: "   " }],
    ["too long text", { kind: "text", text: "a".repeat(maxImportTextChars + 1) }],
    ["another kind", { kind: "url", url: "https://koket.se/x" }],
    ["no body", null],
  ])("rejects %s", (_name, body) => {
    expect(importRequestSchema.safeParse(body).success).toBe(false);
  });
});
