import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryHeader, type CategoryName, categoryTiles } from "./category-header";

describe("CategoryHeader", () => {
  it("is an h2 with the name, a hidden tile and the count read as '3 varor'", () => {
    render(<CategoryHeader category="Mejeri & ägg" count={3} id="kategori-mejeri" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Mejeri & ägg" });
    expect(heading).toHaveAttribute("id", "kategori-mejeri");
    // Upper case on screen only (section-label); the text stays as written for screen readers.
    expect(heading).toHaveClass("text-section-label", "text-ink-2");

    const tile = screen.getByTestId("category-tile");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveTextContent("🥛");
    expect(tile).toHaveClass("bg-sky", "size-tile", "rounded-sm", "text-tile-icon");

    expect(screen.getByText("3 varor")).toHaveClass("sr-only");
    expect(screen.getByText("3")).toHaveAttribute("aria-hidden", "true");
    // Heard also when moving by headings.
    expect(heading).toHaveAccessibleDescription("3 varor");
  });

  it("takes another heading level", () => {
    render(<CategoryHeader category="Dryck" count={2} level={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Dryck" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("gives an unknown category Övrigt's tile instead of throwing", () => {
    render(<CategoryHeader category={"Godis" as CategoryName} count={1} />);
    expect(screen.getByRole("heading", { level: 2, name: "Godis" })).toBeInTheDocument();
    expect(screen.getByTestId("category-tile")).toHaveClass(categoryTiles["Övrigt"].tile);
    expect(screen.getByTestId("category-tile")).toHaveTextContent(categoryTiles["Övrigt"].icon);
  });

  it.each([
    [2.7, "2 varor"],
    [-3, "0 varor"],
    [Number.NaN, "0 varor"],
    [Number.POSITIVE_INFINITY, "0 varor"],
    [1.2, "1 vara"],
  ])("shows a whole count of at least 0: %s is %s", (count, text) => {
    render(<CategoryHeader category="Bröd" count={count} />);
    expect(screen.getByRole("heading")).toHaveAccessibleDescription(text);
  });

  it("reads one item as '1 vara' and none as '0 varor'", () => {
    const { rerender } = render(<CategoryHeader category="Bröd" count={1} />);
    expect(screen.getByText("1 vara")).toBeInTheDocument();
    rerender(<CategoryHeader category="Bröd" count={0} />);
    expect(screen.getByText("0 varor")).toBeInTheDocument();
  });

  it("keeps the emoji out of the heading and the count", () => {
    render(<CategoryHeader category="Frys" count={2} />);
    expect(screen.getByRole("heading")).toHaveTextContent(/^Frys$/);
    expect(screen.getByText("2 varor")).toHaveTextContent(/^2 varor$/);
  });

  it.each(Object.entries(categoryTiles) as [CategoryName, (typeof categoryTiles)[CategoryName]][])(
    "%s has its icon and tile",
    (category, { icon, tile }) => {
      render(<CategoryHeader category={category} count={4} />);
      expect(screen.getByRole("heading", { level: 2, name: category })).toBeInTheDocument();
      const plate = screen.getByTestId("category-tile");
      expect(plate).toHaveTextContent(icon);
      expect(plate).toHaveClass(tile);
    },
  );
});
