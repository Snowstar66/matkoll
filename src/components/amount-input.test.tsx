import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AmountInput } from "./amount-input";

const base = { id: "a", value: "2", onChange: vi.fn(), onStep: vi.fn(), canStepDown: true, canStepUp: true };

describe("AmountInput (Story 19.5)", () => {
  it("has − n + for a counted unit, and the number can be typed", () => {
    const onChange = vi.fn();
    const onStep = vi.fn();
    render(<AmountInput {...base} stepper onChange={onChange} onStep={onStep} />);
    fireEvent.click(screen.getByRole("button", { name: "Öka" }));
    expect(onStep).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Minska" }));
    expect(onStep).toHaveBeenLastCalledWith(-1);
    fireEvent.change(screen.getByRole("textbox", { name: "Mängd" }), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith("5");
  });

  it("disables the buttons the caller says cannot step", () => {
    render(<AmountInput {...base} stepper canStepDown={false} />);
    expect(screen.getByRole("button", { name: "Minska" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Öka" })).toBeEnabled();
  });

  it("is a field with the unit after it for a measure, without − and +", () => {
    render(<AmountInput {...base} stepper={false} unit="dl" />);
    expect(screen.queryByRole("button", { name: "Öka" })).toBeNull();
    expect(screen.getByTestId("amount-unit")).toHaveTextContent("dl");
  });

  it("is as wide as its content, also in a column of fields where it would stretch", () => {
    const { container, rerender } = render(<AmountInput {...base} stepper />);
    expect(container.firstElementChild).toHaveClass("w-fit");
    rerender(<AmountInput {...base} stepper={false} unit="dl" />);
    expect(container.firstElementChild).toHaveClass("w-fit");
  });
});
