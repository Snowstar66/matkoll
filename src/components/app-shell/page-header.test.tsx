import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

// PageHeader (Story 1.3, 11.6): the title, and for a page under a tab a visible
// "Tillbaka" with an arrow, since Matkoll on the home screen has no browser
// back button (AD-27).

describe("PageHeader", () => {
  it("has the title as the page's heading and no Tillbaka without backHref", () => {
    render(<PageHeader title="Recept" />);
    expect(screen.getByRole("heading", { level: 1, name: "Recept" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tillbaka" })).not.toBeInTheDocument();
  });

  it("has a Tillbaka with an arrow and text to the page above, 44 px at least, at every width", () => {
    render(<PageHeader title="Tidigare matsedlar" backHref="/matsedel" />);
    const back = screen.getByRole("link", { name: "Tillbaka" });
    expect(back).toHaveAttribute("href", "/matsedel");
    expect(back).toHaveTextContent(/^Tillbaka$/);
    expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(back).toHaveClass("min-h-tap", "min-w-tap");
    expect(back.className).not.toMatch(/\bhidden\b/);
  });

  it("keeps Tillbaka inside the header's air at the top, never pulled above the screen", () => {
    render(<PageHeader title="Hjälp och tips" backHref="/recept" backLabel="Recept" />);
    const back = screen.getByRole("link", { name: "Recept" });
    expect(back).toHaveClass("-mt-1");
    expect(back.className).not.toMatch(/-mt-tap\b/);
  });
});
