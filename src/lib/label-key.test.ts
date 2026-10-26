import { describe, expect, it } from "vitest";
import { labelKey } from "./label-key";

describe("labelKey", () => {
  it.each([
    ["Grädde 3 dl", "grädde"],
    ["Grädde.", "grädde"],
    [" GRÄDDE ", "grädde"],
    ["ICA vispgrädde 36 % 3 dl", "ica vispgrädde"],
    ["Pepsi Max 1,5 l", "pepsi max"],
    ["Smör 500g", "smör"],
    ["Ägg 6 st", "ägg"],
    ["Arla  mellanmjölk 1 liter!", "arla mellanmjölk"],
  ])("gives %s the key %s", (label, key) => {
    expect(labelKey(label)).toBe(key);
  });

  it("keeps a label that is only an amount, and different products apart", () => {
    expect(labelKey("7up")).toBe("7up");
    expect(labelKey("Vara 2")).not.toBe(labelKey("Vara 3"));
    expect(labelKey("1,5 l")).toBe("1,5 l");
    expect(labelKey("Arla mellanmjölk")).not.toBe(labelKey("ICA mellanmjölk"));
  });
});
