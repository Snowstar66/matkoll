import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecipeImage } from "./recipe-image";

const src = "https://www.koket.se/bild.jpg";
const image = (container: HTMLElement) => container.querySelector("img");

describe("RecipeImage", () => {
  it("loads the address without a referrer (AD-15)", () => {
    const { container } = render(<RecipeImage src={src} />);
    expect(image(container)).toHaveAttribute("src", src);
    expect(image(container)).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.queryByTestId("recipe-image-placeholder")).not.toBeInTheDocument();
  });

  it("shows the placeholder when the image cannot be loaded", () => {
    const { container } = render(<RecipeImage src={src} />);
    fireEvent.error(image(container)!);
    expect(image(container)).toBeNull();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeInTheDocument();
  });

  it("shows the placeholder without an address", () => {
    const { container } = render(<RecipeImage src={null} />);
    expect(image(container)).toBeNull();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeInTheDocument();
  });
});
