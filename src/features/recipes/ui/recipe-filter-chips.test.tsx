import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecipeFilterChips } from "./recipe-filter-chips";

describe("RecipeFilterChips, Nyttigt", () => {
  const props = { filter: "all" as const, onFilterChange: vi.fn(), category: null, onCategoryChange: vi.fn() };

  it("has no Nyttigt chip unless the page asks for it", () => {
    render(<RecipeFilterChips {...props} />);
    expect(screen.queryByRole("button", { name: "Nyttigt" })).not.toBeInTheDocument();
  });

  it("puts Nyttigt after Kan lagas nu, and pressing it chooses the filter", async () => {
    const onFilterChange = vi.fn();
    render(<RecipeFilterChips {...props} onFilterChange={onFilterChange} withHealthy />);
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(names.indexOf("Nyttigt")).toBe(names.indexOf("Kan lagas nu") + 1);
    await userEvent.click(screen.getByRole("button", { name: "Nyttigt" }));
    expect(onFilterChange).toHaveBeenCalledWith("healthy");
  });

  it("lets go of the chosen Nyttigt", async () => {
    const onFilterChange = vi.fn();
    render(<RecipeFilterChips {...props} filter="healthy" onFilterChange={onFilterChange} withHealthy />);
    expect(screen.getByRole("button", { name: "Nyttigt" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Nyttigt" }));
    expect(onFilterChange).toHaveBeenCalledWith("all");
  });
});

describe("RecipeFilterChips, <500 kcal", () => {
  const props = { filter: "all" as const, onFilterChange: vi.fn(), category: null, onCategoryChange: vi.fn() };

  it("has no <500 kcal chip unless the page asks for it", () => {
    render(<RecipeFilterChips {...props} withHealthy withOffers />);
    expect(screen.queryByRole("button", { name: "<500 kcal" })).not.toBeInTheDocument();
  });

  it("puts the chip after Nyttigt and before Erbjudanden; pressing chooses and lets go", async () => {
    const onFilterChange = vi.fn();
    const { rerender } = render(<RecipeFilterChips {...props} onFilterChange={onFilterChange} withHealthy withKcal withOffers />);
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(names.indexOf("<500 kcal")).toBe(names.indexOf("Nyttigt") + 1);
    expect(names.indexOf("Erbjudanden")).toBe(names.indexOf("<500 kcal") + 1);
    await userEvent.click(screen.getByRole("button", { name: "<500 kcal" }));
    expect(onFilterChange).toHaveBeenCalledWith("kcal");
    rerender(<RecipeFilterChips {...props} filter="kcal" onFilterChange={onFilterChange} withKcal />);
    expect(screen.getByRole("button", { name: "<500 kcal" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "<500 kcal" }));
    expect(onFilterChange).toHaveBeenLastCalledWith("all");
  });
});

describe("RecipeFilterChips, Alla", () => {
  it("is first and pressed when nothing is chosen", () => {
    render(<RecipeFilterChips filter="all" onFilterChange={vi.fn()} category={null} onCategoryChange={vi.fn()} />);
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(names[0]).toBe("Alla");
    expect(screen.getByRole("button", { name: "Alla" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is not pressed with a filter or a category chosen, and pressing it clears both", async () => {
    const onFilterChange = vi.fn();
    const onCategoryChange = vi.fn();
    const { rerender } = render(<RecipeFilterChips filter="favorites" onFilterChange={onFilterChange} category={null} onCategoryChange={onCategoryChange} />);
    expect(screen.getByRole("button", { name: "Alla" })).toHaveAttribute("aria-pressed", "false");
    rerender(<RecipeFilterChips filter="all" onFilterChange={onFilterChange} category="soup" onCategoryChange={onCategoryChange} />);
    expect(screen.getByRole("button", { name: "Alla" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Alla" }));
    expect(onFilterChange).toHaveBeenCalledWith("all");
    expect(onCategoryChange).toHaveBeenCalledWith(null);
  });
});
