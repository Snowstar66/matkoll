import { describe, expect, it } from "vitest";
import { buildDayText, builtText, commitText, shortVersion, versionLine } from "./build-info";

describe("build info", () => {
  it("shows major and minor of the version", () => {
    expect(shortVersion("0.1.0")).toBe("0.1");
    expect(shortVersion("1.12.3")).toBe("1.12");
  });

  it("says when the app was built, in Swedish time", () => {
    // 18.42 UTC is 19.42 in Stockholm in November (CET).
    expect(builtText("2026-11-04T18:42:00.000Z")).toBe("Byggd 4 nov 2026 kl 19.42");
    // Summer time: UTC+2, and the day turns at midnight in Stockholm.
    expect(builtText("2026-06-30T22:05:00.000Z")).toBe("Byggd 1 juli 2026 kl 00.05");
    expect(buildDayText("2026-11-04T18:42:00.000Z")).toBe("4 nov");
  });

  it("leaves the time out when it is not known", () => {
    expect(builtText(null)).toBeNull();
    expect(builtText("not a time")).toBeNull();
    expect(buildDayText(null)).toBeNull();
  });

  it("shows the commit's first 7 characters, or lokal", () => {
    expect(commitText("0498375a1b2c3d4e5f")).toBe("0498375");
    expect(commitText(null)).toBe("lokal");
    expect(commitText("  ")).toBe("lokal");
  });

  it("makes the Om row's short line", () => {
    expect(versionLine({ version: "0.1.0", builtAt: "2026-11-04T18:42:00.000Z", commit: null })).toBe("0.1 · 4 nov");
    expect(versionLine({ version: "0.1.0", builtAt: null, commit: null })).toBe("0.1");
  });
});
