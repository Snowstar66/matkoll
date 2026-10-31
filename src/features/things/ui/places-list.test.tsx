import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThingPlace } from "../domain/thing-place";
import { placeMeta, PlacesList } from "./places-list";

const place = (overrides: Partial<ThingPlace>): ThingPlace => ({
  id: crypto.randomUUID(),
  siteId: "s",
  room: "Skräpförrådet",
  part: null,
  isBox: false,
  itemCount: 0,
  mergedAway: 0,
  cardTakenAt: null,
  cardState: "none",
  ...overrides,
});

describe("what a place's row says", () => {
  it("is the count and the card's date, or why there is none", () => {
    expect(placeMeta(place({ itemCount: 12, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "done" }))).toBe("12 saker · Kort från 31 okt");
    expect(placeMeta(place({ itemCount: 1, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "done" }))).toBe("1 sak · Kort från 31 okt");
    expect(placeMeta(place({ itemCount: 0, mergedAway: 4, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "done" }))).toBe("Alla syns på andra kort · Kort från 31 okt");
    expect(placeMeta(place({ itemCount: 0, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "done" }))).toBe("0 saker · Kort från 31 okt");
    expect(placeMeta(place({}))).toBe("Inget kort än");
    expect(placeMeta(place({ isBox: true, itemCount: 2, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "done" }))).toBe("Låda · 2 saker · Kort från 31 okt");
    expect(placeMeta(place({ cardState: "reading" }))).toBe("Tittar på kortet …");
    expect(placeMeta(place({ cardState: "failed" }))).toBe("Kortet kunde inte läsas");
    expect(
      placeMeta(place({ itemCount: 3, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "failed" })),
    ).toBe("3 saker · Kort från 31 okt · nytt kort kunde inte läsas");
  });
});

describe("PlacesList", () => {
  it("groups the places per room, each a link to its page", () => {
    const shelf = place({ room: "Skräpförrådet", part: "Översta hyllan", itemCount: 12, cardTakenAt: new Date("2026-10-31T10:00:00Z"), cardState: "done" });
    const whole = place({ room: "Garaget" });
    const floor = place({ room: "skräpförrådet", part: "Golvet" });
    render(<PlacesList places={[shelf, whole, floor]} />);

    const rooms = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(rooms).toEqual(["Skräpförrådet", "Garaget"]);
    const group = screen.getByRole("list", { name: "Skräpförrådet" });
    const rows = within(group).getAllByRole("link");
    expect(rows.map((row) => row.textContent)).toEqual(["Översta hyllan 12 saker · Kort från 31 okt", "Golvet Inget kort än"]);
    expect(rows[0]).toHaveAttribute("href", `/prylar/${shelf.id}`);
    expect(screen.getByRole("link", { name: /Hela rummet/ })).toHaveAttribute("href", `/prylar/${whole.id}`);
  });
});
