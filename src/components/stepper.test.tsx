import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./stepper";

function Harness({ start }: { start: number }) {
  const [value, setValue] = useState(start);
  return <Stepper value={value} onChange={setValue} />;
}

describe("Stepper", () => {
  it("steps by 1 with − and +", async () => {
    const user = userEvent.setup();
    render(<Harness start={4} />);
    await user.click(screen.getByRole("button", { name: "Fler portioner" }));
    expect(screen.getByText("5 portioner")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Färre portioner" }));
    await user.click(screen.getByRole("button", { name: "Färre portioner" }));
    expect(screen.getByText("3 portioner")).toBeInTheDocument();
  });

  it("never goes below 1", async () => {
    const user = userEvent.setup();
    render(<Harness start={2} />);
    const fewer = screen.getByRole("button", { name: "Färre portioner" });
    await user.click(fewer);
    expect(screen.getByText("1 portion")).toBeInTheDocument();
    expect(fewer).toHaveAttribute("aria-disabled", "true");
    await user.click(fewer);
    expect(screen.getByText("1 portion")).toBeInTheDocument();
  });

  it("shows a value below the floor as the floor and steps up from there", async () => {
    const user = userEvent.setup();
    for (const bad of [0, -3, Number.NaN]) {
      const onChange = vi.fn();
      const { unmount } = render(<Stepper value={bad} onChange={onChange} />);
      expect(screen.getByText("1 portion")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Färre portioner" })).toHaveAttribute("aria-disabled", "true");
      await user.click(screen.getByRole("button", { name: "Fler portioner" }));
      expect(onChange).toHaveBeenCalledWith(2);
      unmount();
    }
  });

  it("treats a min below 1 as 1", async () => {
    const user = userEvent.setup();
    function Low() {
      const [value, setValue] = useState(1);
      return <Stepper value={value} onChange={setValue} min={0} format={(n) => `${n} st`} />;
    }
    render(<Low />);
    await user.click(screen.getByRole("button", { name: "Färre portioner" }));
    expect(screen.getByText("1 st")).toBeInTheDocument();
  });
});
