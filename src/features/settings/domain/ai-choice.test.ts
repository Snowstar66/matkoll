import { describe, expect, it } from "vitest";
import {
  aiSettingSchema,
  aiSettingsVisible,
  claudeModels,
  costPerCallText,
  costSummaryText,
  estimateCostSek,
  formatSek,
} from "./ai-choice";

const [haiku, sonnet, opus] = claudeModels;

describe("cost estimate", () => {
  it("prices a call from typical tokens and the price table", () => {
    // Import: 10k in, 3k out. Haiku: 0.001 + 0.0015 USD = 0.025 kr.
    expect(estimateCostSek(haiku, "import")).toBeCloseTo(0.025);
    expect(estimateCostSek(sonnet, "import")).toBeCloseTo(0.5);
    expect(estimateCostSek(opus, "import")).toBeCloseTo(1);
    expect(estimateCostSek(haiku, "photo")).toBeCloseTo(0.014);
    expect(estimateCostSek(sonnet, "suggestion")).toBeCloseTo(0.42);
  });

  it("writes it as 'ca ... kr per ...' with a decimal comma", () => {
    expect(costPerCallText(haiku, "import")).toBe("ca 0,03 kr per import");
    expect(costPerCallText(sonnet, "import")).toBe("ca 0,50 kr per import");
    expect(costPerCallText(opus, "import")).toBe("ca 1 kr per import");
    expect(formatSek(12.34)).toBe("ca 12,3 kr");
    expect(costSummaryText(haiku)).toBe("ca 0,03 kr per import · ca 0,01 kr per foto · ca 0,02 kr per förslag");
  });
});

describe("aiSettingsVisible", () => {
  it("is always on in development", () => {
    expect(aiSettingsVisible({ nodeEnv: "development", email: null, allowed: undefined })).toBe(true);
  });

  it("outside development only shows for the addresses in the list, whatever the case", () => {
    const allowed = ["pontus@example.com"];
    expect(aiSettingsVisible({ nodeEnv: "production", email: " Pontus@Example.com", allowed })).toBe(true);
    expect(aiSettingsVisible({ nodeEnv: "production", email: "other@example.com", allowed })).toBe(false);
    expect(aiSettingsVisible({ nodeEnv: "production", email: "pontus@example.com", allowed: undefined })).toBe(false);
    expect(aiSettingsVisible({ nodeEnv: "production", email: null, allowed })).toBe(false);
    expect(aiSettingsVisible({ nodeEnv: undefined, email: "pontus@example.com", allowed })).toBe(true);
  });
});

describe("aiSettingSchema", () => {
  it("takes the three listed Claude models and levels, and nothing else", () => {
    expect(aiSettingSchema.safeParse({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" }).success).toBe(true);
    expect(aiSettingSchema.safeParse({ provider: "anthropic", model: "claude-opus-4", effort: "high" }).success).toBe(false);
    expect(aiSettingSchema.safeParse({ provider: "anthropic", model: "claude-opus-5-5", effort: "max" }).success).toBe(false);
    expect(aiSettingSchema.safeParse({ provider: "lmstudio" }).success).toBe(true);
    expect(aiSettingSchema.safeParse({ provider: "openai" }).success).toBe(false);
  });
});
