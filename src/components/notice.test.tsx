import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Notice } from "./notice";

describe("Notice", () => {
  it("has no close button unless it can be dismissed", () => {
    render(<Notice>Hej</Notice>);
    expect(screen.queryByRole("button", { name: "Stäng" })).not.toBeInTheDocument();
  });

  it("closes with the button Stäng", async () => {
    const onDismiss = vi.fn();
    render(<Notice onDismiss={onDismiss}>Hej</Notice>);
    const button = screen.getByRole("button", { name: "Stäng" });
    expect(button).toHaveClass("min-h-tap", "min-w-tap");
    await userEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
