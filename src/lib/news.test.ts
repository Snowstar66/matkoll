import { describe, expect, it } from "vitest";
import {
  hashKey,
  maxNewsAgeMs,
  maxOwnChanges,
  newsKey,
  newsQuery,
  newsTabOf,
  noteOwn,
  othersNews,
  ownChangeTtlMs,
  parseLastSeen,
  parseOwn,
  sinceFor,
} from "./news";

// Brickor (Story 23.1): the pure part of counting news from others.

describe("own changes", () => {
  it("keeps a short hash of the key, never the key itself (a line key holds a food's name)", () => {
    const own = noteOwn({}, newsKey.check("t:mjölk"), 1_000);
    expect(Object.keys(own)).toEqual([hashKey("check:t:mjölk")]);
    expect(JSON.stringify(own)).not.toContain("mjölk");
  });

  it("forgets what is older than a day and keeps at most the newest maxOwnChanges", () => {
    const old = noteOwn({}, "item:a", 0);
    expect(noteOwn(old, "item:b", ownChangeTtlMs)).toEqual({ [hashKey("item:b")]: ownChangeTtlMs });
    let many = {};
    for (let index = 0; index <= maxOwnChanges; index++) many = noteOwn(many, `item:${index}`, 10 + index);
    expect(Object.keys(many)).toHaveLength(maxOwnChanges);
    expect(many).not.toHaveProperty(hashKey("item:0"));
  });

  it("leaves out the news this device made, and counts a key once", () => {
    const own = noteOwn(noteOwn({}, newsKey.item("1"), 5), newsKey.card("p2"), 5);
    expect(othersNews(["item:1", "item:3", "check:r:x", "check:r:x", "card:p2"], own)).toEqual(["item:3", "check:r:x"]);
    expect(othersNews(["item:1"], {})).toEqual(["item:1"]);
  });
});

describe("last seen", () => {
  it("reads only numbers for known tabs, and nothing from what is unreadable", () => {
    expect(parseLastSeen(JSON.stringify({ lista: 5, prylar: "x", recept: 3 }))).toEqual({ lista: 5 });
    expect(parseLastSeen("{not json")).toEqual({});
    expect(parseLastSeen(null)).toEqual({});
    expect(parseOwn("[1]")).toEqual({});
    expect(parseOwn(JSON.stringify({ a: 1, b: "2" }))).toEqual({ a: 1 });
  });

  it("asks for each seen tab after its time, and for no time on a tab never seen", () => {
    const at = Date.UTC(2026, 10, 1, 8);
    expect(newsQuery({ lista: at })).toBe(`lista=${encodeURIComponent(new Date(at).toISOString())}`);
    expect(newsQuery({})).toBe("");
  });

  it("reads at most 30 days back on the server, and nothing for a missing or broken time", () => {
    const now = new Date(Date.UTC(2026, 10, 1));
    expect(sinceFor("2020-01-01T00:00:00Z", now)?.getTime()).toBe(now.getTime() - maxNewsAgeMs);
    expect(sinceFor("2026-10-31T12:00:00Z", now)?.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(sinceFor(null, now)).toBeNull();
    expect(sinceFor("igår", now)).toBeNull();
  });

  it("knows the tab of a page, also below it", () => {
    expect(newsTabOf("/lista")).toBe("lista");
    expect(newsTabOf("/lista/lagg-till")).toBe("lista");
    expect(newsTabOf("/prylar/rum/1")).toBe("prylar");
    expect(newsTabOf("/listan")).toBeNull();
    expect(newsTabOf("/recept")).toBeNull();
    expect(newsTabOf(null)).toBeNull();
  });
});
