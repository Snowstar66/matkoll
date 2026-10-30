import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekNav } from "./week-nav";

const now = new Date("2026-10-29T10:00:00Z");

describe("WeekNav", () => {
  it("shows this week and the next two as tiles with their dish counts", () => {
    render(<WeekNav weekStart="2026-10-26" counts={{ "2026-10-26": 5, "2026-11-02": 1 }} now={now} />);
    const tiles = screen.getAllByTestId("week-tile");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "Vecka 44, denna vecka, 5 rätter",
      "Vecka 45, nästa vecka, 1 rätt",
      "Vecka 46, om 2 veckor, inga rätter",
    ]);
    expect(within(tiles[0]).getByTestId("week-count")).toHaveTextContent("5");
    expect(within(tiles[2]).getByTestId("week-count")).toHaveTextContent("–");
    expect(tiles[0]).toHaveAttribute("aria-current", "page");
    expect(tiles[1]).not.toHaveAttribute("aria-current");
    expect(tiles[0]).toHaveAttribute("href", "/matsedel");
    expect(tiles[1]).toHaveAttribute("href", "/matsedel?vecka=2026-W45");
    expect(screen.getByRole("link", { name: "Tidigare veckor" })).toHaveAttribute("href", "/matsedel/tidigare");
  });

  it("leads to another page without the history link when asked (Inköpslista, Story 3.10)", () => {
    render(<WeekNav weekStart="2026-10-26" now={now} basePath="/lista" showHistory={false} />);
    expect(screen.getAllByTestId("week-tile")[1]).toHaveAttribute("href", "/lista?vecka=2026-W45");
    expect(screen.queryByRole("link", { name: "Tidigare veckor" })).toBeNull();
  });

  it("highlights the viewed week", () => {
    render(<WeekNav weekStart="2026-11-09" now={now} />);
    expect(screen.getByRole("link", { name: /Vecka 46/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByTestId("week-tile")).toHaveLength(3);
  });

  it("adds a selected tile for a week further ahead", () => {
    render(<WeekNav weekStart="2026-12-07" now={now} />);
    const tiles = screen.getAllByTestId("week-tile");
    expect(tiles).toHaveLength(4);
    expect(tiles[3]).toHaveAttribute("aria-current", "page");
    expect(tiles[3]).toHaveAttribute("aria-label", "Vecka 50, om 6 veckor, inga rätter");
    expect(tiles[3]).toHaveAttribute("href", "/matsedel?vecka=2026-W50");
  });
});
