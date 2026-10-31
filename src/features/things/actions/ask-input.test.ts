import { describe, expect, it, vi } from "vitest";
import { inputLimits } from "@/server/ai";
import type { IndexedPlace } from "../domain/thing-search";
import { buildAskInput } from "./ask-input";

vi.mock("server-only", () => ({}));

const place = (id: string, room: string, names: string[], extra: Partial<IndexedPlace> = {}): IndexedPlace => ({
  id,
  siteId: "s1",
  siteName: "Hemma",
  room,
  part: "Hyllan",
  cardTakenAt: new Date("2026-10-31T10:00:00Z"),
  hidden: 0,
  things: names.map((name, index) => ({ id: `${id}-${index}`, name, category: "Verktyg", whereHint: "på väggen" })),
  ...extra,
});

describe("buildAskInput", () => {
  it("sends names, category, where, place, boende and the card's day, and nothing else", () => {
    const built = buildAskInput([place("a", "Skräpförrådet", ["Hammare"], { hidden: 2 })], "Finns hammare?");
    expect(built?.input).toEqual({
      question: "Finns hammare?",
      places: [
        {
          title: "Skräpförrådet · Hyllan",
          site: "Hemma",
          cardDate: "31 okt",
          hidden: 2,
          things: [{ name: "Hammare", category: "Verktyg", where: "på väggen" }],
        },
      ],
    });
    expect(JSON.stringify(built?.input)).not.toContain('"a"');
  });

  it("leaves out places with nothing on them, and is null when nothing is left", () => {
    expect(buildAskInput([place("a", "Tomt", [])], "Finns hammare?")).toBeNull();
    expect(buildAskInput([place("a", "Tomt", []), place("b", "Lådor", [], { hidden: 1 })], "Lådor?")?.used.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("puts the likely places first, so the answer's numbers are indexes into `used`", () => {
    const built = buildAskInput([place("a", "Garaget", ["Spade"]), place("b", "Förrådet", ["Målarfärg"])], "Något att måla med?");
    expect(built?.used.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("drops where first, then the places that fit the question least, when the lists are too long", () => {
    const names = Array.from({ length: 150 }, (_, index) => `Pryl nummer ${index}`);
    const places = Array.from({ length: 12 }, (_, index) => place(`p${index}`, `Rum ${index}`, names));
    const built = buildAskInput([...places, place("paint", "Målarrummet", ["Målarfärg"])], "Något att måla med?");
    if (!built) throw new Error("nothing built");
    expect(built.used[0].id).toBe("paint");
    expect(built.used.length).toBeLessThan(13);
    expect(built.input.places.every((entry) => entry.things.every((thing) => thing.where === null))).toBe(true);
    expect(JSON.stringify(built.input).length).toBeLessThan(inputLimits.ask.maxChars * 2);
  });

  it("cuts the things of a single place that is too long on its own", () => {
    const names = Array.from({ length: 2_000 }, (_, index) => `Pryl nummer ${index}`);
    const built = buildAskInput([place("big", "Stora", names)], "Pryl?");
    expect(built?.used).toHaveLength(1);
    expect(built?.input.places[0].things.length).toBeGreaterThan(0);
    expect(built?.input.places[0].things.length).toBeLessThan(2_000);
  });
});
