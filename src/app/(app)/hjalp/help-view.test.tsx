import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpView } from "./help-view";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Hjälp och tips (Story 19.2, sista varvet): opened from Förråd it lands on Förråd's section with its
// chip chosen and in sight, and the chips are the Chip of Story 19.3.

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("HelpView", () => {
  it("chooses the chip of the tab it was opened from and scrolls the chip row to it", () => {
    window.history.replaceState(null, "", "/hjalp#forrad");
    Element.prototype.scrollIntoView = vi.fn();
    // jsdom lays nothing out: the row is 350 px wide, Förråd's chip sits at 400–480 px and the others inside it.
    const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 32, width: right - left, height: 32, x: left, y: 0, toJSON: () => ({}) });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.tagName === "UL") return box(0, 350);
      return this.textContent === "Förråd" ? box(400, 480) : box(0, 80);
    });
    render(<HelpView />);
    const chip = screen.getByRole("button", { name: "Förråd" });
    expect(chip).toHaveAttribute("aria-current", "true");
    expect(chip).toHaveClass("bg-accent");
    expect(chip.closest("ul")!.scrollLeft).toBe(130);
    expect(screen.getByRole("link", { name: "Förråd" })).toHaveAttribute("href", "/prylar");
  });
});
