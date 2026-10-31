import { describe, expect, it } from "vitest";
import type { AiJob } from "@/lib/ai-job-shape";
import {
  doingText,
  finishedText,
  jobRowText,
  resultHref,
  severalFinishedText,
  statusText,
  subjectText,
  waitingText,
} from "./ai-job-text";

const job = (overrides: Partial<AiJob> = {}): AiJob => ({
  id: "00000000-0000-4000-8000-000000000001",
  kind: "suggest",
  status: "running",
  context: {},
  errorCode: null,
  createdAt: "2026-10-28T12:00:00.000Z",
  seen: false,
  ahead: 0,
  count: null,
  ...overrides,
});

describe("the words of AI jobs", () => {
  it("names a job after what it is about, never the technique", () => {
    expect(doingText("suggest")).toBe("Letar efter rättförslag");
    expect(subjectText("suggest")).toBe("rättförslag");
    for (const kind of ["suggest", "analyze", "import", "things"] as const) {
      expect(doingText(kind)).not.toMatch(/AI|modell|jobb/i);
      expect(subjectText(kind)).not.toMatch(/AI|modell|jobb/i);
    }
  });

  it("writes the state as Pågår, I kö, 1 före, Klart, Gick inte and Avbrutet", () => {
    expect(statusText(job({ status: "running" }))).toBe("Pågår");
    expect(statusText(job({ status: "queued", ahead: 0 }))).toBe("I kö");
    expect(statusText(job({ status: "queued", ahead: 1 }))).toBe("I kö, 1 före");
    expect(statusText(job({ status: "done" }))).toBe("Klart");
    expect(statusText(job({ status: "failed" }))).toBe("Gick inte");
    expect(statusText(job({ status: "cancelled" }))).toBe("Avbrutet");
  });

  it("says I kö, 1 före. in the flow only while the job waits behind another", () => {
    expect(waitingText(job({ status: "queued", ahead: 1 }))).toBe("I kö, 1 före.");
    expect(waitingText(job({ status: "queued", ahead: 2 }))).toBe("I kö, 2 före.");
    expect(waitingText(job({ status: "queued", ahead: 0 }))).toBeNull();
    expect(waitingText(job({ status: "running" }))).toBeNull();
  });

  it("says what is there in a finished job, and without the word jobb", () => {
    expect(finishedText(job({ status: "done", count: 3 }))).toBe("3 rättförslag är klara.");
    expect(finishedText(job({ status: "done", count: 1 }))).toBe("1 rättförslag är klart.");
    expect(finishedText(job({ status: "failed" }))).toBe("Det gick inte att ta fram rättförslag.");
    expect(severalFinishedText(2)).toBe("2 AI-resultat är klara.");
    expect(finishedText(job({ status: "done", count: 3 }))).not.toMatch(/jobb/i);
  });

  it("shows the job row text with what runs and how many wait behind it", () => {
    expect(jobRowText([])).toBeNull();
    expect(jobRowText([job({ status: "done" })])).toBeNull();
    expect(jobRowText([job()])).toEqual({
      text: "AI: Letar efter rättförslag",
      label: "AI-jobb: Letar efter rättförslag",
    });
    const queued = job({ id: "00000000-0000-4000-8000-000000000002", status: "queued", ahead: 1, createdAt: "2026-10-28T12:00:05.000Z" });
    const queuedToo = job({ id: "00000000-0000-4000-8000-000000000003", status: "queued", ahead: 2, createdAt: "2026-10-28T12:00:09.000Z" });
    expect(jobRowText([queuedToo, queued, job()])).toEqual({
      text: "AI: Letar efter rättförslag · 2 i kö",
      label: "AI-jobb: Letar efter rättförslag, 2 i kö",
    });
  });

  it("shows the first in the queue when none runs", () => {
    expect(jobRowText([job({ status: "queued" })])?.text).toBe("AI: Letar efter rättförslag");
  });

  it("sends a result to its own tab", () => {
    expect(resultHref("suggest")).toBe("/recept");
    expect(resultHref("import")).toBe("/recept");
    expect(resultHref("analyze")).toBe("/hemma");
    // Story 12.5: a photo's result opens Förråd on the photo's location.
    expect(resultHref("analyze", { location: "Frys", siteId: null })).toBe("/hemma?plats=frys");
    expect(resultHref("analyze", { location: "Okand" })).toBe("/hemma");
  });
});

describe("the words of a recipe import (Story 12.6)", () => {
  it("names the site a link is read from in the job row", () => {
    const reading = job({ kind: "import", context: { source: "url", domain: "koket.se" } });
    expect(jobRowText([reading])?.text).toBe("AI: Läser receptet från koket.se");
    expect(jobRowText([job({ kind: "import", context: { source: "text" } })])?.text).toBe("AI: Läser receptet");
  });

  it("confirms with the recipe's title, and says it did not go", () => {
    expect(finishedText(job({ kind: "import", status: "done", title: "Krämig kycklinggryta" }))).toBe(
      "Receptet Krämig kycklinggryta är inläst.",
    );
    expect(finishedText(job({ kind: "import", status: "failed" }))).toBe("Det gick inte att läsa receptet.");
  });
});

describe("the things job (Story 18.2)", () => {
  it("is named after what it is about, and says how many things it listed", () => {
    expect(doingText("things")).toBe("Letar efter prylar på fotot");
    expect(subjectText("things")).toBe("prylarna på fotot");
    expect(finishedText(job({ kind: "things", status: "done", count: 12 }))).toBe("12 prylar är listade.");
    expect(finishedText(job({ kind: "things", status: "done", count: 1 }))).toBe("1 pryl är listad.");
    expect(finishedText(job({ kind: "things", status: "failed" }))).toBe("Det gick inte att lista prylarna på fotot.");
  });

  it("shows the result on the place's page in Prylar, and on the tab for anything odd", () => {
    const place = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";
    expect(resultHref("things", { placeId: place })).toBe(`/prylar/${place}`);
    expect(resultHref("things", {})).toBe("/prylar");
    expect(resultHref("things", { placeId: "../../recept" })).toBe("/prylar");
  });
});
