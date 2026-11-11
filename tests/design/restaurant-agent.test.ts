import { describe, expect, it } from "vitest";
import { tasteGroups } from "@/features/menu-advisor/domain/tastes";
import { claudeModels, sekPerUsd } from "@/features/settings";
import { cuisineTasteKeys, costSek, sekPerUsd as agentSekPerUsd, noUsage } from "@/features/restaurant-agent";

// The restaurant agent duplicates a few facts so that features stay apart (AD-1); this keeps the copies true.
describe("restaurant-agent copies", () => {
  it("uses the app's exchange rate and price table", () => {
    expect(agentSekPerUsd).toBe(sekPerUsd);
    const haiku = claudeModels.find((model) => model.id === "claude-haiku-5-5");
    const sonnet = claudeModels.find((model) => model.id === "claude-sonnet-5-5");
    expect(haiku && sonnet).toBeTruthy();
    if (!haiku) return;
    const usage = { ...noUsage, tokensIn: 6_000, tokensOut: 3_000 };
    expect(costSek(haiku, usage)).toBeCloseTo(((6_000 * haiku.usdPerMTokIn + 3_000 * haiku.usdPerMTokOut) / 1_000_000) * sekPerUsd);
  });

  it("only names taste keys that exist in the food profile", () => {
    const keys = new Set(tasteGroups.flatMap((group) => group.items.map((item) => item.key)));
    for (const list of Object.values(cuisineTasteKeys)) for (const key of list) expect(keys.has(key), key).toBe(true);
  });
});
