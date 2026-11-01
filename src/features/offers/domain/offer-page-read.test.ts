import { describe, expect, it } from "vitest";
import oldPage from "../../../../tests/fixtures/sites/ica-erbjudanden-gammal.html?raw";
import onlyOtherPage from "../../../../tests/fixtures/sites/ica-erbjudanden-bara-annat.html?raw";
import emptyPage from "../../../../tests/fixtures/sites/ica-erbjudanden-tom.html?raw";
import noDataPage from "../../../../tests/fixtures/sites/ica-erbjudanden-utan-data.html?raw";
import savedPage from "../../../../tests/fixtures/sites/ica-erbjudanden.html?raw";
import { readOfferPage } from "./offer-page-read";
import { addDays } from "./week";

// readOfferPage (Stories 9.1 and 17.11) on the saved ICA pages in tests/fixtures/sites,
// read on a Wednesday: the pages' {{sunday}} is that week's Sunday.

const now = new Date("2026-11-04T10:00:00Z");
const fill = (html: string) => html.replace(/\{\{sunday(?:\+(\d+))?\}\}/g, (_mark, days?: string) => addDays("2026-11-08", Number(days ?? 0)));

describe("readOfferPage", () => {
  it("gives the week's food offers, named, and counts the rest", () => {
    const read = readOfferPage(fill(savedPage), now);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // Two offers last longer (into next week and three weeks on): too few to be next week's, so one week.
    expect(read.data.weeks.map((week) => week.weekStart)).toEqual(["2026-11-02"]);
    expect(read.data.skipped).toBe(2);
    expect(read.data.weeks[0].entries).toHaveLength(7);
    expect(read.data.weeks[0].entries.map((entry) => entry.name.label)).toContain("Havets Laxfilé");
  });

  it("says why a page gives nothing", () => {
    expect(readOfferPage(fill(noDataPage), now)).toMatchObject({ ok: false, error: { code: "offers_page_changed" } });
    expect(readOfferPage(fill(emptyPage), now)).toMatchObject({ ok: false, error: { code: "offers_none" } });
    expect(readOfferPage(fill(onlyOtherPage), now)).toMatchObject({ ok: false, error: { code: "offers_none" } });
    expect(readOfferPage(fill(oldPage), now)).toMatchObject({ ok: false, error: { code: "offers_page_old" } });
  });

  it("refuses this week's page two weeks later", () => {
    expect(readOfferPage(fill(savedPage), new Date("2026-11-18T10:00:00Z"))).toMatchObject({ ok: false, error: { code: "offers_page_old" } });
  });

  /** The saved page with its first `count` offers ending next Sunday instead of this one. */
  const withNextWeek = (count: number) => {
    let left = count;
    return fill(savedPage.replace(/"validTo":"\{\{sunday\}\}/g, (mark) => (left-- > 0 ? '"validTo":"{{sunday+7}}' : mark)));
  };

  it("also saves next week once its offers are on the page, so they show at once (Story 17.11)", () => {
    // Sunday evening: 4 food offers end tonight, 3 last into next week (a new one and the 2 longer ones).
    const sunday = new Date("2026-11-08T19:00:00Z");
    const read = readOfferPage(withNextWeek(1), sunday);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.data.weeks.map((week) => [week.weekStart, week.entries.length])).toEqual([
      ["2026-11-02", 7],
      ["2026-11-09", 3],
    ]);
    expect(read.data.weeks[1].entries.every((entry) => entry.offer.validTo >= "2026-11-09")).toBe(true);
  });

  it("keeps a page whose week is next week to that week only", () => {
    // Most offers end next Sunday: the page is next week's; the two that end tonight are not saved.
    const read = readOfferPage(withNextWeek(3), new Date("2026-11-08T19:00:00Z"));
    expect(read.ok && read.data.weeks.map((week) => [week.weekStart, week.entries.length])).toEqual([["2026-11-09", 5]]);
  });

  it("keeps a few longer offers with this week, also on a Sunday", () => {
    // 5 end tonight, 2 last longer: next week's offers are not out yet.
    const read = readOfferPage(withNextWeek(0), new Date("2026-11-08T19:00:00Z"));
    expect(read.ok && read.data.weeks.map((week) => week.weekStart)).toEqual(["2026-11-02"]);
  });
});
