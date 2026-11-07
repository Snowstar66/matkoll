import { describe, expect, it } from "vitest";
import {
  aiCapReached,
  capFieldText,
  capStatusFromRows,
  formatSek,
  type HouseholdUsageRow,
  householdCostsFromRows,
  parseCapInput,
} from "./ai-cap";
import { claudeModels, sekPerUsd } from "./ai-choice";

const haiku = claudeModels[0]!;
/** Tokens that cost exactly `usd` dollars of input on the first model in the price table. */
const tokensFor = (usd: number) => Math.round((usd / haiku.usdPerMTokIn) * 1_000_000);

describe("capStatusFromRows", () => {
  it("is null without rows (no household)", () => {
    expect(capStatusFromRows([])).toBeNull();
  });

  it("prices today's tokens per model with the price table; a local model and a row without a model cost nothing", () => {
    const status = capStatusFromRows([
      { cap_sek: 10, exempt: false, model: haiku.id, input_tokens: tokensFor(0.5), output_tokens: 0 },
      { cap_sek: 10, exempt: false, model: "qwen/local", input_tokens: 9_000_000, output_tokens: 9_000_000 },
    ]);
    expect(status?.capSek).toBe(10);
    expect(status?.exempt).toBe(false);
    expect(status?.spentSek).toBeCloseTo(0.5 * sekPerUsd, 5);
    expect(capStatusFromRows([{ cap_sek: 10, exempt: false, model: null, input_tokens: 0, output_tokens: 0 }])?.spentSek).toBe(0);
  });
});

describe("aiCapReached", () => {
  it("is reached at the cap, not before", () => {
    expect(aiCapReached({ capSek: 10, exempt: false, spentSek: 9.99 })).toBe(false);
    expect(aiCapReached({ capSek: 10, exempt: false, spentSek: 10 })).toBe(true);
    expect(aiCapReached({ capSek: 10, exempt: false, spentSek: 25 })).toBe(true);
  });

  it("never stops an exempt household", () => {
    expect(aiCapReached({ capSek: 10, exempt: true, spentSek: 500 })).toBe(false);
    expect(aiCapReached({ capSek: 0, exempt: true, spentSek: 0 })).toBe(false);
  });

  it("a cap of 0 is reached at once: no AI for the others", () => {
    expect(aiCapReached({ capSek: 0, exempt: false, spentSek: 0 })).toBe(true);
  });
});

describe("householdCostsFromRows", () => {
  const row = (over: Partial<HouseholdUsageRow>): HouseholdUsageRow => ({
    household_id: "h1",
    name: "Familjen",
    members: "Anna, Bo",
    exempt: false,
    cap_sek: 10,
    model: haiku.id,
    day_input_tokens: 0,
    day_output_tokens: 0,
    month_input_tokens: 0,
    month_output_tokens: 0,
    ...over,
  });

  it("sums each household's models for today and the month, and lists the dearest first", () => {
    const { capSek, households } = householdCostsFromRows([
      row({ household_id: "a", name: "Billig", day_input_tokens: tokensFor(0.1), month_input_tokens: tokensFor(0.2) }),
      row({ household_id: "b", name: "Dyr", day_input_tokens: tokensFor(2), month_input_tokens: tokensFor(5) }),
      row({ household_id: "b", name: "Dyr", model: "qwen/local", day_input_tokens: 1e9, month_input_tokens: 1e9 }),
      row({ household_id: "c", name: "Tom", model: null }),
    ]);
    expect(capSek).toBe(10);
    expect(households.map((household) => household.name)).toEqual(["Dyr", "Billig", "Tom"]);
    expect(households[0]!.todaySek).toBeCloseTo(2 * sekPerUsd, 4);
    expect(households[0]!.monthSek).toBeCloseTo(5 * sekPerUsd, 4);
    expect(households[2]).toMatchObject({ todaySek: 0, monthSek: 0, capped: false });
  });

  it("marks a household over the cap, but never an exempt one", () => {
    const over = { day_input_tokens: tokensFor(5), month_input_tokens: tokensFor(5) };
    const { households } = householdCostsFromRows([row({ household_id: "a", name: "A", ...over }), row({ household_id: "b", name: "B", exempt: true, ...over })]);
    expect(households.find((household) => household.id === "a")?.capped).toBe(true);
    expect(households.find((household) => household.id === "b")).toMatchObject({ capped: false, exempt: true });
  });
});

describe("the cap field", () => {
  it("reads kronor with a comma or a point, and refuses anything outside 0 to 1000", () => {
    expect(parseCapInput("10")).toBe(10);
    expect(parseCapInput(" 7,5 kr ")).toBe(7.5);
    expect(parseCapInput("0")).toBe(0);
    expect(parseCapInput("1000")).toBe(1000);
    expect(parseCapInput("1000,01")).toBeNull();
    expect(parseCapInput("-1")).toBeNull();
    expect(parseCapInput("")).toBeNull();
    expect(parseCapInput("tio")).toBeNull();
    expect(parseCapInput("1,234")).toBeNull();
  });

  it("shows the cap with a decimal comma", () => {
    expect(capFieldText(7.5)).toBe("7,5");
    expect(capFieldText(10)).toBe("10");
    expect(formatSek(1.2)).toMatch(/^1,20\s?kr$/);
  });
});
