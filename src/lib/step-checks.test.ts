// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStepChecks, readStepChecks, saveStepChecks, stepChecksChangedEvent, stepChecksMaxAgeMs } from "./step-checks";

afterEach(() => localStorage.clear());

describe("step checks", () => {
  it("keeps the ticked steps per recipe and tells the page", () => {
    const heard = vi.fn();
    window.addEventListener(stepChecksChangedEvent, heard);
    saveStepChecks("r1", ["s1", "s2"]);
    expect(readStepChecks("r1")).toEqual(["s1", "s2"]);
    expect(readStepChecks("r2")).toEqual([]);
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(stepChecksChangedEvent, heard);
  });

  it("forgets them 12 hours after the last tick, so the next cooking starts open", () => {
    const at = Date.parse("2026-11-08T18:00:00Z");
    saveStepChecks("r1", ["s1"], at);
    expect(readStepChecks("r1", at + stepChecksMaxAgeMs - 1)).toEqual(["s1"]);
    expect(readStepChecks("r1", at + stepChecksMaxAgeMs + 1)).toEqual([]);
  });

  it("clears them after cooking or Börja om, and ignores broken data", () => {
    saveStepChecks("r1", ["s1"]);
    clearStepChecks("r1");
    expect(readStepChecks("r1")).toEqual([]);
    expect(localStorage.getItem("livskoll-step-checks-r1")).toBeNull();
    localStorage.setItem("livskoll-step-checks-r1", "{not json");
    expect(readStepChecks("r1")).toEqual([]);
  });
});
