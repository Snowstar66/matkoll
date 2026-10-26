import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FilterPills } from "./filter-pills";

const options = [
  { value: "all", label: "Alla" },
  { value: "favorites", label: "Favoriter" },
  { value: "cookable", label: "Kan lagas nu" },
] as const;

type Value = (typeof options)[number]["value"];

function Harness({ onChange }: { onChange?: (value: Value) => void }) {
  const [value, setValue] = useState<Value>("all");
  return (
    <>
      <button type="button">Före</button>
      <FilterPills
        label="Filter"
        options={options}
        value={value}
        onChange={(next) => {
          onChange?.(next);
          setValue(next);
        }}
      />
    </>
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });

describe("FilterPills", () => {
  it("is a radio group with exactly one chosen option", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Filter" })).toBeInTheDocument();
    expect(radio("Alla")).toBeChecked();
    await user.click(radio("Favoriter"));
    expect(radio("Favoriter")).toBeChecked();
    expect(radio("Alla")).not.toBeChecked();
    expect(screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("puts only the chosen pill in the tab order", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Före" }));
    await user.tab();
    expect(radio("Alla")).toHaveFocus();
    expect(radio("Favoriter")).toHaveAttribute("tabindex", "-1");
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("moves the choice with the arrow keys, wrapping, and with Home/End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    radio("Alla").focus();
    await user.keyboard("{ArrowRight}");
    expect(radio("Favoriter")).toBeChecked();
    expect(radio("Favoriter")).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(radio("Alla")).toBeChecked();
    await user.keyboard("{ArrowLeft}");
    expect(radio("Kan lagas nu")).toBeChecked();
    await user.keyboard("{Home}");
    expect(radio("Alla")).toHaveFocus();
    await user.keyboard("{End}");
    expect(radio("Kan lagas nu")).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("cookable");
  });

  it("does not report a change when the chosen pill is tapped again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(radio("Alla"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports nothing while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterPills label="Filter" options={options} value="all" onChange={onChange} disabled />);
    for (const pill of screen.getAllByRole("radio")) expect(pill).toBeDisabled();
    await user.click(radio("Favoriter"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
