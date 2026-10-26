import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TrashButton } from "./trash-button";

describe("TrashButton", () => {
  it("is a 44 px button named by the caller, with a hidden grey line icon", () => {
    render(<TrashButton label="Ta bort Gräddfil" onPress={() => {}} />);
    const button = screen.getByRole("button", { name: "Ta bort Gräddfil" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("size-tap", "text-ink-3", "rounded-md", "enabled:hover:bg-hairline", "enabled:active:bg-hairline");
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("removes at once on a press, without asking", () => {
    const onPress = vi.fn();
    render(<TrashButton label="Ta bort Gräddfil" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Gräddfil" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does nothing when disabled", () => {
    const onPress = vi.fn();
    render(<TrashButton label="Ta bort Gräddfil" onPress={onPress} disabled />);
    const button = screen.getByRole("button", { name: "Ta bort Gräddfil" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("passes a ref and data attributes through, so focus can move to it", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<TrashButton ref={ref} label="Ta bort Ägg" onPress={() => {}} data-pantry-trash="1" className="ml-1" />);
    const button = screen.getByRole("button", { name: "Ta bort Ägg" });
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute("data-pantry-trash", "1");
    expect(button).toHaveClass("ml-1", "size-tap");
    ref.current?.focus();
    expect(button).toHaveFocus();
  });
});
