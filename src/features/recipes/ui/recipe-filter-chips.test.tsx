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
