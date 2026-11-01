import { describe, expect, it } from "vitest";
import type { ShoppingLine } from "./compute-list";
import { filterEmptyText, matchesListFilter, parseListFilter } from "./list-filter";

const line = (isCustom: boolean): ShoppingLine => ({
  key: isCustom ? "c:1" : "r:a:st",
  label: "a",
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "unlinked" },
  section: "Övrigt",
  origins: [],
  checked: false,
  isCustom,
});

describe("list filter", () => {
  it("reads ?visa= and ignores anything else", () => {
    expect(parseListFilter("egna")).toBe("own");
    expect(parseListFilter(["ratter", "egna"])).toBe("dishes");
    expect(parseListFilter("alla")).toBeNull();
    expect(parseListFilter(undefined)).toBeNull();
    expect(parseListFilter(null)).toBeNull();
  });

  it("matches own items with Egna, dish lines with Till rätter, and everything with none", () => {
    expect(matchesListFilter(line(true), "own")).toBe(true);
    expect(matchesListFilter(line(false), "own")).toBe(false);
    expect(matchesListFilter(line(false), "dishes")).toBe(true);
    expect(matchesListFilter(line(true), "dishes")).toBe(false);
    expect(matchesListFilter(line(true), null)).toBe(true);
  });

  it("says why a filter shows nothing", () => {
    expect(filterEmptyText("own", false)).toBe("Inga egna varor den här veckan.");
    expect(filterEmptyText("own", true)).toBe("Alla egna varor ligger i korgen.");
    expect(filterEmptyText("dishes", false)).toBe("Inga varor till rätter den här veckan.");
  });
});
