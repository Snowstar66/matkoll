import { describe, expect, it } from "vitest";
import { groupLines, groupNames, hasGroups, lineGroupName } from "./line-groups";

const line = (id: string, group?: string | null) => ({ id, group });
const shape = (groups: ReturnType<typeof groupLines<{ id: string; group?: string | null }>>) =>
  groups.map((group) => [group.name, group.lines.map((l) => l.id)]);

describe("groupLines", () => {
  it("gives a recipe without groups one group without a name, as before groups", () => {
    expect(shape(groupLines([line("a"), line("b", null), line("c", "  ")]))).toEqual([[null, ["a", "b", "c"]]]);
  });

  it("gives no groups for no lines", () => {
    expect(groupLines([])).toEqual([]);
  });

  it("lists the groups in the order of their first line, each with its lines in order", () => {
    const lines = [
      line("a", "Rostad småpotatis"),
      line("b", "Rostad småpotatis"),
      line("c", "Örtstekt kyckling"),
      line("d", "Tryffelsky"),
      line("e", "Örtstekt kyckling"),
    ];
    expect(shape(groupLines(lines))).toEqual([
      ["Rostad småpotatis", ["a", "b"]],
      ["Örtstekt kyckling", ["c", "e"]],
      ["Tryffelsky", ["d"]],
    ]);
  });

  it("puts the lines without a group first, without a heading", () => {
    const lines = [line("a", "Sås"), line("b"), line("c", "Sås"), line("d", null)];
    expect(shape(groupLines(lines))).toEqual([
      [null, ["b", "d"]],
      ["Sås", ["a", "c"]],
    ]);
  });

  it("treats names that differ only in surrounding space as the same group", () => {
    expect(shape(groupLines([line("a", "Sås "), line("b", " Sås")]))).toEqual([["Sås", ["a", "b"]]]);
  });
});

describe("lineGroupName, hasGroups and groupNames", () => {
  it("reads a blank group as none", () => {
    expect(lineGroupName({ group: " " })).toBeNull();
    expect(lineGroupName({})).toBeNull();
    expect(lineGroupName({ group: " Sås " })).toBe("Sås");
  });

  it("knows whether any line has a group, and names them in order", () => {
    expect(hasGroups([line("a"), line("b", null)])).toBe(false);
    expect(hasGroups([line("a"), line("b", "Sås")])).toBe(true);
    expect(groupNames([line("a", "Sås"), line("b"), line("c", "Kyckling"), line("d", "Sås")])).toEqual(["Sås", "Kyckling"]);
  });
});
