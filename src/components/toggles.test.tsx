import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CheckCircle } from "./check-circle";
import { HeartToggle } from "./heart-toggle";

describe("HeartToggle", () => {
  it("has a name and an on/off state for screen readers", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [on, setOn] = useState(false);
      return <HeartToggle pressed={on} onPressedChange={setOn} />;
    }
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Favorit", pressed: false })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Favorit" }));
    expect(screen.getByRole("button", { name: "Favorit", pressed: true })).toBeInTheDocument();
  });

  it("sits beside the row link and toggles without following it", async () => {
    const user = userEvent.setup();
    const onLinkClick = vi.fn();
    function Row() {
      const [on, setOn] = useState(false);
      return (
        <div className="relative flex">
          <a href="/recept/1" onClick={onLinkClick} className="flex-1 after:absolute after:inset-0">
            Krämig kycklinggryta
          </a>
          <HeartToggle pressed={on} onPressedChange={setOn} className="relative z-10" />
        </div>
      );
    }
    render(<Row />);
    const heart = screen.getByRole("button", { name: "Favorit" });
    expect(heart.closest("a")).toBeNull();
    await user.click(heart);
    expect(screen.getByRole("button", { name: "Favorit", pressed: true })).toBeInTheDocument();
    expect(onLinkClick).not.toHaveBeenCalled();
  });
});

describe("CheckCircle", () => {
  it("is a checkbox with the item as name and ticked / not ticked as state", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [checked, setChecked] = useState(false);
      return <CheckCircle checked={checked} onCheckedChange={setChecked} label="Paprika, röd, 1 st" />;
    }
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Paprika, röd, 1 st" });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
    box.focus();
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
  });

  it("has a 44 px tap area around the 26 px circle", () => {
    render(<CheckCircle checked={false} onCheckedChange={() => {}} label="Mjölk" />);
    const box = screen.getByRole("checkbox", { name: "Mjölk" });
    expect(box.className).toContain("size-tap");
    expect(box.firstElementChild?.className).toContain("size-[26px]");
  });
});
