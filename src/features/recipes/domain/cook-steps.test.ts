import { describe, expect, it } from "vitest";
import { cookSteps } from "./cook-steps";

const steps = [
  { id: "s1", position: 0, text: "Fräs löken." },
  { id: "s2", position: 1, text: "Häll i grädden." },
  { id: "s3", position: 2, text: "Servera." },
];

const line = (id: string, stepId: string | null) => ({ id, stepId });
const ids = (lines: { id: string }[]) => lines.map((l) => l.id);

describe("cookSteps", () => {
  it("gives each step its text and the lines of that step, in the recipe's order", () => {
    const lines = [line("a", "s2"), line("b", "s1"), line("c", "s2"), line("d", "s1")];
    expect(cookSteps(steps, lines)).toEqual([
      { id: "s1", text: "Fräs löken.", lines: [line("b", "s1"), line("d", "s1")], otherLines: [] },
      { id: "s2", text: "Häll i grädden.", lines: [line("a", "s2"), line("c", "s2")], otherLines: [] },
      { id: "s3", text: "Servera.", lines: [], otherLines: [] },
    ]);
  });

  it("orders the steps by position, whatever order they come in", () => {
    const shuffled = [steps[2], steps[0], steps[1]];
    const result = cookSteps(shuffled, [line("a", "s3"), line("b", "s1")]);
    expect(result.map((step) => step.id)).toEqual(["s1", "s2", "s3"]);
    expect(ids(result[0].lines)).toEqual(["b"]);
    expect(ids(result[2].lines)).toEqual(["a"]);
  });

  it("puts lines without a step, or whose step is gone, on the first step among the other ingredients", () => {
    const result = cookSteps(steps, [line("a", null), line("b", "gone"), line("c", "s3"), line("d", "s1")]);
    expect(ids(result[0].lines)).toEqual(["d"]);
    expect(ids(result[0].otherLines)).toEqual(["a", "b"]);
    expect(result.slice(1).map((step) => [ids(step.lines), ids(step.otherLines)])).toEqual([
      [[], []],
      [["c"], []],
    ]);
  });

  it("puts the other ingredients on the first step even when it has none of its own, after sorting", () => {
    const result = cookSteps([steps[1], steps[0]], [line("a", "s2"), line("b", null)]);
    expect(result[0].id).toBe("s1");
    expect(ids(result[0].lines)).toEqual([]);
    expect(ids(result[0].otherLines)).toEqual(["b"]);
  });

  it("gives the first step every line, as its own, when no line has a step", () => {
    const result = cookSteps(steps, [line("a", null), line("b", "gone"), line("c", null)]);
    expect(ids(result[0].lines)).toEqual(["a", "b", "c"]);
    expect(result[0].otherLines).toEqual([]);
    expect(result.slice(1).every((step) => step.lines.length === 0)).toBe(true);
  });

  it("keeps the lines as they are, so scaled amounts reach the step", () => {
    const scaled = { id: "a", stepId: "s1", amount: 3, unit: "dl" };
    expect(cookSteps(steps, [scaled])[0].lines[0]).toBe(scaled);
  });

  it("gives no steps for a recipe without steps, and empty steps for a recipe without lines", () => {
    expect(cookSteps([], [line("a", "s1")])).toEqual([]);
    expect(cookSteps(steps, []).every((step) => step.lines.length === 0 && step.otherLines.length === 0)).toBe(true);
  });
});
