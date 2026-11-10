import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestReleaseDate, releaseDateText, releases, releasesByDate } from "./releases";

describe("releases", () => {
  it("have real dates, newest first", () => {
    for (const release of releases) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${release.date}T12:00:00Z`).toISOString().slice(0, 10)).toBe(release.date);
    }
    const dates = releases.map((release) => release.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(latestReleaseDate).toBe(dates[0]);
  });

  it("each have a title and 2–5 bullets", () => {
    for (const release of releases) {
      expect(release.title.trim()).not.toBe("");
      expect(release.bullets.length).toBeGreaterThanOrEqual(2);
      expect(release.bullets.length).toBeLessThanOrEqual(5);
    }
  });

  it("are grouped by day for the page", () => {
    const groups = releasesByDate();
    expect(groups.flatMap((group) => group.entries)).toEqual(releases);
  });

  it("show the day in Swedish", () => {
    expect(releaseDateText("2026-11-04")).toBe("4 november 2026");
  });

  it("collect every file in releases/, each named after its date", () => {
    const files = readdirSync(new URL("./releases", import.meta.url)).filter((name) => name.endsWith(".ts"));
    expect(releases).toHaveLength(files.length);
    for (const file of files) expect(releases.some((release) => file.startsWith(`${release.date}-`))).toBe(true);
  });
});
