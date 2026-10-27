import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryHeader } from "./category-header";
import { ListGroup } from "./list-group";
import { ListRow } from "./list-row";
import { focusAfterRemoval, TrashButton, trashPressGuardMs } from "./trash-button";

// Every bin shares one guard clock; each test starts well after the last press.
let clock = 0;
beforeEach(() => {
  clock += 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("TrashButton", () => {
  it("is a 44 px button named by the caller, with a hidden grey line icon and an inset focus ring", () => {
    render(<TrashButton label="Ta bort Gräddfil" onPress={() => {}} />);
    const button = screen.getByRole("button", { name: "Ta bort Gräddfil" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass(
      "size-tap",
      "text-ink-3",
      "rounded-md",
      "enabled:hover:bg-hairline",
      "enabled:active:bg-hairline",
      "focus-visible:-outline-offset-2",
    );
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("removes at once on a press, without asking, and gets the bin", () => {
    const onPress = vi.fn();
    render(<TrashButton label="Ta bort Gräddfil" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Ta bort Gräddfil" });
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(button, { pointer: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores a second pointer press on any bin within the guard, and takes one after it", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <TrashButton label="Ta bort Gräddfil" onPress={first} />
        <TrashButton label="Ta bort Ägg" onPress={second} />
      </>,
    );
    // A tap: a click with a pointer has a detail.
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Gräddfil" }), { detail: 1 });
    expect(first).toHaveBeenCalledWith(screen.getByRole("button", { name: "Ta bort Gräddfil" }), { pointer: true });
    clock += trashPressGuardMs - 1;
    // The next row's bin has slid under the finger.
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Ägg" }), { detail: 1 });
    expect(second).not.toHaveBeenCalled();
    clock += 1;
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Ägg" }), { detail: 1 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("never ignores a press from the keyboard or a screen reader, also right after a tap", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <TrashButton label="Ta bort Gräddfil" onPress={first} />
        <TrashButton label="Ta bort Ägg" onPress={second} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Gräddfil" }), { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Ägg" }), { detail: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Ta bort Ägg" }), { detail: 0 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenLastCalledWith(screen.getByRole("button", { name: "Ta bort Ägg" }), { pointer: false });
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

function Page({ dairy, meat }: { dairy: string[]; meat: string[] }) {
  return (
    <main>
      <h1>Lagersaldo</h1>
      {(
        [
          ["mejeri", "Mejeri & ägg", dairy],
          ["kott", "Kött, fisk & chark", meat],
        ] as const
      ).map(([id, category, names]) =>
        names.length > 0 ? (
          <div key={id}>
            <CategoryHeader id={id} category={category} count={names.length} />
            <ListGroup labelledBy={id}>
              {names.map((name) => (
                <ListRow key={name} title={name} trailing={<TrashButton label={`Ta bort ${name}`} onPress={() => {}} />} />
              ))}
            </ListGroup>
          </div>
        ) : null,
      )}
    </main>
  );
}

const bin = (name: string) => screen.getByRole("button", { name: `Ta bort ${name}` });

describe("focusAfterRemoval", () => {
  it("moves to the next bin, also in the next category", () => {
    render(<Page dairy={["Mjölk", "Ägg"]} meat={["Lax"]} />);
    focusAfterRemoval(bin("Mjölk"));
    expect(bin("Ägg")).toHaveFocus();
    focusAfterRemoval(bin("Ägg"));
    expect(bin("Lax")).toHaveFocus();
  });

  it("moves to the previous bin after the last one, also when given the row", () => {
    render(<Page dairy={["Mjölk", "Ägg"]} meat={[]} />);
    focusAfterRemoval(bin("Ägg").closest("li"));
    expect(bin("Mjölk")).toHaveFocus();
  });

  it("moves to the category heading when the row was the only one and the heading stays", async () => {
    const { rerender } = render(<Page dairy={["Mjölk"]} meat={[]} />);
    focusAfterRemoval(bin("Mjölk"));
    rerender(
      <main>
        <h1>Lagersaldo</h1>
        <CategoryHeader id="mejeri" category="Mejeri & ägg" count={0} />
      </main>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Mejeri & ägg" })).toHaveFocus());
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1");
  });

  it("moves to the page heading when the category is gone too", async () => {
    const { rerender } = render(<Page dairy={["Mjölk"]} meat={[]} />);
    focusAfterRemoval(bin("Mjölk"));
    rerender(<Page dairy={[]} meat={[]} />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Lagersaldo" })).toHaveFocus());
  });

  it("does nothing without an element", () => {
    expect(() => focusAfterRemoval(null)).not.toThrow();
  });
});
