import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitChoice, UnitList } from "./unit-choice";

const units = ["g", "kg", "dl", "st", "förp", "kruka", "klyfta"] as const;

describe("UnitChoice (Story 19.5)", () => {
  it("shows st, förp, kruka, klyfta, g and Fler ›, with no select", () => {
    const { container } = render(<UnitChoice units={units} value="st" onChange={vi.fn()} />);
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getAllByRole("radio").map((chip) => chip.textContent)).toEqual(["st", "förp", "kruka", "klyfta", "g"]);
    expect(screen.getByRole("radio", { name: "st" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Fler ›" })).toBeInTheDocument();
  });

  it("shows a chosen unit that is not among them as a chip of its own", () => {
    render(<UnitChoice units={units} value="dl" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "dl" })).toBeChecked();
  });

  it("chooses a chip, and clears the unit on a second tap", () => {
    const onChange = vi.fn();
    render(<UnitChoice units={units} value="st" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "g" }));
    expect(onChange).toHaveBeenLastCalledWith("g");
    fireEvent.click(screen.getByRole("radio", { name: "st" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("asks for a step in with Fler ›, or expands in place without one", () => {
    const onMore = vi.fn();
    const { rerender } = render(<UnitChoice units={units} value="" onChange={vi.fn()} onMore={onMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Fler ›" }));
    expect(onMore).toHaveBeenCalled();
    rerender(<UnitChoice units={units} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fler ›" }));
    expect(screen.getAllByRole("radio")).toHaveLength(units.length);
    expect(screen.queryByRole("button", { name: "Fler ›" })).toBeNull();
  });
});

describe("UnitList", () => {
  it("lists Ingen enhet and every unit as rows with a check", () => {
    const onChange = vi.fn();
    render(<UnitList units={units} value="kg" onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(units.length + 1);
    expect(screen.getByRole("radio", { name: "kg" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Ingen enhet" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
