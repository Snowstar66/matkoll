import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingLine } from "../domain/compute-list";
import {
  enqueueCheck,
  flushQueue,
  isGone,
  isQueued,
  mergeQueued,
  outcomeOf,
  readQueue,
  resetQueues,
  withCheck,
} from "./offline-checks";

const plan = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const line = (key: string, checked = false): ShoppingLine => ({
  key,
  label: key,
  section: "Övrigt",
  amount: null,
  unit: null,
  isVague: false,
  coverage: { kind: "missing" },
  origins: ["d1"],
  checked,
  isCustom: false,
});

beforeEach(() => {
  window.localStorage.clear();
  resetQueues();
});

describe("withCheck", () => {
  it("keeps the last state per line, last in order", () => {
    const queue = withCheck(withCheck([], { planId: plan, key: "t:a", checked: true }), { planId: plan, key: "t:b", checked: true });
    expect(withCheck(queue, { planId: plan, key: "t:a", checked: false })).toEqual([
      { planId: plan, key: "t:b", checked: true },
      { planId: plan, key: "t:a", checked: false },
    ]);
  });
  it("keeps the same line on another plan apart", () => {
    const queue = withCheck([{ planId: plan, key: "t:a", checked: true }], { planId: other, key: "t:a", checked: true });
    expect(queue).toHaveLength(2);
  });
});

describe("mergeQueued", () => {
  it("puts queued checks of this plan over the server's lines, and leaves the rest", () => {
    const lines = [line("t:a"), line("t:b", true), line("t:c")];
    const merged = mergeQueued(
      lines,
      [
        { planId: plan, key: "t:a", checked: true },
        { planId: plan, key: "t:b", checked: false },
        { planId: other, key: "t:c", checked: true },
      ],
      plan,
    );
    expect(merged.map((item) => item.checked)).toEqual([true, false, false]);
  });
  it("returns the same lines with nothing queued", () => {
    const lines = [line("t:a")];
    expect(mergeQueued(lines, [], plan)).toBe(lines);
  });
});

describe("isGone", () => {
  it("is true only for a line of the shown plan that the list no longer has", () => {
    const lines = [line("t:a")];
    expect(isGone({ planId: plan, key: "t:x", checked: true }, plan, lines)).toBe(true);
    expect(isGone({ planId: plan, key: "t:a", checked: true }, plan, lines)).toBe(false);
    expect(isGone({ planId: other, key: "t:x", checked: true }, plan, lines)).toBe(false);
  });
});

describe("outcomeOf", () => {
  it("retries what may succeed later and drops what never will", () => {
    expect(outcomeOf("lost")).toBe("retry");
    expect(outcomeOf({ ok: true })).toBe("saved");
    expect(outcomeOf({ ok: false, code: "shopping_check_failed" })).toBe("retry");
    expect(outcomeOf({ ok: false, code: "unauthorized" })).toBe("retry");
    expect(outcomeOf({ ok: false, code: "shopping_plan_changed" })).toBe("dropped");
    expect(outcomeOf({ ok: false, code: "validation" })).toBe("dropped");
  });
});

describe("the stored queue", () => {
  it("survives a reload, per user", () => {
    enqueueCheck("u1", { planId: plan, key: "t:a", checked: true });
    expect(window.localStorage.getItem("matkoll:offline-checks:u1")).toContain("t:a");
    resetQueues();
    expect(readQueue("u1")).toEqual([{ planId: plan, key: "t:a", checked: true }]);
    expect(readQueue("u2")).toEqual([]);
    expect(isQueued("u1", plan, "t:a")).toBe(true);
  });
  it("ignores damaged storage", () => {
    window.localStorage.setItem("matkoll:offline-checks:u1", "{nope");
    expect(readQueue("u1")).toEqual([]);
    resetQueues();
    window.localStorage.setItem("matkoll:offline-checks:u1", JSON.stringify([{ key: 1 }, { planId: plan, key: "t:a", checked: true }]));
    expect(readQueue("u1")).toEqual([{ planId: plan, key: "t:a", checked: true }]);
  });
  it("falls back to memory when storage is blocked", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      enqueueCheck("u1", { planId: plan, key: "t:a", checked: true });
      expect(readQueue("u1")).toHaveLength(1);
    } finally {
      set.mockRestore();
    }
  });
});

describe("flushQueue", () => {
  it("sends in order, drops gone lines quietly and stops at the first retry", async () => {
    for (const key of ["t:a", "t:gone", "t:b", "t:c"]) enqueueCheck("u1", { planId: plan, key, checked: true });
    const sent: string[] = [];
    const saved = await flushQueue(
      "u1",
      async (change) => {
        sent.push(change.key);
        return change.key === "t:c" ? "retry" : "saved";
      },
      (entry) => entry.key === "t:gone",
    );
    expect(sent).toEqual(["t:a", "t:b", "t:c"]);
    expect(saved).toBe(2);
    expect(readQueue("u1").map((entry) => entry.key)).toEqual(["t:c"]);
  });
  it("keeps a newer tap of a line made while its older check was being sent", async () => {
    enqueueCheck("u1", { planId: plan, key: "t:a", checked: true });
    const saved = await flushQueue(
      "u1",
      async (change) => {
        if (change.checked) enqueueCheck("u1", { planId: plan, key: "t:a", checked: false });
        return "saved";
      },
      () => false,
    );
    expect(saved).toBe(2);
    expect(readQueue("u1")).toEqual([]);
  });
});
