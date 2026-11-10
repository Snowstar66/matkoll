import { describe, expect, it } from "vitest";
import { input, library } from "./fixtures";
import { planDeterministic } from "./plan";
import { weekProposalSchema } from "./proposal";

describe("weekProposalSchema", () => {
  it("accepts what the planner makes (round trip through json) and refuses anything else", () => {
    const result = planDeterministic(input(library()));
    if (result.status !== "ok") throw new Error("ok expected");
    const stored = JSON.parse(JSON.stringify(result.proposal));
    expect(weekProposalSchema.parse(stored)).toEqual(result.proposal);
    expect(weekProposalSchema.safeParse({ ...stored, days: stored.days.slice(1) }).success).toBe(false);
    expect(weekProposalSchema.safeParse({ ...stored, weekStart: "måndag" }).success).toBe(false);
    expect(weekProposalSchema.safeParse({}).success).toBe(false);
    stored.days[0].slot = "lunch";
    expect(weekProposalSchema.safeParse(stored).success).toBe(false);
  });
});
