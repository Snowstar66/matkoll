import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceRows } from "./choice-rows";

const options = [
  { value: "a", label: "Måndag" },
  { value: "b", label: "Tisdag", detail: "2 rätter" },
  { value: "c", label: "Onsdag" },
];

describe("ChoiceRows (Story 19.5)", () => {
  it("is a radio group where only the chosen row has a check and is in the tab order", () => {
    render(<ChoiceRows label="Dag" options={options} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Dag" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Tisdag/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Tisdag/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Måndag" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: /Tisdag/ }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Måndag" }).querySelector("svg")).toBeNull();
    // No background on the chosen row.
    expect(screen.getByRole("radio", { name: /Tisdag/ }).className).not.toMatch(/\bbg-/);
  });

  it("chooses on a tap and with the arrow keys", () => {
    const onChange = vi.fn();
    render(<ChoiceRows label="Dag" options={options} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Onsdag" }));
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Måndag" }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("b");
  });

  it("acts at once with kind=action, without radios or checks", () => {
    const onChange = vi.fn();
    render(<ChoiceRows kind="action" label="Kopiera till" options={options} value={null} onChange={onChange} />);
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tisdag/ }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
