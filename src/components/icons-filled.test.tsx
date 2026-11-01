import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoxFilledIcon, CarrotFilledIcon, CartFilledIcon, MealPlanFilledIcon, RecipesFilledIcon } from "./icons-filled";

const icons = { RecipesFilledIcon, MealPlanFilledIcon, CartFilledIcon, CarrotFilledIcon, BoxFilledIcon };

describe("filled tab icons (ikoner.html B)", () => {
  it.each(Object.entries(icons))("%s is a hidden 24 px-grid icon with a solid part", (_name, Icon) => {
    const { container } = render(<Icon size={22} className="text-accent" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("width", "22");
    expect(svg).toHaveAttribute("stroke-width", "1.8");
    expect(svg).toHaveClass("text-accent");
    expect(svg?.querySelector('[fill="currentColor"]')).toBeInTheDocument();
  });

  it("gives each cut-out mask its own id, so two icons on one page never share one", () => {
    const { container } = render(
      <>
        <MealPlanFilledIcon />
        <MealPlanFilledIcon />
        <CarrotFilledIcon />
        <BoxFilledIcon />
      </>,
    );
    const ids = [...container.querySelectorAll("mask")].map((mask) => mask.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(container.querySelector(`[mask="url(#${id})"]`)).toBeInTheDocument();
  });
});
