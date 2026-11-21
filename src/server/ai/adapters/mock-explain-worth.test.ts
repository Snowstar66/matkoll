import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMockAiService, defaultFixturesDir, mockSuggestErrorCodes } from "./mock";

// explainWorth without a model (Värt en titt, "Förklara närmare"): fixed Swedish sentences around the name, so the
// sheet and its states can be tried; a reserved text in the name gives its error code.

const signal = () => new AbortController().signal;

describe("mock explainWorth", () => {
  const service = createMockAiService();
  const image = { data: new Uint8Array(readFileSync(join(defaultFixturesDir, "forrad.png"))), mediaType: "image/png" };
  const input = { image, name: "Kristallskål", tip: "Liknar Orrefors.", confidence: "guess" as const };

  it("answers fixed Swedish sentences around the name, with a guess said to be one and no price", async () => {
    const result = await service.explainWorth(input, signal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.darfor).toContain("Kristallskål");
    expect(result.data.kan_vara).toContain("gissning");
    expect(result.data.undersok.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(result.data)).not.toMatch(/\bkr\b|kronor/);
  });

  it.each(mockSuggestErrorCodes)("gives %s for a name that holds its reserved text", async (code) => {
    expect(await service.explainWorth({ ...input, name: `Skål matkoll-mock: ${code}` }, signal())).toMatchObject({ ok: false, error: { code } });
  });
});
