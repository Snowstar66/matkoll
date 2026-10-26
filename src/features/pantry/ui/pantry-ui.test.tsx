import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PantryItem } from "../domain/pantry-item";
import { LocationCards } from "./location-cards";
import { PantryList } from "./pantry-list";

const item = (overrides: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  ingredientId: `ingredient-${overrides.id}`,
  location: "Kyl",
  amount: null,
  unit: null,
  ...overrides,
});

describe("LocationCards", () => {
  it("shows the three locations with their counts and marks the chosen one", () => {
    render(<LocationCards selected="Frys" counts={{ Kyl: 3, Frys: 1, Skafferi: 0 }} />);
    const nav = screen.getByRole("navigation", { name: "Platser" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Kyl 3 varor", "Frys 1 vara", "Skafferi 0 varor"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/hemma?plats=kyl",
      "/hemma?plats=frys",
      "/hemma?plats=skafferi",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(links[1]).toHaveClass("border-accent");
    expect(links[0]).toHaveClass("bg-mint", "border-transparent");
    expect(links[1]).toHaveClass("bg-sky");
    expect(links[2]).toHaveClass("bg-sand");
  });
});

describe("PantryList", () => {
  it("shows items with an amount as rows and unlimited items as tags", () => {
    render(
      <PantryList
        location="Kyl"
        items={[
          item({ id: "1", name: "Mjölk", amount: 1, unit: "l" }),
          item({ id: "2", name: "Salt" }),
          item({ id: "3", name: "Smör", amount: 250, unit: "g" }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Med mängd" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    const tags = within(screen.getByRole("list", { name: "Finns hemma" })).getAllByRole("listitem");
    expect(tags.map((tag) => tag.textContent)).toEqual(["Salt"]);
  });

  it("formats amounts with formatQuantity and leaves out an empty section", () => {
    render(<PantryList location="Frys" items={[item({ id: "1", name: "Ärtor", location: "Frys", amount: 0.333, unit: "kg" })]} />);
    expect(screen.getByText("0,33 kg")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finns hemma" })).toBeNull();
  });

  it("names the location when it is empty", () => {
    render(<PantryList location="Skafferi" items={[]} />);
    expect(screen.getByText("Inget i skafferiet än.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
