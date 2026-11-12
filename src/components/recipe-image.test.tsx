import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DISH_KINDS } from "@/lib/dish-kind";
import { DishArt } from "./dish-art";
import { RecipeImage } from "./recipe-image";

const src = "https://www.koket.se/bild.jpg";
const image = (container: HTMLElement) => container.querySelector("img");
const drawing = () => screen.getByTestId("recipe-illustration");

describe("RecipeImage", () => {
  it("loads the address without a referrer (AD-15), and draws nothing", () => {
    const { container } = render(<RecipeImage src={src} title="Fiskgratäng" />);
    expect(image(container)).toHaveAttribute("src", src);
    expect(image(container)).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.queryByTestId("recipe-image-placeholder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recipe-illustration")).not.toBeInTheDocument();
  });

  it("shows the app's own copy from its route (a thumbnail or the full size) the same way", () => {
    const own = "/api/recipe-image/66666666-6666-4666-8666-666666666666/thumb";
    const { container } = render(<RecipeImage src={own} title="Fiskgratäng" className="h-card-image" />);
    expect(image(container)).toHaveAttribute("src", own);
    expect(image(container)).toHaveClass("size-full", "object-cover");
    // The box has the caller's size, so the layout is the same before and after the image loads.
    expect(container.firstElementChild).toHaveClass("h-card-image");
  });

  it("falls back to the drawing when the app's own copy cannot be read (a 404 from the route)", () => {
    const own = "/api/recipe-image/66666666-6666-4666-8666-666666666666/full";
    const { container } = render(<RecipeImage src={own} title="Fiskgratäng" />);
    fireEvent.error(image(container)!);
    expect(image(container)).toBeNull();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeInTheDocument();
  });

  it("shows the drawing when the image cannot be loaded", () => {
    const { container } = render(<RecipeImage src={src} title="Fiskgratäng" />);
    fireEvent.error(image(container)!);
    expect(image(container)).toBeNull();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeInTheDocument();
    expect(drawing()).toHaveAttribute("data-dish", "gratang");
  });

  it("draws the dish from the title without an address, on the plate in its tone, hidden from a screen reader (UX-13b)", () => {
    const { container } = render(<RecipeImage src={null} title="Lax med dillpotatis" artSize={44} />);
    expect(image(container)).toBeNull();
    expect(drawing()).toHaveAttribute("data-dish", "fisk");
    expect(drawing()).toHaveAttribute("aria-hidden", "true");
    expect(drawing()).toHaveAttribute("width", "44");
    expect(screen.getByTestId("recipe-image-placeholder").parentElement).toHaveClass("bg-mint");
    expect(container.textContent).toBe("");
  });

  it("draws the given kind over the title's", () => {
    render(<RecipeImage src={null} title="Fredagsmys" dish="kott" />);
    expect(drawing()).toHaveAttribute("data-dish", "kott");
    expect(screen.getByTestId("recipe-image-placeholder").parentElement).toHaveClass("bg-mint");
  });

  it("draws a plate when nothing names a kind", () => {
    render(<RecipeImage src={null} />);
    expect(drawing()).toHaveAttribute("data-dish", "tallrik");
    expect(screen.getByTestId("recipe-image-placeholder").parentElement).toHaveClass("bg-mint");
  });
});

describe("DishArt", () => {
  it.each(DISH_KINDS)("draws %s in the green line with one warm detail", (dish) => {
    const { container } = render(<DishArt dish={dish} size={88} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("text-accent");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(1);
    expect(svg.querySelectorAll("path.stroke-warm").length).toBeGreaterThan(0);
  });

  it("keeps the line about 2 px on screen at any size", () => {
    const { container, rerender } = render(<DishArt dish="pasta" size={88} />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke-width", "1.89");
    rerender(<DishArt dish="pasta" size={36} />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke-width", "3.56");
  });
});
