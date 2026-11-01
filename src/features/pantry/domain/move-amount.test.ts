import { describe, expect, it } from "vitest";
import { planMove, type MoveRow } from "./move-amount";

const milk = "11111111-1111-4111-8111-111111111111";
const bread = "22222222-2222-4222-8222-222222222222";

const row = (overrides: Partial<MoveRow> & Pick<MoveRow, "id">): MoveRow => ({
  ingredientId: milk,
  amount: 2,
  unit: "l",
  label: null,
  ...overrides,
});

describe("planMove (Story 16.18)", () => {
  it("moves a whole row, in one write that replaces the source", () => {
    const plan = planMove([row({ id: "a", ingredientId: bread, amount: 1, unit: "st" })], [], { ingredientId: bread, amount: 1, unit: "st" }, "Frys", "Skafferi");
    expect(plan).toEqual({
      sets: [{ ingredientId: bread, location: "Frys", amount: 1, unit: "st" }],
      replaceId: "a",
    });
  });

  it("moves only what was bought and leaves what was at home", () => {
    const plan = planMove([row({ id: "a", amount: 3 })], [], { ingredientId: milk, amount: 2, unit: "l" }, "Frys", "Kyl");
    expect(plan).toEqual({
      sets: [
        { ingredientId: milk, location: "Frys", amount: 2, unit: "l" },
        { ingredientId: milk, location: "Kyl", amount: 1, unit: "l" },
      ],
      replaceId: null,
    });
  });

  it("adds to a row the destination has, and keeps the source's label for a new row", () => {
    const withLabel = planMove([row({ id: "a", amount: 1, label: "Arla" })], [], { ingredientId: milk, amount: 1, unit: "l" }, "Frys", "Kyl");
    expect(withLabel?.sets[0]).toMatchObject({ label: "Arla" });
    const added = planMove([row({ id: "a", amount: 1 })], [row({ id: "b", amount: 0.1 })], { ingredientId: milk, amount: 1, unit: "l" }, "Frys", "Kyl");
    expect(added?.sets[0]).toEqual({ ingredientId: milk, location: "Frys", amount: 1.1, unit: "l" });
  });

  it("moves an unlimited row whole, and leaves an unlimited destination as it is", () => {
    const unlimited = row({ id: "a", amount: null, unit: null });
    expect(planMove([unlimited], [], { ingredientId: milk, amount: null, unit: null }, "Frys", "Kyl")).toEqual({
      sets: [{ ingredientId: milk, location: "Frys", amount: null, unit: null }],
      replaceId: "a",
    });
    const destination = row({ id: "b", amount: null, unit: null });
    expect(planMove([row({ id: "a", amount: 1 })], [destination], { ingredientId: milk, amount: 1, unit: "l" }, "Frys", "Kyl")).toEqual({
      sets: [],
      replaceId: "a",
    });
  });

  it("gives nothing when the source has no such row", () => {
    expect(planMove([], [], { ingredientId: milk, amount: 1, unit: "l" }, "Frys", "Kyl")).toBeNull();
    expect(planMove([row({ id: "a", unit: "dl" })], [], { ingredientId: milk, amount: 1, unit: "l" }, "Frys", "Kyl")).toBeNull();
  });
});
