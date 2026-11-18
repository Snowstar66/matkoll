import { describe, expect, it } from "vitest";
import { quickMaxMinutes as categoryMinutes } from "@/features/recipes/domain/recipe-category";
import { quickMinutes } from "@/features/week-agent/domain/shortlist";
import { quickMaxMinutes } from "@/lib/quick-dish";

// "Snabbt" means the same everywhere: Recept's category, the chip in Matsedel and Veckoagentens "Snabbt på vardagar".
describe("quick dishes", () => {
  it("have one limit", () => {
    expect(categoryMinutes).toBe(quickMaxMinutes);
    expect(quickMinutes).toBe(quickMaxMinutes);
  });
});
