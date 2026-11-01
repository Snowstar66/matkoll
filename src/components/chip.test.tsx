import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./chip";
import { Segment } from "./segment";

describe("Chip", () => {
  it("is filled accent with 600 text when selected, quiet surface when not", () => {
    render(
      <>
        <Chip selected aria-pressed>
          Kött
        </Chip>
        <Chip selected={false} aria-pressed={false}>
          Fågel
        </Chip>
      </>,
    );
    expect(screen.getByRole("button", { name: "Kött", pressed: true })).toHaveClass("bg-accent", "text-on-accent", "font-semibold");
    expect(screen.getByRole("button", { name: "Fågel", pressed: false })).toHaveClass("bg-surface", "border-border", "font-medium", "h-8");
  });

  it("has its text once, so a name lookup finds one element", () => {
    render(<Chip selected={false}>Fågel</Chip>);
    expect(screen.getAllByText("Fågel")).toHaveLength(1);
  });
});

describe("Segment", () => {
  const options = [
    { value: "a", label: "Kort" },
    { value: "b", label: "Lista" },
    { value: "c", label: "Rad" },
  ] as const;

  it("is a radio group on a track with a white plate on the chosen one", () => {
    render(<Segment label="Vy" options={options} value="a" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Vy" })).toHaveClass("bg-seg-track");
    expect(screen.getByRole("radio", { name: "Kort" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Kort" })).toHaveClass("bg-seg-on", "font-semibold", "h-10");
    expect(screen.getByRole("radio", { name: "Lista" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves with the arrow keys, wrapping, and Home/End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segment label="Vy" options={options} value="a" onChange={onChange} />);
    screen.getByRole("radio", { name: "Kort" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Kort" })).toHaveFocus();
  });

  it("names an icon-only segment with its label", () => {
    render(<Segment size="small" label="Vy" options={[{ value: "a", label: "Kort", icon: <i />, iconOnly: true }]} value="a" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Kort" })).toHaveClass("h-7", "w-9");
  });
});
