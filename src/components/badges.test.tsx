import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./badges";

// The badge on a recipe image (Story 11.5) uses exactly the pairs that
// tests/design/contrast.test.ts checks on --overlay in light and dark mode:
// mint-ink and sky-ink at 4.5:1 over any photo.

describe("StatusBadge", () => {
  it.each([
    ["ok", "Kan lagas nu", "bg-mint", "text-mint-ink"],
    ["missing", "Saknar 2 varor", "bg-sky", "text-sky-ink"],
  ] as const)("%s: %s in its status colours", (status, text, background, color) => {
    render(<StatusBadge status={status}>{text}</StatusBadge>);
    expect(screen.getByText(text)).toHaveClass(background, color);
  });

  it.each([
    ["ok", "Kan lagas nu", "text-mint-ink"],
    ["missing", "Saknar 2 varor", "text-sky-ink"],
  ] as const)("%s on an image: %s as status-coloured text on the overlay plate", (status, text, color) => {
    render(
      <StatusBadge status={status} onImage>
        {text}
      </StatusBadge>,
    );
    const badge = screen.getByText(text);
    expect(badge).toHaveClass("bg-overlay", color);
    expect(badge).not.toHaveClass("bg-mint");
    expect(badge).not.toHaveClass("bg-sky");
  });
});
